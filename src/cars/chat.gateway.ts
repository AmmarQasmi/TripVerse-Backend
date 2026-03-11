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
import { PrismaService } from '../prisma/prisma.service';

interface DriverLocationPayload {
	bookingId: number;
	latitude: number;
	longitude: number;
	heading?: number;
	speed?: number;
	accuracy?: number;
	timestamp?: number;
}

interface BookingLocationState {
	bookingId: number;
	driverUserId: number;
	latitude: number;
	longitude: number;
	heading?: number;
	speed?: number;
	accuracy?: number;
	timestamp: number;
}

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
    private readonly latestDriverLocations = new Map<number, BookingLocationState>();

	constructor(
		private jwtService: JwtService,
		private prisma: PrismaService,
	) {}

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
	async handleJoinBooking(client: Socket, bookingId: number) {
		const userId = (client as any).userId;
		if (!userId) {
			client.emit('error', { message: 'Unauthorized' });
			return;
		}

		const booking = await this.getBookingParticipantInfo(bookingId);
		if (!booking) {
			client.emit('error', { message: 'Booking not found' });
			return;
		}

		const isParticipant = booking.user_id === userId || booking.car.driver.user_id === userId;
		if (!isParticipant) {
			client.emit('error', { message: 'You are not authorized for this booking room' });
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

		const lastLocation = this.latestDriverLocations.get(bookingId);
		if (lastLocation) {
			client.emit('driver_location_updated', lastLocation);
		}
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

	@SubscribeMessage('request_driver_location')
	handleRequestDriverLocation(client: Socket, bookingId: number) {
		const userId = (client as any).userId;
		if (!userId) {
			client.emit('error', { message: 'Unauthorized' });
			return;
		}

		const lastLocation = this.latestDriverLocations.get(bookingId);
		if (lastLocation) {
			client.emit('driver_location_updated', lastLocation);
		}
	}

	@SubscribeMessage('driver_location_update')
	async handleDriverLocationUpdate(client: Socket, payload: DriverLocationPayload) {
		const userId = (client as any).userId;
		if (!userId) {
			client.emit('error', { message: 'Unauthorized' });
			return;
		}

		const bookingId = Number(payload?.bookingId);
		if (!bookingId || Number.isNaN(bookingId)) {
			client.emit('error', { message: 'Invalid booking id' });
			return;
		}

		const booking = await this.getBookingParticipantInfo(bookingId);
		if (!booking) {
			client.emit('error', { message: 'Booking not found' });
			return;
		}

		const isDriverForBooking = booking.car.driver.user_id === userId;
		if (!isDriverForBooking) {
			client.emit('error', { message: 'Only assigned driver can share location' });
			return;
		}

		const isRideHailing = String(booking.booking_type) === 'RIDE_HAILING';
		const isTrackableStatus = ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].includes(String(booking.status));

		if (!isRideHailing || !isTrackableStatus) {
			client.emit('error', { message: 'Location sharing is not available for this booking state' });
			return;
		}

		const latitude = Number(payload.latitude);
		const longitude = Number(payload.longitude);
		if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
			client.emit('error', { message: 'Invalid coordinates' });
			return;
		}

		const locationState: BookingLocationState = {
			bookingId,
			driverUserId: userId,
			latitude,
			longitude,
			heading: payload.heading,
			speed: payload.speed,
			accuracy: payload.accuracy,
			timestamp: payload.timestamp || Date.now(),
		};

		this.latestDriverLocations.set(bookingId, locationState);
		this.server.to(`booking_${bookingId}`).emit('driver_location_updated', locationState);
	}

	/**
	 * Emit new message to all users in a booking room
	 */
	emitNewMessage(bookingId: number, message: any) {
		this.server.to(`booking_${bookingId}`).emit('new_message', message);
		this.logger.log(`Message emitted to booking ${bookingId}`);
	}

	private async getBookingParticipantInfo(bookingId: number) {
		return this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			select: {
				id: true,
				user_id: true,
				booking_type: true,
				status: true,
				car: {
					select: {
						driver: {
							select: {
								user_id: true,
							},
						},
					},
				},
			},
		});
	}
}

