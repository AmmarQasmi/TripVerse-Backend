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
exports.CarsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CarsService = class CarsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async searchCars(query = {}) {
        const { city_id, start_date, end_date, seats, transmission, fuel_type, min_price, max_price, page = 1, limit = 20, } = query;
        const startDate = start_date ? new Date(start_date) : null;
        const endDate = end_date ? new Date(end_date) : null;
        const where = {
            is_active: true,
            driver: {
                is_verified: true,
                user: {
                    status: 'active',
                },
            },
        };
        if (city_id) {
            where.driver = {
                ...where.driver,
                user: {
                    ...where.driver.user,
                    city_id: parseInt(city_id),
                },
            };
        }
        if (seats)
            where.seats = { gte: parseInt(seats) };
        if (transmission)
            where.transmission = transmission;
        if (fuel_type)
            where.fuel_type = fuel_type;
        if (min_price || max_price) {
            where.base_price_per_day = {};
            if (min_price)
                where.base_price_per_day.gte = parseFloat(min_price);
            if (max_price)
                where.base_price_per_day.lte = parseFloat(max_price);
        }
        const availableCars = await this.prisma.car.findMany({
            where,
            include: {
                driver: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                full_name: true,
                                city: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                carModel: true,
                images: {
                    orderBy: { display_order: 'asc' },
                    take: 1,
                },
                carBookings: {
                    where: {
                        status: {
                            in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
                        },
                        ...(startDate && endDate && {
                            OR: [
                                {
                                    AND: [
                                        { start_date: { lte: endDate } },
                                        { end_date: { gte: startDate } },
                                    ],
                                },
                            ],
                        }),
                    },
                },
            },
            orderBy: [
                { base_price_per_day: 'asc' },
                { created_at: 'desc' },
            ],
            skip: (page - 1) * limit,
            take: limit,
        });
        const filteredCars = availableCars.filter((car) => {
            if (startDate && endDate) {
                return car.carBookings.length === 0;
            }
            return true;
        });
        const formatted = filteredCars.map((car) => ({
            id: car.id.toString(),
            driver: {
                id: car.driver.user.id.toString(),
                name: car.driver.user.full_name,
                city: car.driver.user.city.name,
                isVerified: car.driver.is_verified,
            },
            car: {
                make: car.carModel.make,
                model: car.carModel.model,
                year: car.year,
                seats: car.seats,
                transmission: car.transmission,
                fuel_type: car.fuel_type,
                color: car.color,
                license_plate: car.license_plate,
            },
            pricing: {
                base_price_per_day: parseFloat(car.base_price_per_day.toString()),
                distance_rate_per_km: parseFloat(car.distance_rate_per_km.toString()),
            },
            images: car.images.map((img) => img.image_url),
            createdAt: car.created_at.toISOString(),
        }));
        const total = await this.prisma.car.count({
            where: {
                ...where,
                carBookings: {
                    none: {
                        status: {
                            in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
                        },
                        ...(startDate && endDate && {
                            OR: [
                                {
                                    AND: [
                                        { start_date: { lte: endDate } },
                                        { end_date: { gte: startDate } },
                                    ],
                                },
                            ],
                        }),
                    },
                },
            },
        });
        return {
            data: formatted,
            pagination: {
                page,
                limit,
                total: filteredCars.length,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async findOne(id) {
        const car = await this.prisma.car.findUnique({
            where: { id },
            include: {
                driver: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                full_name: true,
                                city: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                carModel: true,
                images: {
                    orderBy: { display_order: 'asc' },
                },
            },
        });
        if (!car || !car.is_active) {
            throw new common_1.NotFoundException('Car not found');
        }
        if (!car.driver.is_verified) {
            throw new common_1.NotFoundException('Driver not verified');
        }
        return {
            id: car.id.toString(),
            driver: {
                id: car.driver.user.id.toString(),
                name: car.driver.user.full_name,
                city: car.driver.user.city.name,
                isVerified: car.driver.is_verified,
            },
            car: {
                make: car.carModel.make,
                model: car.carModel.model,
                year: car.year,
                seats: car.seats,
                transmission: car.transmission,
                fuel_type: car.fuel_type,
                color: car.color,
                license_plate: car.license_plate,
            },
            pricing: {
                base_price_per_day: parseFloat(car.base_price_per_day.toString()),
                distance_rate_per_km: parseFloat(car.distance_rate_per_km.toString()),
            },
            images: car.images.map((img) => img.image_url),
            createdAt: car.created_at.toISOString(),
        };
    }
    async calculatePrice(carId, pickupLocation, dropoffLocation, startDate, endDate, estimatedDistance) {
        const car = await this.prisma.car.findUnique({
            where: { id: carId },
            include: {
                driver: {
                    include: {
                        user: true,
                    },
                },
            },
        });
        if (!car || !car.is_active || !car.driver.is_verified) {
            throw new common_1.NotFoundException('Car not found or driver not verified');
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        let distance = estimatedDistance;
        if (!distance) {
            distance = await this.estimateDistance(pickupLocation, dropoffLocation);
        }
        const basePrice = parseFloat(car.base_price_per_day.toString()) * days;
        const distancePrice = parseFloat(car.distance_rate_per_km.toString()) * distance;
        const totalAmount = basePrice + distancePrice;
        const platformFee = Math.round(totalAmount * 0.05);
        const driverEarnings = totalAmount - platformFee;
        return {
            car_id: car.id,
            driver_id: car.driver.user.id,
            pickup_location: pickupLocation,
            dropoff_location: dropoffLocation,
            estimated_distance: distance,
            trip_duration_days: days,
            pricing_breakdown: {
                base_price: basePrice,
                distance_price: distancePrice,
                total_amount: totalAmount,
                driver_earnings: driverEarnings,
                platform_fee: platformFee,
            },
        };
    }
    async createBookingRequest(data) {
        const { car_id, user_id, pickup_location, dropoff_location, start_date, end_date, customer_notes } = data;
        const car = await this.prisma.car.findUnique({
            where: { id: car_id },
            include: {
                driver: {
                    include: {
                        user: true,
                    },
                },
            },
        });
        if (!car || !car.is_active || !car.driver.is_verified) {
            throw new common_1.NotFoundException('Car not found or driver not verified');
        }
        const conflictingBookings = await this.prisma.carBooking.findMany({
            where: {
                car_id,
                status: {
                    in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
                },
                OR: [
                    {
                        AND: [
                            { start_date: { lte: new Date(end_date) } },
                            { end_date: { gte: new Date(start_date) } },
                        ],
                    },
                ],
            },
        });
        if (conflictingBookings.length > 0) {
            throw new common_1.BadRequestException('Car is not available for the selected dates');
        }
        const priceCalculation = await this.calculatePrice(car_id, pickup_location, dropoff_location, start_date, end_date);
        const booking = await this.prisma.carBooking.create({
            data: {
                user_id,
                car_id,
                pickup_location,
                dropoff_location,
                estimated_distance: priceCalculation.estimated_distance,
                start_date: new Date(start_date),
                end_date: new Date(end_date),
                status: 'PENDING_DRIVER_ACCEPTANCE',
                total_amount: priceCalculation.pricing_breakdown.total_amount,
                driver_earnings: priceCalculation.pricing_breakdown.driver_earnings,
                platform_fee: priceCalculation.pricing_breakdown.platform_fee,
                currency: 'usd',
                customer_notes,
                requested_at: new Date(),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                    },
                },
                car: {
                    include: {
                        carModel: true,
                        driver: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        full_name: true,
                                        email: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        return {
            id: booking.id,
            status: booking.status,
            message: 'Booking request sent to driver. You will be notified when they respond.',
            booking_details: {
                car: {
                    make: booking.car.carModel.make,
                    model: booking.car.carModel.model,
                    year: booking.car.year,
                },
                driver: {
                    name: booking.car.driver.user.full_name,
                },
                pricing: {
                    total_amount: parseFloat(booking.total_amount.toString()),
                    driver_earnings: parseFloat(booking.driver_earnings.toString()),
                    platform_fee: parseFloat(booking.platform_fee.toString()),
                },
            },
        };
    }
    async respondToBooking(bookingId, driverId, response, driverNotes) {
        const booking = await this.prisma.carBooking.findUnique({
            where: { id: bookingId },
            include: {
                car: {
                    include: {
                        driver: true,
                    },
                },
                user: true,
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.car.driver.user_id !== driverId) {
            throw new common_1.BadRequestException('You are not authorized to respond to this booking');
        }
        if (booking.status !== 'PENDING_DRIVER_ACCEPTANCE') {
            throw new common_1.BadRequestException('Booking is no longer pending');
        }
        const updatedBooking = await this.prisma.carBooking.update({
            where: { id: bookingId },
            data: {
                status: response === 'accept' ? 'ACCEPTED' : 'REJECTED',
                accepted_at: response === 'accept' ? new Date() : null,
                driver_notes: driverNotes,
            },
        });
        return {
            id: updatedBooking.id,
            status: updatedBooking.status,
            message: response === 'accept'
                ? 'Booking accepted. Customer has been notified to complete payment.'
                : 'Booking rejected. Customer has been notified.',
        };
    }
    async confirmBooking(bookingId, userId) {
        const booking = await this.prisma.carBooking.findUnique({
            where: { id: bookingId },
            include: {
                car: {
                    include: {
                        driver: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
                user: true,
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.user_id !== userId) {
            throw new common_1.BadRequestException('You are not authorized to confirm this booking');
        }
        if (booking.status !== 'ACCEPTED') {
            throw new common_1.BadRequestException('Booking must be accepted by driver before payment');
        }
        const payment = {
            id: `sim_${Date.now()}`,
            charge_id: `ch_${Date.now()}`,
            status: 'completed',
        };
        const updatedBooking = await this.prisma.carBooking.update({
            where: { id: bookingId },
            data: {
                status: 'CONFIRMED',
                confirmed_at: new Date(),
            },
        });
        const paymentTransaction = await this.prisma.paymentTransaction.create({
            data: {
                booking_car_id: bookingId,
                user_id: userId,
                amount: booking.total_amount,
                currency: booking.currency,
                application_fee_amount: booking.platform_fee,
                status: 'completed',
            },
        });
        await this.prisma.stripePaymentDetails.create({
            data: {
                payment_transaction_id: paymentTransaction.id,
                stripe_payment_intent_id: payment.id,
                stripe_charge_id: payment.charge_id,
            },
        });
        await this.prisma.chat.create({
            data: {
                booking_id: bookingId,
            },
        });
        return {
            id: updatedBooking.id,
            status: updatedBooking.status,
            message: 'Booking confirmed! Chat has been created for communication.',
            payment_id: payment.id,
        };
    }
    async getUserBookings(userId, status) {
        const where = { user_id: userId };
        if (status) {
            where.status = status;
        }
        const bookings = await this.prisma.carBooking.findMany({
            where,
            include: {
                car: {
                    include: {
                        carModel: true,
                        driver: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        full_name: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
        return bookings.map((booking) => ({
            id: booking.id,
            status: booking.status,
            car: {
                make: booking.car.carModel.make,
                model: booking.car.carModel.model,
                year: booking.car.year,
            },
            driver: {
                name: booking.car.driver.user.full_name,
            },
            pickup_location: booking.pickup_location,
            dropoff_location: booking.dropoff_location,
            start_date: booking.start_date.toISOString().split('T')[0],
            end_date: booking.end_date.toISOString().split('T')[0],
            total_amount: parseFloat(booking.total_amount.toString()),
            created_at: booking.created_at.toISOString(),
        }));
    }
    async getDriverBookings(driverId, status) {
        const where = {
            car: {
                driver: {
                    user_id: driverId,
                },
            },
        };
        if (status) {
            where.status = status;
        }
        const bookings = await this.prisma.carBooking.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
                car: {
                    include: {
                        carModel: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
        return bookings.map((booking) => ({
            id: booking.id,
            status: booking.status,
            customer: {
                name: booking.user.full_name,
            },
            car: {
                make: booking.car.carModel.make,
                model: booking.car.carModel.model,
                year: booking.car.year,
            },
            pickup_location: booking.pickup_location,
            dropoff_location: booking.dropoff_location,
            start_date: booking.start_date.toISOString().split('T')[0],
            end_date: booking.end_date.toISOString().split('T')[0],
            driver_earnings: parseFloat(booking.driver_earnings.toString()),
            created_at: booking.created_at.toISOString(),
        }));
    }
    async startTrip(bookingId, driverId, otpCode) {
        const booking = await this.prisma.carBooking.findUnique({
            where: { id: bookingId },
            include: {
                car: {
                    include: {
                        driver: true,
                    },
                },
                user: true,
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.car.driver.user_id !== driverId) {
            throw new common_1.BadRequestException('You are not authorized to start this trip');
        }
        if (booking.status !== 'CONFIRMED') {
            throw new common_1.BadRequestException('Booking must be confirmed before starting trip');
        }
        const payout = {
            id: `payout_${Date.now()}`,
            status: 'completed',
        };
        const updatedBooking = await this.prisma.carBooking.update({
            where: { id: bookingId },
            data: {
                status: 'IN_PROGRESS',
                started_at: new Date(),
            },
        });
        return {
            id: updatedBooking.id,
            status: updatedBooking.status,
            message: 'Trip started successfully. Payment has been released to driver.',
            payout_id: payout.id,
        };
    }
    async completeTrip(bookingId, driverId) {
        const booking = await this.prisma.carBooking.findUnique({
            where: { id: bookingId },
            include: {
                car: {
                    include: {
                        driver: true,
                    },
                },
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.car.driver.user_id !== driverId) {
            throw new common_1.BadRequestException('You are not authorized to complete this trip');
        }
        if (booking.status !== 'IN_PROGRESS') {
            throw new common_1.BadRequestException('Trip must be in progress before completing');
        }
        const updatedBooking = await this.prisma.carBooking.update({
            where: { id: bookingId },
            data: {
                status: 'COMPLETED',
                completed_at: new Date(),
            },
        });
        return {
            id: updatedBooking.id,
            status: updatedBooking.status,
            message: 'Trip completed successfully',
        };
    }
    async estimateDistance(pickup, dropoff) {
        return 100;
    }
    async getChatMessages(bookingId, userId) {
        const booking = await this.prisma.carBooking.findUnique({
            where: { id: bookingId },
            include: {
                car: {
                    include: {
                        driver: true,
                    },
                },
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        const isCustomer = booking.user_id === userId;
        const isDriver = booking.car.driver.user_id === userId;
        if (!isCustomer && !isDriver) {
            throw new common_1.BadRequestException('You are not authorized to view this chat');
        }
        const chat = await this.prisma.chat.findUnique({
            where: { booking_id: bookingId },
            include: {
                messages: {
                    include: {
                        sender: {
                            select: {
                                id: true,
                                full_name: true,
                            },
                        },
                    },
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        if (!chat) {
            return { messages: [] };
        }
        return {
            chat_id: chat.id,
            messages: chat.messages.map((message) => {
                var _a;
                return ({
                    id: message.id,
                    sender: {
                        id: message.sender.id.toString(),
                        name: message.sender.full_name,
                    },
                    message: message.message,
                    sent_at: message.sent_at.toISOString(),
                    read_at: (_a = message.read_at) === null || _a === void 0 ? void 0 : _a.toISOString(),
                });
            }),
        };
    }
    async sendMessage(bookingId, senderId, message) {
        const booking = await this.prisma.carBooking.findUnique({
            where: { id: bookingId },
            include: {
                car: {
                    include: {
                        driver: true,
                    },
                },
            },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        const isCustomer = booking.user_id === senderId;
        const isDriver = booking.car.driver.user_id === senderId;
        if (!isCustomer && !isDriver) {
            throw new common_1.BadRequestException('You are not authorized to send messages in this chat');
        }
        let chat = await this.prisma.chat.findUnique({
            where: { booking_id: bookingId },
        });
        if (!chat) {
            chat = await this.prisma.chat.create({
                data: {
                    booking_id: bookingId,
                },
            });
        }
        const newMessage = await this.prisma.chatMessage.create({
            data: {
                chat_id: chat.id,
                sender_id: senderId,
                message,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
            },
        });
        return {
            id: newMessage.id,
            sender: {
                id: newMessage.sender.id.toString(),
                name: newMessage.sender.full_name,
            },
            message: newMessage.message,
            sent_at: newMessage.sent_at.toISOString(),
        };
    }
};
exports.CarsService = CarsService;
exports.CarsService = CarsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CarsService);
//# sourceMappingURL=cars.service.js.map