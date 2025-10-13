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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
            include: {
                city: true,
                client: true,
                driver: true,
                admin: true,
            },
        });
    }
    async findById(id) {
        return this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                full_name: true,
                role: true,
                status: true,
                city_id: true,
                created_at: true,
                city: true,
                client: true,
                driver: true,
                admin: true,
            },
        });
    }
    async createUser(data) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: data.email,
                password_hash: hashedPassword,
                full_name: data.full_name,
                role: data.role,
                city_id: data.city_id,
            },
            select: {
                id: true,
                email: true,
                full_name: true,
                role: true,
                status: true,
                city_id: true,
                created_at: true,
                city: true,
            },
        });
        if (data.role === client_1.Role.client) {
            await this.prisma.client.create({
                data: {
                    user_id: user.id,
                },
            });
        }
        if (data.role === client_1.Role.driver) {
            await this.prisma.driver.create({
                data: {
                    user_id: user.id,
                },
            });
        }
        if (data.role === client_1.Role.admin) {
            await this.prisma.admin.create({
                data: {
                    user_id: user.id,
                },
            });
        }
        return user;
    }
    async validatePassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map