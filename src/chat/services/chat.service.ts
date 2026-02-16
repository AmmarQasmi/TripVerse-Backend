import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AiAgentType, AiSessionStatus, AiMessageRole } from '@prisma/client';
import { Content } from '@google/generative-ai';
import { PrismaService } from '../../prisma/prisma.service';
import { ItineraryAgentService } from './itinerary-agent.service';
import { PersonalAssistantService } from './personal-assistant.service';
import { ItineraryService } from '../../itineraries/itinerary.service';

export interface ChatResponse {
  sessionId: number;
  message: string;
  context: Record<string, any>;
  previewData?: any;
  itineraryId?: number;
  isComplete: boolean;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly MAX_HISTORY_MESSAGES = 30;
  private readonly SESSION_EXPIRY_HOURS = 24;

  constructor(
    private prisma: PrismaService,
    private itineraryAgent: ItineraryAgentService,
    private personalAssistant: PersonalAssistantService,
    private itineraryService: ItineraryService,
  ) {}

  // =============================================
  // Session Management
  // =============================================

  /**
   * Create a new chat session for a user.
   */
  async createSession(userId: number, agentType: AiAgentType, title?: string) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.SESSION_EXPIRY_HOURS);

    const session = await this.prisma.aiChatSession.create({
      data: {
        user_id: userId,
        agent_type: agentType,
        status: AiSessionStatus.active,
        current_state: 'active',
        slots: {},
        title: title || this.getDefaultTitle(agentType),
        expires_at: expiresAt,
      },
    });

    // Generate greeting
    const greeting = agentType === AiAgentType.ITINERARY_GENERATOR
      ? this.itineraryAgent.getGreeting()
      : this.personalAssistant.getGreeting();

    // Save greeting as assistant message
    await this.saveMessage(session.id, AiMessageRole.assistant, greeting);

    return {
      session: {
        id: session.id,
        agentType: session.agent_type,
        status: session.status,
        title: session.title,
        createdAt: session.created_at,
      },
      greeting,
    };
  }

  /**
   * Send a message to an existing session.
   */
  async sendMessage(userId: number, sessionId: number, message: string): Promise<ChatResponse> {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Chat session not found');
    if (session.user_id !== userId) throw new ForbiddenException('You do not have access to this session');
    if (session.status === AiSessionStatus.expired) {
      throw new BadRequestException('This session has expired. Please start a new one.');
    }

    // Load history BEFORE saving user message (proper Gemini alternation)
    const history = await this.loadConversationHistory(sessionId);

    // Save user message
    await this.saveMessage(sessionId, AiMessageRole.user, message);

    // Get session context (replaces old "slots")
    const sessionContext = (session.slots as Record<string, any>) || {};

    // Route to agent
    let agentResponse: any;

    try {
      if (session.agent_type === AiAgentType.ITINERARY_GENERATOR) {
        agentResponse = await this.itineraryAgent.processMessage(
          message,
          history,
          sessionContext,
        );
      } else {
        agentResponse = await this.personalAssistant.processMessage(
          message,
          history,
          sessionContext,
        );
      }
    } catch (error: any) {
      this.logger.error(`Agent error: ${error.message}`, error.stack);
      // Return detailed error info so the user knows what happened
      const errorHint = error.message?.toLowerCase() || '';
      let userMessage = "I'm sorry, I ran into an issue processing your message. Could you try again in a moment?";

      if (errorHint.includes('rate limit') || errorHint.includes('quota') || errorHint.includes('429')) {
        userMessage = "I'm currently experiencing high demand. Please wait a minute and try again. 🙏";
      } else if (errorHint.includes('unavailable') || errorHint.includes('503')) {
        userMessage = "The AI service is temporarily unavailable. Please try again in a few seconds.";
      } else if (errorHint.includes('api key') || errorHint.includes('not initialized')) {
        userMessage = "There's a configuration issue on our end. Please contact support.";
      } else if (errorHint.includes('too long') || errorHint.includes('token')) {
        userMessage = "That conversation got quite long! Try starting a new chat session.";
      }

      agentResponse = {
        text: userMessage,
        context: sessionContext,
      };
    }

    // Save assistant response
    const assistantMsgId = await this.saveMessage(sessionId, AiMessageRole.assistant, agentResponse.text, {
      tokenCount: agentResponse.tokenCount,
      hasPreview: !!agentResponse.previewData,
    });

    // Update session context
    await this.prisma.aiChatSession.update({
      where: { id: sessionId },
      data: {
        slots: agentResponse.context,
        // Update title if destination was detected for the first time
        ...(agentResponse.context?.destination && !sessionContext.destination
          ? { title: `Trip to ${agentResponse.context.destination}` }
          : {}),
      },
    });

    // If preview was generated, save it as a new itinerary (status: preview)
    let itineraryId: number | undefined;
    if (agentResponse.previewData) {
      try {
        const itinerary = await this.itineraryService.createFromPreview(
          userId,
          sessionId,
          agentResponse.previewData,
          agentResponse.context,
        );
        itineraryId = itinerary.id;
        this.logger.log(`Saved preview itinerary ${itinerary.id} for session ${sessionId}`);

        // Update the assistant message metadata with the itinerary ID so it survives re-fetches
        await this.prisma.aiChatMessage.update({
          where: { id: assistantMsgId },
          data: { metadata: { tokenCount: agentResponse.tokenCount, hasPreview: true, itineraryId: itinerary.id } },
        });
      } catch (err: any) {
        this.logger.error(`Failed to save preview: ${err.message}`);
      }
    }

    return {
      sessionId,
      message: agentResponse.text,
      context: agentResponse.context,
      previewData: agentResponse.previewData || undefined,
      itineraryId,
      isComplete: false,
    };
  }

  /**
   * Get all sessions for a user.
   */
  async getUserSessions(userId: number, agentType?: AiAgentType) {
    const where: any = { user_id: userId };
    if (agentType) where.agent_type = agentType;

    const sessions = await this.prisma.aiChatSession.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      select: {
        id: true,
        agent_type: true,
        status: true,
        current_state: true,
        title: true,
        created_at: true,
        updated_at: true,
        _count: { select: { messages: true } },
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      agentType: s.agent_type,
      status: s.status,
      currentState: s.current_state,
      title: s.title,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      messageCount: s._count.messages,
    }));
  }

  /**
   * Get a single session with its messages.
   */
  async getSession(userId: number, sessionId: number) {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            created_at: true,
          },
        },
        generatedItinerary: {
          select: {
            id: true,
            title: true,
            destination: true,
            duration_days: true,
            travel_style: true,
            budget: true,
            status: true,
            preview_data: true,
            enriched_data: true,
            created_at: true,
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Chat session not found');
    if (session.user_id !== userId) throw new ForbiddenException('You do not have access to this session');

    return {
      id: session.id,
      agentType: session.agent_type,
      status: session.status,
      currentState: session.current_state,
      context: session.slots,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.created_at,
      })),
      generatedItinerary: session.generatedItinerary
        ? {
            id: session.generatedItinerary.id,
            title: session.generatedItinerary.title,
            destination: session.generatedItinerary.destination,
            durationDays: session.generatedItinerary.duration_days,
            travelStyle: session.generatedItinerary.travel_style,
            budget: session.generatedItinerary.budget,
            status: session.generatedItinerary.status,
            previewData: session.generatedItinerary.preview_data,
            enrichedData: session.generatedItinerary.enriched_data,
            createdAt: session.generatedItinerary.created_at,
          }
        : null,
    };
  }

  /**
   * Delete a session.
   */
  async deleteSession(userId: number, sessionId: number) {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Chat session not found');
    if (session.user_id !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.aiChatSession.delete({ where: { id: sessionId } });
    return { message: 'Session deleted successfully' };
  }

  // =============================================
  // Internal Helpers
  // =============================================

  private async saveMessage(
    sessionId: number,
    role: AiMessageRole,
    content: string,
    metadata?: any,
  ): Promise<number> {
    const msg = await this.prisma.aiChatMessage.create({
      data: {
        session_id: sessionId,
        role,
        content,
        metadata: metadata || undefined,
        token_count: metadata?.tokenCount || undefined,
      },
    });
    return msg.id;
  }

  /**
   * Load conversation history formatted for Gemini API.
   * Enforces strict user/model alternation starting with 'user'.
   */
  private async loadConversationHistory(sessionId: number): Promise<Content[]> {
    const totalCount = await this.prisma.aiChatMessage.count({
      where: { session_id: sessionId },
    });

    let rawMessages: { role: string; content: string }[];

    if (totalCount <= this.MAX_HISTORY_MESSAGES) {
      rawMessages = await this.prisma.aiChatMessage.findMany({
        where: { session_id: sessionId },
        orderBy: { created_at: 'asc' },
        select: { role: true, content: true },
      });
    } else {
      // Long conversation: summarize older, keep recent verbatim
      const recentCount = Math.floor(this.MAX_HISTORY_MESSAGES * 0.6);
      const olderMessages = await this.prisma.aiChatMessage.findMany({
        where: { session_id: sessionId },
        orderBy: { created_at: 'asc' },
        take: totalCount - recentCount,
        select: { role: true, content: true },
      });

      const recentMessages = await this.prisma.aiChatMessage.findMany({
        where: { session_id: sessionId },
        orderBy: { created_at: 'desc' },
        take: recentCount,
        select: { role: true, content: true },
      });

      const olderText = olderMessages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`)
        .join('\n');

      const summaryMsg = {
        role: 'user',
        content: `[Previous conversation summary]\n${olderText.slice(0, 1500)}\n[End summary]`,
      };

      rawMessages = [summaryMsg, ...recentMessages.reverse()];
    }

    // Map roles and enforce Gemini alternation
    const mapped = rawMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.content,
      }));

    // Merge consecutive same-role messages
    const alternated: { role: 'user' | 'model'; text: string }[] = [];
    for (const msg of mapped) {
      if (alternated.length === 0) {
        alternated.push(msg);
      } else if (alternated[alternated.length - 1].role === msg.role) {
        alternated[alternated.length - 1].text += '\n' + msg.text;
      } else {
        alternated.push(msg);
      }
    }

    // Gemini requires first message to be 'user'
    while (alternated.length > 0 && alternated[0].role === 'model') {
      alternated.shift();
    }

    return alternated.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));
  }

  /**
   * Expire stale sessions (called by scheduled job).
   */
  async expireStaleSessions(): Promise<number> {
    const result = await this.prisma.aiChatSession.updateMany({
      where: {
        status: AiSessionStatus.active,
        expires_at: { lt: new Date() },
      },
      data: { status: AiSessionStatus.expired },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale AI chat sessions`);
    }
    return result.count;
  }

  private getDefaultTitle(agentType: AiAgentType): string {
    return agentType === AiAgentType.ITINERARY_GENERATOR
      ? 'New Itinerary'
      : 'New Travel Consultation';
  }
}
