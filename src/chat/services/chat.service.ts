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
import { GeminiService } from './gemini.service';

export interface ChatResponse {
  sessionId: number;
  message: string;
  currentState: string;
  slots: Record<string, any>;
  itineraryData?: any;
  advisoryData?: any;
  isComplete: boolean;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly MAX_HISTORY_MESSAGES = 20; // Limit context window
  private readonly SESSION_EXPIRY_HOURS = 24;

  constructor(
    private prisma: PrismaService,
    private itineraryAgent: ItineraryAgentService,
    private personalAssistant: PersonalAssistantService,
    private geminiService: GeminiService,
  ) {}

  // =============================================
  // Session Management
  // =============================================

  /**
   * Create a new chat session for a user.
   */
  async createSession(userId: number, agentType: AiAgentType, title?: string): Promise<any> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.SESSION_EXPIRY_HOURS);

    const session = await this.prisma.aiChatSession.create({
      data: {
        user_id: userId,
        agent_type: agentType,
        status: AiSessionStatus.active,
        current_state: 'init',
        slots: {},
        title: title || this.getDefaultTitle(agentType),
        expires_at: expiresAt,
      },
    });

    // Generate greeting message
    const greeting = await this.processInitialMessage(session.id, agentType);

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
    // Load session and validate ownership
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    if (session.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }
    if (session.status === AiSessionStatus.expired) {
      throw new BadRequestException('This session has expired. Please start a new one.');
    }

    // Load conversation history BEFORE saving user message
    // This ensures history ends with model's last response (proper alternation).
    // If we save first, history includes the new user msg → Gemini sees
    // two consecutive 'user' turns when the agent sends its own prompt.
    const history = await this.loadConversationHistory(sessionId);

    // Now persist the user message
    await this.saveMessage(sessionId, AiMessageRole.user, message);

    // Route to appropriate agent
    const currentSlots = (session.slots as Record<string, any>) || {};
    let agentResponse: any;

    if (session.agent_type === AiAgentType.ITINERARY_GENERATOR) {
      agentResponse = await this.itineraryAgent.processMessage(
        session.current_state,
        currentSlots,
        message,
        history,
      );
    } else {
      agentResponse = await this.personalAssistant.processMessage(
        session.current_state,
        currentSlots,
        message,
        history,
      );
    }

    // Save assistant response
    await this.saveMessage(sessionId, AiMessageRole.assistant, agentResponse.text, {
      state: agentResponse.nextState,
      tokenCount: agentResponse.tokenCount,
    });

    // Update session state and slots
    const isComplete = agentResponse.nextState === 'complete' || agentResponse.nextState === 'followup';
    await this.prisma.aiChatSession.update({
      where: { id: sessionId },
      data: {
        current_state: agentResponse.nextState,
        slots: agentResponse.updatedSlots,
        status: isComplete ? AiSessionStatus.completed : AiSessionStatus.active,
      },
    });

    // If itinerary was generated, save it
    if (agentResponse.itineraryData) {
      await this.saveGeneratedItinerary(
        sessionId,
        userId,
        agentResponse.updatedSlots,
        agentResponse.itineraryData,
      );

      // Update session title to be more descriptive
      await this.prisma.aiChatSession.update({
        where: { id: sessionId },
        data: {
          title: `Trip to ${agentResponse.updatedSlots.destination || 'Unknown'}`,
        },
      });
    }

    return {
      sessionId,
      message: agentResponse.text,
      currentState: agentResponse.nextState,
      slots: agentResponse.updatedSlots,
      itineraryData: agentResponse.itineraryData || undefined,
      advisoryData: agentResponse.advisoryData || undefined,
      isComplete,
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
            destination: true,
            travel_style: true,
            budget: true,
            interests: true,
            itinerary_data: true,
            created_at: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    if (session.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    return {
      id: session.id,
      agentType: session.agent_type,
      status: session.status,
      currentState: session.current_state,
      slots: session.slots,
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
      generatedItinerary: session.generatedItinerary || null,
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

  /**
   * Process the initial greeting message when a session is created.
   */
  private async processInitialMessage(sessionId: number, agentType: AiAgentType): Promise<string> {
    let greeting: string;

    if (agentType === AiAgentType.ITINERARY_GENERATOR) {
      const result = await this.itineraryAgent.processMessage('init', {}, '', []);
      greeting = result.text;
      await this.prisma.aiChatSession.update({
        where: { id: sessionId },
        data: { current_state: result.nextState },
      });
    } else {
      const result = await this.personalAssistant.processMessage('init', {}, '', []);
      greeting = result.text;
      await this.prisma.aiChatSession.update({
        where: { id: sessionId },
        data: { current_state: result.nextState },
      });
    }

    // Save greeting as assistant message
    await this.saveMessage(sessionId, AiMessageRole.assistant, greeting);

    return greeting;
  }

  /**
   * Save a message to the database.
   */
  private async saveMessage(
    sessionId: number,
    role: AiMessageRole,
    content: string,
    metadata?: any,
  ) {
    await this.prisma.aiChatMessage.create({
      data: {
        session_id: sessionId,
        role,
        content,
        metadata: metadata || undefined,
        token_count: metadata?.tokenCount || undefined,
      },
    });
  }

  /**
   * Load conversation history formatted for Gemini API.
   * Gemini requires strict user/model alternation starting with 'user'.
   * If the conversation is long, summarize older messages to fit context window.
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

    // Filter out system messages and map roles
    const mapped = rawMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.content,
      }));

    // Enforce strict alternation: merge consecutive same-role messages
    // and ensure the history starts with 'user' (Gemini requirement)
    const alternated: { role: 'user' | 'model'; text: string }[] = [];
    for (const msg of mapped) {
      if (alternated.length === 0) {
        alternated.push(msg);
      } else if (alternated[alternated.length - 1].role === msg.role) {
        // Merge with previous same-role message
        alternated[alternated.length - 1].text += '\n' + msg.text;
      } else {
        alternated.push(msg);
      }
    }

    // Gemini requires first message to be 'user' — drop leading 'model' messages
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

  /**
   * Save the generated itinerary to the database.
   */
  private async saveGeneratedItinerary(
    sessionId: number,
    userId: number,
    slots: Record<string, any>,
    itineraryData: any,
  ) {
    try {
      await this.prisma.generatedItinerary.create({
        data: {
          session_id: sessionId,
          user_id: userId,
          destination: slots.destination || 'Unknown',
          travel_style: slots.travelStyle || null,
          budget: slots.budget || null,
          interests: Array.isArray(slots.interests) ? slots.interests : [],
          start_date: this.parseDateSafe(slots.dates, 'start'),
          end_date: this.parseDateSafe(slots.dates, 'end'),
          itinerary_data: itineraryData,
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to save itinerary: ${error.message}`);
      // Non-critical — don't throw, the user already has the response
    }
  }

  private parseDateSafe(dates: string | undefined, type: 'start' | 'end'): Date | null {
    if (!dates || dates === 'skipped' || dates === 'flexible') return null;
    try {
      // Simple parse — expects "YYYY-MM-DD to YYYY-MM-DD" format
      const parts = dates.split(/\s*to\s*/i);
      if (type === 'start' && parts[0]) return new Date(parts[0]);
      if (type === 'end' && parts[1]) return new Date(parts[1]);
    } catch {}
    return null;
  }

  private getDefaultTitle(agentType: AiAgentType): string {
    return agentType === AiAgentType.ITINERARY_GENERATOR
      ? 'New Itinerary'
      : 'New Travel Consultation';
  }
}
