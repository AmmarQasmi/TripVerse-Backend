import {
	WebSocketGateway,
	WebSocketServer,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
	cors: {
		origin: process.env.FRONTEND_URL || 'http://localhost:3000',
		credentials: true,
	},
	namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	private readonly logger = new Logger(NotificationsGateway.name);
	private readonly userSockets = new Map<number, Set<string>>(); // userId -> Set of socketIds

	constructor(private jwtService: JwtService) {}

	afterInit(server: Server) {
		this.logger.log('WebSocket Gateway initialized');
	}

	async handleConnection(client: Socket) {
		try {
			// Extract token from handshake auth or query
			const token = client.handshake.auth?.token || client.handshake.query?.token;

			if (!token) {
				this.logger.warn(`Client ${client.id} connected without token`);
				client.disconnect();
				return;
			}

			// Verify JWT token
			const payload = await this.jwtService.verifyAsync(token, {
				secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
			});

			const userId = payload.sub || payload.id;

			if (!userId) {
				this.logger.warn(`Client ${client.id} connected with invalid token payload`);
				client.disconnect();
				return;
			}

			// Join user-specific room
			client.join(`user_${userId}`);

			// Track user's sockets
			if (!this.userSockets.has(userId)) {
				this.userSockets.set(userId, new Set());
			}
			this.userSockets.get(userId)!.add(client.id);

			// Store userId in socket data for later use
			(client as any).userId = userId;

			this.logger.log(`Client ${client.id} connected for user ${userId}`);
		} catch (error) {
			this.logger.error(`Connection error for client ${client.id}:`, error);
			client.disconnect();
		}
	}

	handleDisconnect(client: Socket) {
		const userId = (client as any).userId;

		if (userId) {
			const userSockets = this.userSockets.get(userId);
			if (userSockets) {
				userSockets.delete(client.id);
				if (userSockets.size === 0) {
					this.userSockets.delete(userId);
				}
			}
			this.logger.log(`Client ${client.id} disconnected for user ${userId}`);
		} else {
			this.logger.log(`Client ${client.id} disconnected`);
		}
	}

	/**
	 * Emit notification to specific user
	 */
	emitNotification(userId: number, notification: any) {
		this.server.to(`user_${userId}`).emit('notification', notification);
		this.logger.log(`Notification emitted to user ${userId}`);
	}

	/**
	 * Emit notification count update to specific user
	 */
	emitUnreadCount(userId: number, count: number) {
		this.server.to(`user_${userId}`).emit('unread_count', { count });
	}

	/**
	 * Get connected users count
	 */
	getConnectedUsersCount(): number {
		return this.userSockets.size;
	}
}

