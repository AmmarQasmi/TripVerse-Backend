import {
	WebSocketGateway,
	WebSocketServer,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
	cors: {
		origin: process.env.FRONTEND_URL || 'http://localhost:3000',
		credentials: true,
	},
	namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	private readonly logger = new Logger(ChatGateway.name);
	private readonly bookingRooms = new Map<number, Set<string>>(); // bookingId -> Set of socketIds

	constructor(private jwtService: JwtService) {}

	afterInit(server: Server) {
		this.logger.log('Chat WebSocket Gateway initialized');
	}

	async handleConnection(client: Socket) {
		try {
			// Extract token from handshake auth, query, or cookies
			const token = client.handshake.auth?.token || client.handshake.query?.token;
			
			// If no token in auth/query, try to get from cookies
			let jwtToken = token;
			if (!jwtToken && client.handshake.headers.cookie) {
				const cookies = client.handshake.headers.cookie.split(';').reduce((acc: any, cookie: string) => {
					const [key, value] = cookie.trim().split('=');
					acc[key] = value;
					return acc;
				}, {});
				jwtToken = cookies['access_token'] || cookies['token'];
			}

			if (!jwtToken) {
				this.logger.warn(`Client ${client.id} connected without token`);
				client.disconnect();
				return;
			}

			// Verify JWT token
			const payload = await this.jwtService.verifyAsync(jwtToken, {
				secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
			});

			const userId = payload.sub || payload.id;

			if (!userId) {
				this.logger.warn(`Client ${client.id} connected with invalid token payload`);
				client.disconnect();
				return;
			}

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
		this.logger.log(`Client ${client.id} disconnected for user ${userId}`);

		// Remove client from all booking rooms
		this.bookingRooms.forEach((sockets, bookingId) => {
			if (sockets.has(client.id)) {
				sockets.delete(client.id);
				if (sockets.size === 0) {
					this.bookingRooms.delete(bookingId);
				}
			}
		});
	}

	/**
	 * Join a booking chat room
	 */
	@SubscribeMessage('join_booking')
	handleJoinBooking(client: Socket, bookingId: number) {
		const userId = (client as any).userId;
		if (!userId) {
			client.emit('error', { message: 'Unauthorized' });
			return;
		}

		// Join the booking room
		client.join(`booking_${bookingId}`);

		// Track the room
		if (!this.bookingRooms.has(bookingId)) {
			this.bookingRooms.set(bookingId, new Set());
		}
		this.bookingRooms.get(bookingId)!.add(client.id);

		this.logger.log(`User ${userId} joined booking ${bookingId}`);
		client.emit('joined_booking', { bookingId });
	}

	/**
	 * Leave a booking chat room
	 */
	@SubscribeMessage('leave_booking')
	handleLeaveBooking(client: Socket, bookingId: number) {
		const userId = (client as any).userId;
		if (!userId) {
			return;
		}

		// Leave the booking room
		client.leave(`booking_${bookingId}`);

		// Remove from tracking
		const sockets = this.bookingRooms.get(bookingId);
		if (sockets) {
			sockets.delete(client.id);
			if (sockets.size === 0) {
				this.bookingRooms.delete(bookingId);
			}
		}

		this.logger.log(`User ${userId} left booking ${bookingId}`);
	}

	/**
	 * Emit new message to all users in a booking room
	 */
	emitNewMessage(bookingId: number, message: any) {
		this.server.to(`booking_${bookingId}`).emit('new_message', message);
		this.logger.log(`Message emitted to booking ${bookingId}`);
	}
}

