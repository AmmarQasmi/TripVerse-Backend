import {
	Controller,
	Get,
	Patch,
	Delete,
	Param,
	Query,
	UseGuards,
	ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	/**
	 * Get user notifications
	 * GET /notifications?unreadOnly=true
	 */
	@Get()
	async getNotifications(
		@CurrentUser() user: any,
		@Query('unreadOnly') unreadOnly?: string,
	) {
		const unread = unreadOnly === 'true';
		return this.notificationsService.getUserNotifications(user.id, unread);
	}

	/**
	 * Get unread notifications count
	 * GET /notifications/unread
	 */
	@Get('unread')
	async getUnreadCount(@CurrentUser() user: any) {
		const count = await this.notificationsService.getUnreadCount(user.id);
		return { unread_count: count };
	}

	/**
	 * Mark notification as read
	 * PATCH /notifications/:id/read
	 */
	@Patch(':id/read')
	async markAsRead(
		@Param('id', ParseIntPipe) notificationId: number,
		@CurrentUser() user: any,
	) {
		await this.notificationsService.markAsRead(notificationId, user.id);
		return { message: 'Notification marked as read' };
	}

	/**
	 * Mark all notifications as read
	 * PATCH /notifications/read-all
	 */
	@Patch('read-all')
	async markAllAsRead(@CurrentUser() user: any) {
		await this.notificationsService.markAllAsRead(user.id);
		return { message: 'All notifications marked as read' };
	}

	/**
	 * Delete notification
	 * DELETE /notifications/:id
	 */
	@Delete(':id')
	async deleteNotification(
		@Param('id', ParseIntPipe) notificationId: number,
		@CurrentUser() user: any,
	) {
		await this.notificationsService.deleteNotification(notificationId, user.id);
		return { message: 'Notification deleted' };
	}
}

