"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let BookingsService = class BookingsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createHotelBookingRequest(data) {
        const { hotel_id, room_type_id, user_id, quantity, check_in, check_out, guest_notes } = data;
        const checkInDate = new Date(check_in + 'T00:00:00.000Z');
        const checkOutDate = new Date(check_out + 'T00:00:00.000Z');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log('Date validation:', {
            check_in: check_in,
            check_out: check_out,
            checkInDate: checkInDate.toISOString(),
            checkOutDate: checkOutDate.toISOString(),
            today: today.toISOString(),
            isCheckInValid: checkInDate >= today
        });
        if (checkInDate < today) {
            throw new common_1.BadRequestException(`Check-in date cannot be in the past. Check-in: ${checkInDate.toISOString().split('T')[0]}, Today: ${today.toISOString().split('T')[0]}`);
        }
        if (checkOutDate <= checkInDate) {
            throw new common_1.BadRequestException('Check-out date must be after check-in date');
        }
        if (quantity < 1 || quantity > 10) {
            throw new common_1.BadRequestException('Quantity must be between 1 and 10 rooms');
        }
        const booking = await this.prisma.$transaction(async (tx) => {
            const hotel = await tx.hotel.findUnique({
                where: { id: hotel_id },
                include: {
                    city: { select: { id: true, name: true } },
                    roomTypes: {
                        where: { id: room_type_id, is_active: true },
                    },
                },
            });
            if (!hotel || !hotel.is_active) {
                throw new common_1.NotFoundException('Hotel not found or inactive');
            }
            if (hotel.roomTypes.length === 0) {
                throw new common_1.NotFoundException('Room type not found or inactive');
            }
            const roomType = hotel.roomTypes[0];
            const conflictingBookings = await tx.hotelBooking.findMany({
                where: {
                    hotel_id,
                    room_type_id,
                    status: client_1.HotelBookingStatus.CONFIRMED,
                    OR: [
                        {
                            AND: [
                                { check_in: { lte: checkOutDate } },
                                { check_out: { gte: checkInDate } },
                            ],
                        },
                    ],
                },
            });
            const totalBookedRooms = conflictingBookings.reduce((sum, booking) => sum + booking.quantity, 0);
            const availableRooms = roomType.total_rooms - totalBookedRooms;
            if (availableRooms < quantity) {
                throw new common_1.BadRequestException(`Not enough rooms available. Available: ${availableRooms}, Requested: ${quantity}. Please try different dates or room type.`);
            }
            const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
            const basePricePerNight = parseFloat(roomType.base_price.toString());
            const totalAmount = basePricePerNight * quantity * nights;
            const newBooking = await tx.hotelBooking.create({
                data: {
                    user_id,
                    hotel_id,
                    room_type_id,
                    quantity,
                    check_in: checkInDate,
                    check_out: checkOutDate,
                    status: client_1.HotelBookingStatus.PENDING_PAYMENT,
                    total_amount: totalAmount,
                    currency: 'usd',
                },
                include: {
                    hotel: {
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            city: { select: { name: true } }
                        },
                    },
                    room_type: {
                        select: {
                            id: true,
                            name: true,
                            base_price: true,
                            max_occupancy: true
                        },
                    },
                    user: {
                        select: { id: true, full_name: true, email: true },
                    },
                },
            });
            return newBooking;
        });
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        const basePricePerNight = parseFloat(booking.room_type.base_price.toString());
        return {
            id: booking.id,
            status: booking.status,
            message: 'Hotel booking request created successfully. Please confirm with payment.',
            booking_details: {
                hotel: {
                    id: booking.hotel.id.toString(),
                    name: booking.hotel.name,
                    address: booking.hotel.address,
                    city: booking.hotel.city.name,
                },
                room_type: {
                    id: booking.room_type.id.toString(),
                    name: booking.room_type.name,
                    max_occupancy: booking.room_type.max_occupancy,
                    price_per_night: basePricePerNight,
                },
                dates: {
                    check_in: booking.check_in.toISOString().split('T')[0],
                    check_out: booking.check_out.toISOString().split('T')[0],
                    nights: nights,
                },
                pricing: {
                    base_price_per_night: basePricePerNight,
                    quantity: booking.quantity,
                    nights: nights,
                    total_amount: parseFloat(booking.total_amount.toString()),
                    currency: booking.currency,
                },
                guest_notes: guest_notes || null,
            },
            created_at: booking.created_at.toISOString(),
        };
    }
    async getUserHotelBookings(userId, status) {
        const where = { user_id: userId };
        if (status) {
            where.status = status;
        }
        const bookings = await this.prisma.hotelBooking.findMany({
            where,
            include: {
                hotel: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        city: { select: { name: true } },
                    },
                },
                room_type: {
                    select: {
                        id: true,
                        name: true,
                        base_price: true,
                        max_occupancy: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
        return bookings.map((booking) => {
            const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));
            return {
                id: booking.id,
                status: booking.status,
                hotel: {
                    name: booking.hotel.name,
                    address: booking.hotel.address,
                    city: booking.hotel.city.name,
                },
                room_type: {
                    name: booking.room_type.name,
                    max_occupancy: booking.room_type.max_occupancy,
                },
                dates: {
                    check_in: booking.check_in.toISOString().split('T')[0],
                    check_out: booking.check_out.toISOString().split('T')[0],
                    nights: nights,
                },
                quantity: booking.quantity,
                total_amount: parseFloat(booking.total_amount.toString()),
                currency: booking.currency,
                created_at: booking.created_at.toISOString(),
            };
        });
    }
    async getHotelBookingById(bookingId, userId) {
        const booking = await this.prisma.hotelBooking.findUnique({
            where: { id: bookingId },
            include: {
                hotel: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        city: { select: { name: true } },
                    },
                },
                room_type: {
                    select: {
                        id: true,
                        name: true,
                        base_price: true,
                        max_occupancy: true,
                    },
                },
                user: {
                    select: { id: true, full_name: true, email: true },
                },
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.user_id !== userId) {
            throw new common_1.BadRequestException('You are not authorized to view this booking');
        }
        const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));
        return {
            id: booking.id,
            status: booking.status,
            hotel: {
                id: booking.hotel.id.toString(),
                name: booking.hotel.name,
                address: booking.hotel.address,
                city: booking.hotel.city.name,
            },
            room_type: {
                id: booking.room_type.id.toString(),
                name: booking.room_type.name,
                max_occupancy: booking.room_type.max_occupancy,
                price_per_night: parseFloat(booking.room_type.base_price.toString()),
            },
            dates: {
                check_in: booking.check_in.toISOString().split('T')[0],
                check_out: booking.check_out.toISOString().split('T')[0],
                nights: nights,
            },
            quantity: booking.quantity,
            pricing: {
                base_price_per_night: parseFloat(booking.room_type.base_price.toString()),
                quantity: booking.quantity,
                nights: nights,
                total_amount: parseFloat(booking.total_amount.toString()),
                currency: booking.currency,
            },
            created_at: booking.created_at.toISOString(),
            updated_at: booking.updated_at.toISOString(),
        };
    }
    async confirmHotelBooking(bookingId, userId) {
        const booking = await this.prisma.hotelBooking.findUnique({
            where: { id: bookingId },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.user_id !== userId) {
            throw new common_1.BadRequestException('You are not authorized to confirm this booking');
        }
        if (booking.status !== client_1.HotelBookingStatus.PENDING_PAYMENT) {
            throw new common_1.BadRequestException('Booking is not in pending payment status');
        }
        const payment = {
            id: `sim_${Date.now()}`,
            charge_id: `ch_${Date.now()}`,
            status: 'completed',
        };
        const updatedBooking = await this.prisma.hotelBooking.update({
            where: { id: bookingId },
            data: {
                status: client_1.HotelBookingStatus.CONFIRMED,
            },
        });
        return {
            id: updatedBooking.id,
            status: updatedBooking.status,
            message: 'Hotel booking confirmed successfully!',
            payment_id: payment.id,
        };
    }
    async cancelHotelBooking(bookingId, userId) {
        const booking = await this.prisma.hotelBooking.findUnique({
            where: { id: bookingId },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.user_id !== userId) {
            throw new common_1.BadRequestException('You are not authorized to cancel this booking');
        }
        if (booking.status === client_1.HotelBookingStatus.CANCELLED) {
            throw new common_1.BadRequestException('Booking is already cancelled');
        }
        if (booking.status === client_1.HotelBookingStatus.CHECKED_OUT) {
            throw new common_1.BadRequestException('Cannot cancel completed booking');
        }
        const updatedBooking = await this.prisma.hotelBooking.update({
            where: { id: bookingId },
            data: {
                status: client_1.HotelBookingStatus.CANCELLED,
            },
        });
        return {
            id: updatedBooking.id,
            status: updatedBooking.status,
            message: 'Hotel booking cancelled successfully',
        };
    }
    async getAllHotelBookingsForAdmin(query = {}) {
        const { page = 1, limit = 20, status, hotel_id, user_id, } = query;
        const where = {};
        if (status)
            where.status = status;
        if (hotel_id)
            where.hotel_id = parseInt(hotel_id);
        if (user_id)
            where.user_id = parseInt(user_id);
        const [bookings, total] = await Promise.all([
            this.prisma.hotelBooking.findMany({
                where,
                include: {
                    hotel: {
                        select: {
                            id: true,
                            name: true,
                            city: { select: { name: true } },
                        },
                    },
                    room_type: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            full_name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.hotelBooking.count({ where }),
        ]);
        const formattedBookings = bookings.map((booking) => {
            const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));
            return {
                id: booking.id,
                status: booking.status,
                hotel: {
                    name: booking.hotel.name,
                    city: booking.hotel.city.name,
                },
                room_type: {
                    name: booking.room_type.name,
                },
                customer: {
                    name: booking.user.full_name,
                    email: booking.user.email,
                },
                dates: {
                    check_in: booking.check_in.toISOString().split('T')[0],
                    check_out: booking.check_out.toISOString().split('T')[0],
                    nights: nights,
                },
                quantity: booking.quantity,
                total_amount: parseFloat(booking.total_amount.toString()),
                currency: booking.currency,
                created_at: booking.created_at.toISOString(),
            };
        });
        return {
            data: formattedBookings,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
};
exports.BookingsService = BookingsService;
exports.BookingsService = BookingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BookingsService);
//# sourceMappingURL=bookings.service.js.map