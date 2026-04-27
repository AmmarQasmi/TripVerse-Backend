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
  /** True if backend is generating full preview in background */
  pendingPreviewExpansion?: boolean;
  isComplete: boolean;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly MAX_HISTORY_MESSAGES = 30;
  private readonly SESSION_EXPIRY_HOURS = 24;
  private readonly MAX_HISTORY_TOKENS = 12000;

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

    // Idempotency / shaky-internet protection:
    // If the client re-sends the exact same message (e.g., due to cellular drop),
    // replay the last successful assistant response instead of calling Gemini again.
    // This preserves the exact user experience while avoiding duplicate token usage.
    const lastTwo = await this.prisma.aiChatMessage.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'desc' },
      take: 2,
      select: { role: true, content: true, metadata: true },
    });
    const last = lastTwo[0];
    const prev = lastTwo[1];
    const lastMeta = (last?.metadata || {}) as Record<string, any>;
    if (
      last?.role === AiMessageRole.assistant &&
      !lastMeta.isError &&
      prev?.role === AiMessageRole.user &&
      prev.content === message
    ) {
      let previewData: any | undefined;
      let itineraryId: number | undefined;

      if (lastMeta.itineraryId) {
        itineraryId = Number(lastMeta.itineraryId);
        const itin = await this.prisma.generatedItinerary.findUnique({
          where: { id: itineraryId },
          select: { preview_data: true },
        });
        previewData = itin?.preview_data as any;
      }

      return {
        sessionId,
        message: last.content,
        context: (session.slots as Record<string, any>) || {},
        ...(previewData ? { previewData } : {}),
        ...(itineraryId ? { itineraryId } : {}),
        isComplete: false,
      };
    }

    // Load history BEFORE saving user message (proper Gemini alternation)
    const history = await this.loadConversationHistory(sessionId);

    // Save user message
    await this.saveMessage(sessionId, AiMessageRole.user, message);

    // Get session context (replaces old "slots")
    const sessionContext = (session.slots as Record<string, any>) || {};

    // Route to agent
    let agentResponse: any;
    let assistantMetadata: any | undefined;
    let pendingPreviewExpansion = false;

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
      let userMessage = error.message || "I'm sorry, I ran into an issue processing your message. Could you try again in a moment?";

      if (errorHint.includes('rate limit') || errorHint.includes('quota') || errorHint.includes('429')) {
        userMessage = error.message || "I'm currently experiencing high demand. Please wait a minute and try again. 🙏";
      } else if (errorHint.includes('unavailable') || errorHint.includes('503')) {
        userMessage = error.message || "The AI service is temporarily unavailable. Please try again in a few seconds.";
      } else if (errorHint.includes('api key') || errorHint.includes('not initialized')) {
        userMessage = "There's a configuration issue on our end. Please contact support.";
      } else if (errorHint.includes('too long') || errorHint.includes('token')) {
        userMessage = "That conversation got quite long! Try starting a new chat session.";
      }

      const recoveredContext = this.recoverContextFromMessage(message, sessionContext, session.agent_type);

      agentResponse = {
        text: userMessage,
        context: recoveredContext,
      };
      assistantMetadata = { isError: true, errorHint };
    }

    // Save assistant response
    const assistantMsgId = await this.saveMessage(sessionId, AiMessageRole.assistant, agentResponse.text, {
      tokenCount: agentResponse.tokenCount,
      hasPreview: !!agentResponse.previewData,
      previewPhase: agentResponse.previewPhase,
      ...(assistantMetadata || {}),
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

    // If preview was generated:
    // - compact preview: start background expansion, do not persist preview_data yet (enrichment needs full preview)
    // - full preview: persist immediately
    let itineraryId: number | undefined;
    if (agentResponse.previewData) {
      if (agentResponse.previewPhase === 'compact') {
        pendingPreviewExpansion = true;
        // Fire-and-forget background expansion to full preview
        setImmediate(() => {
          this.expandCompactPreviewToFull({
            userId,
            sessionId,
            assistantMsgId,
            userMessage: message,
            history,
            sessionContext: agentResponse.context,
            tokenCount: agentResponse.tokenCount,
          }).catch((err: any) => {
            this.logger.error(`Background preview expansion failed: ${err.message}`);
          });
        });
      } else {
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
    }

    return {
      sessionId,
      message: agentResponse.text,
      context: agentResponse.context,
      previewData: agentResponse.previewData || undefined,
      itineraryId,
      pendingPreviewExpansion,
      isComplete: false,
    };
  }

  private async expandCompactPreviewToFull(args: {
    userId: number;
    sessionId: number;
    assistantMsgId: number;
    userMessage: string;
    history: Content[];
    sessionContext: Record<string, any>;
    tokenCount?: number;
  }) {
    const { userId, sessionId, assistantMsgId, userMessage, history, sessionContext } = args;

    const full = await this.itineraryAgent.expandToFullPreview(
      userMessage,
      history,
      sessionContext,
    );

    if (!full?.previewData) return;

    // Save full preview as itinerary so frontend can recover previewData on refetch
    const itinerary = await this.itineraryService.createFromPreview(
      userId,
      sessionId,
      full.previewData,
      full.context,
    );

    // Update assistant message to the full text and attach itineraryId
    await this.prisma.aiChatMessage.update({
      where: { id: assistantMsgId },
      data: {
        content: full.text,
        metadata: { tokenCount: full.tokenCount, hasPreview: true, itineraryId: itinerary.id, previewPhase: 'full' },
        token_count: full.tokenCount || undefined,
      },
    });

    // Update session context
    await this.prisma.aiChatSession.update({
      where: { id: sessionId },
      data: {
        slots: full.context,
        ...(full.context?.destination ? { title: `Trip to ${full.context.destination}` } : {}),
      },
    });
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
    let rawMessages: { role: string; content: string; metadata?: any }[];

    const allMessages = await this.prisma.aiChatMessage.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' },
      select: { role: true, content: true, metadata: true },
    });

    rawMessages = this.compactHistoryToTokenBudget(allMessages);

    // Map roles and enforce Gemini alternation
    const mapped = rawMessages
      .filter((m) => m.role !== 'system')
      // Do not feed transient error messages back into the model;
      // otherwise one 503/overload can "poison" the session context.
      .filter((m) => !(m.role === 'assistant' && (m.metadata as any)?.isError))
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
   * Preserve any corrected request details from the current user message even when Gemini fails.
   * This prevents a stale 12-day request from permanently poisoning the session after a retryable error.
   */
  private recoverContextFromMessage(
    message: string,
    sessionContext: Record<string, any>,
    agentType: AiAgentType,
  ): Record<string, any> {
    const context = { ...sessionContext };

    if (agentType === AiAgentType.ITINERARY_GENERATOR) {
      const days = this.extractRequestedDays(message);
      if (days) {
        context.requestedDays = days;
      }
    }

    return context;
  }

  private extractRequestedDays(message: string): number | null {
    const text = (message || '').toLowerCase();
    const match =
      text.match(/(?:for\s*)?(\d{1,2})\s*[- ]?\s*(day|days|night|nights)\b/) ||
      text.match(/\b(\d{1,2})\s*[- ]?\s*day\b/);

    if (!match) return null;

    const days = Number(match[1]);
    return Number.isFinite(days) && days > 0 ? days : null;
  }

  /**
   * Compact the conversation to a rough token budget before Gemini sees it.
   * Keeps recent turns intact and summarizes older content into a short memory block.
   */
  private compactHistoryToTokenBudget(messages: { role: string; content: string; metadata?: any }[]) {
    const estimateTokens = (text: string) => Math.ceil((text || '').length / 4);
    const recentKeep: typeof messages = [];
    let tokenTotal = 0;

    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === 'system') continue;
      if (message.role === 'assistant' && (message.metadata as any)?.isError) continue;

      const cost = estimateTokens(message.content);
      const isRecentUserTurn = recentKeep.length < 6;
      if (tokenTotal + cost > this.MAX_HISTORY_TOKENS && !isRecentUserTurn) {
        break;
      }

      recentKeep.unshift(message);
      tokenTotal += cost;
    }

    if (recentKeep.length >= messages.length) {
      return recentKeep;
    }

    const olderMessages = messages.slice(0, Math.max(0, messages.length - recentKeep.length));
    const olderText = olderMessages
      .filter((m) => m.role !== 'system')
      .filter((m) => !(m.role === 'assistant' && (m.metadata as any)?.isError))
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 160)}`)
      .join('\n');

    const summaryMsg = {
      role: 'user',
      content: `[Conversation summary]\n${olderText.slice(0, 1800)}\n[End summary]`,
      metadata: undefined,
    };

    return [summaryMsg, ...recentKeep];
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
