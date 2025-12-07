import { Injectable } from '@nestjs/common';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
	constructor(
		private commonNotificationsService: CommonNotificationsService,
		private notificationsGateway: NotificationsGateway,
	) {}

	async getUserNotifications(userId: number, unreadOnly?: boolean) {
		return this.commonNotificationsService.getUserNotifications(userId, unreadOnly);
	}

	async getUnreadCount(userId: number) {
		return this.commonNotificationsService.getUnreadCount(userId);
	}

	async markAsRead(notificationId: number, userId: number) {
		return this.commonNotificationsService.markAsRead(notificationId, userId);
	}

	async markAllAsRead(userId: number) {
		return this.commonNotificationsService.markAllAsRead(userId);
	}

	async deleteNotification(notificationId: number, userId: number) {
		return this.commonNotificationsService.deleteNotification(notificationId, userId);
	}
}

