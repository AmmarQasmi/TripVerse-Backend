import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
	private readonly logger = new Logger(NotificationsService.name);

	constructor(private prisma: PrismaService) {}

	/**
	 * Create in-app notification
	 */
	async createNotification(
		userId: number,
		type: NotificationType,
		title: string,
		message: string,
		payload?: any,
	): Promise<any> {
		try {
			const notification = await this.prisma.notification.create({
				data: {
					user_id: userId,
					type,
					title,
					message,
				},
			});

			this.logger.log(`Notification created for user ${userId}: ${type}`);
			return notification;
		} catch (error) {
			this.logger.error(`Failed to create notification for user ${userId}:`, error);
			throw error;
		}
	}

	/**
	 * Get user notifications
	 */
	async getUserNotifications(userId: number, unreadOnly: boolean = false) {
		const where: any = { user_id: userId };
		if (unreadOnly) {
			where.read_at = null;
		}

		const notifications = await this.prisma.notification.findMany({
			where,
			orderBy: { sent_at: 'desc' },
			take: 50, // Limit to last 50 notifications
		});

		return notifications.map((notif) => ({
			id: notif.id,
			type: notif.type,
			title: notif.title,
			message: notif.message,
			sent_at: notif.sent_at.toISOString(),
			read_at: notif.read_at?.toISOString() || null,
			is_read: notif.read_at !== null,
		}));
	}

	/**
	 * Get unread notifications count
	 */
	async getUnreadCount(userId: number): Promise<number> {
		return this.prisma.notification.count({
			where: {
				user_id: userId,
				read_at: null,
			},
		});
	}

	/**
	 * Mark notification as read
	 */
	async markAsRead(notificationId: number, userId: number): Promise<void> {
		// Verify notification belongs to user
		const notification = await this.prisma.notification.findFirst({
			where: {
				id: notificationId,
				user_id: userId,
			},
		});

		if (!notification) {
			throw new Error('Notification not found or unauthorized');
		}

		if (notification.read_at) {
			return; // Already read
		}

		await this.prisma.notification.update({
			where: { id: notificationId },
			data: { read_at: new Date() },
		});
	}

	/**
	 * Mark all notifications as read for user
	 */
	async markAllAsRead(userId: number): Promise<void> {
		await this.prisma.notification.updateMany({
			where: {
				user_id: userId,
				read_at: null,
			},
			data: {
				read_at: new Date(),
			},
		});
	}

	/**
	 * Delete notification
	 */
	async deleteNotification(notificationId: number, userId: number): Promise<void> {
		// Verify notification belongs to user
		const notification = await this.prisma.notification.findFirst({
			where: {
				id: notificationId,
				user_id: userId,
			},
		});

		if (!notification) {
			throw new Error('Notification not found or unauthorized');
		}

		await this.prisma.notification.delete({
			where: { id: notificationId },
		});
	}

	/**
	 * Create notification for driver verification
	 */
	async notifyDriverVerification(
		userId: number,
		isApproved: boolean,
		notes?: string,
	): Promise<void> {
		const title = isApproved
			? 'Driver Verification Approved'
			: 'Driver Verification Rejected';
		const message = isApproved
			? 'Congratulations! Your driver verification has been approved. You can now list your cars and accept bookings.'
			: notes
				? `Your driver verification has been rejected. Reason: ${notes}`
				: 'Your driver verification has been rejected. Please review your documents and try again.';

		await this.createNotification(
			userId,
			isApproved ? 'driver_verification' : 'driver_verification',
			title,
			message,
		);
	}

	/**
	 * Create notification for booking request
	 */
	async notifyBookingRequest(driverUserId: number, bookingId: number, customerName: string): Promise<void> {
		await this.createNotification(
			driverUserId,
			'booking_request',
			'New Booking Request',
			`You have a new booking request from ${customerName}`,
			{ booking_id: bookingId },
		);
	}

	/**
	 * Create notification for booking accepted
	 */
	async notifyBookingAccepted(clientUserId: number, bookingId: number, driverName: string): Promise<void> {
		await this.createNotification(
			clientUserId,
			'booking_accepted',
			'Booking Accepted',
			`${driverName} has accepted your booking request`,
			{ booking_id: bookingId },
		);
	}

	/**
	 * Create notification for booking rejected
	 */
	async notifyBookingRejected(clientUserId: number, bookingId: number, driverName: string): Promise<void> {
		await this.createNotification(
			clientUserId,
			'booking_rejected',
			'Booking Rejected',
			`${driverName} has rejected your booking request`,
			{ booking_id: bookingId },
		);
	}

	/**
	 * Create notification for booking confirmed
	 */
	async notifyBookingConfirmed(userId: number, bookingId: number, bookingType: 'hotel' | 'car'): Promise<void> {
		await this.createNotification(
			userId,
			'booking_confirmed',
			'Booking Confirmed',
			`Your ${bookingType} booking has been confirmed`,
			{ booking_id: bookingId },
		);
	}

	/**
	 * Create notification for trip started
	 */
	async notifyTripStarted(clientUserId: number, bookingId: number, driverName: string): Promise<void> {
		await this.createNotification(
			clientUserId,
			'trip_started',
			'Trip Started',
			`${driverName} has started your trip`,
			{ booking_id: bookingId },
		);
	}

	/**
	 * Create notification for trip completed
	 */
	async notifyTripCompleted(clientUserId: number, bookingId: number, driverName: string): Promise<void> {
		await this.createNotification(
			clientUserId,
			'trip_completed',
			'Trip Completed',
			`${driverName} has completed your trip`,
			{ booking_id: bookingId },
		);
	}

	/**
	 * Create notification for hotel manager verification approved
	 */
	async notifyHotelManagerVerificationApproved(
		userId: number,
		managerName: string,
	): Promise<void> {
		await this.createNotification(
			userId,
			'hotel_manager_verification_approved',
			'Hotel Manager Verification Approved',
			`Congratulations ${managerName}! Your hotel manager verification has been approved. You can now create and manage hotels.`,
		);
	}

	/**
	 * Create notification for hotel manager verification rejected
	 */
	async notifyHotelManagerVerificationRejected(
		userId: number,
		managerName: string,
		reason: string,
	): Promise<void> {
		await this.createNotification(
			userId,
			'hotel_manager_verification_rejected',
			'Hotel Manager Verification Rejected',
			`Your hotel manager verification has been rejected. Reason: ${reason}. Please review your documents and try again.`,
		);
	}

	/**
	 * Notify all admins about a new verification submission
	 */
	async notifyAdminsOfVerificationSubmission(
		type: 'driver' | 'hotel_manager',
		userName: string,
		userEmail: string,
	): Promise<void> {
		try {
			// Get all admin users
			const admins = await this.prisma.user.findMany({
				where: {
					role: 'admin',
					status: 'active',
				},
				select: {
					id: true,
				},
			});

			const title = type === 'driver'
				? 'New Driver Verification Request'
				: 'New Hotel Manager Verification Request';
			const message = type === 'driver'
				? `${userName} (${userEmail}) has submitted driver verification documents for review.`
				: `${userName} (${userEmail}) has submitted hotel manager verification documents for review.`;

			// Create notification for each admin
			const notificationPromises = admins.map(admin =>
				this.createNotification(
					admin.id,
					type === 'driver' ? 'driver_verification' : 'hotel_manager_verification_approved', // Reuse existing type
					title,
					message,
				)
			);

			await Promise.all(notificationPromises);
			this.logger.log(`Notified ${admins.length} admins about ${type} verification submission`);
		} catch (error) {
			this.logger.error(`Failed to notify admins about ${type} verification submission:`, error);
			// Don't throw - this is a non-critical operation
		}
	}
}

