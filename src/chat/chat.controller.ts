import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ParseIntPipe,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { Role, AiAgentType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './services/chat.service';
import { PlacesService } from './services/places.service';
import { CreateSessionDto, SendMessageDto } from './dto';
import { ChatRateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.client)
export class ChatController {
  constructor(
    private chatService: ChatService,
    private placesService: PlacesService,
  ) {}

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
  @UseGuards(ChatRateLimitGuard)
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

  // =============================================
  // Photo Proxy — serves Google Places photos without exposing API key
  // =============================================

  /**
   * GET /chat/photos/:photoReference
   * Proxies a Google Places photo.
   * The frontend uses this URL directly in <img> tags.
   * Query: ?maxwidth=800 (optional, default 800)
   */
  @Get('photos/:photoReference')
  async getPhoto(
    @Param('photoReference') photoReference: string,
    @Res() res: Response,
    @Query('maxwidth') maxWidth?: string,
  ) {
    const width = maxWidth ? parseInt(maxWidth, 10) : 800;
    const photo = await this.placesService.getPlacePhoto(photoReference, width);

    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    res.set({
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      'Content-Length': photo.buffer.length.toString(),
    });
    res.send(photo.buffer);
  }
}
