import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Role, AiAgentType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './services/chat.service';
import { CreateSessionDto, SendMessageDto } from './dto';

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.client)
export class ChatController {
  constructor(private chatService: ChatService) {}

  /**
   * POST /chat/sessions
   * Create a new AI chat session.
   */
  @Post('sessions')
  async createSession(
    @CurrentUser() user: any,
    @Body() dto: CreateSessionDto,
  ) {
    const result = await this.chatService.createSession(
      user.id,
      dto.agentType,
      dto.title,
    );
    return {
      success: true,
      data: result,
    };
  }

  /**
   * POST /chat/message
   * Send a message to an existing session.
   */
  @Post('message')
  async sendMessage(
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.chatService.sendMessage(
      user.id,
      dto.sessionId,
      dto.message,
    );
    return {
      success: true,
      data: result,
    };
  }

  /**
   * GET /chat/sessions
   * Get all sessions for the current user.
   * Optional query: ?agentType=ITINERARY_GENERATOR
   */
  @Get('sessions')
  async getSessions(
    @CurrentUser() user: any,
    @Query('agentType') agentType?: AiAgentType,
  ) {
    const sessions = await this.chatService.getUserSessions(user.id, agentType);
    return {
      success: true,
      data: sessions,
    };
  }

  /**
   * GET /chat/sessions/:id
   * Get a single session with all messages.
   */
  @Get('sessions/:id')
  async getSession(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) sessionId: number,
  ) {
    const session = await this.chatService.getSession(user.id, sessionId);
    return {
      success: true,
      data: session,
    };
  }

  /**
   * DELETE /chat/sessions/:id
   * Delete a session.
   */
  @Delete('sessions/:id')
  async deleteSession(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) sessionId: number,
  ) {
    const result = await this.chatService.deleteSession(user.id, sessionId);
    return {
      success: true,
      data: result,
    };
  }
}
