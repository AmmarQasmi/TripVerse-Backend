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
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    constructor() {
        const connectionString = process.env.DATABASE_URL || '';
        const isUsingPgBouncer = connectionString.includes(':6543') || connectionString.includes('pgbouncer=true');
        let finalConnectionString = connectionString;
        if (isUsingPgBouncer && !connectionString.includes('pgbouncer=true')) {
            const separator = connectionString.includes('?') ? '&' : '?';
            finalConnectionString = `${connectionString}${separator}pgbouncer=true`;
        }
        super({
            log: [
                { level: 'warn', emit: 'event' },
                { level: 'error', emit: 'event' },
            ],
            errorFormat: 'minimal',
            datasources: {
                db: {
                    url: finalConnectionString,
                },
            },
        });
        this.logger = new common_1.Logger(PrismaService_1.name);
        if (!connectionString) {
            this.logger.warn('⚠️ DATABASE_URL is not set in environment variables');
        }
        if (isUsingPgBouncer && !connectionString.includes('pgbouncer=true')) {
            this.logger.warn('⚠️ Added pgbouncer=true to connection string (required for transaction pooling)');
        }
        if (isUsingPgBouncer) {
            this.logger.log('🔄 PgBouncer transaction pooling detected - prepared statements disabled');
        }
        if (process.env.NODE_ENV === 'development') {
            this.$on('query', (e) => {
                if (e.duration > 1000) {
                    this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
                }
            });
        }
        this.$on('error', (e) => {
            this.logger.error('Database error:', e);
        });
        this.$on('warn', (e) => {
            this.logger.warn('Database warning:', e);
        });
    }
    async onModuleInit() {
        var _a, _b;
        this.logger.log('🔌 Connecting to database...');
        try {
            await this.$connect();
            this.logger.log('✅ Database connected successfully');
            const dbUrl = process.env.DATABASE_URL || '';
            const host = ((_a = dbUrl.match(/@([^:]+):/)) === null || _a === void 0 ? void 0 : _a[1]) || 'unknown';
            const port = ((_b = dbUrl.match(/:(\d+)\//)) === null || _b === void 0 ? void 0 : _b[1]) || 'unknown';
            this.logger.log(`📊 Database: ${host}:${port}`);
            if (port === '6543') {
                this.logger.log('🔄 Transaction pooling mode enabled (PgBouncer)');
            }
            else if (port === '5432') {
                this.logger.warn('⚠️ Session mode detected - consider using port 6543 for production');
            }
        }
        catch (error) {
            this.logger.error('❌ Failed to connect to database:', error);
            throw error;
        }
    }
    async onModuleDestroy() {
        this.logger.log('🔌 Disconnecting from database...');
        await this.$disconnect();
        this.logger.log('✅ Database disconnected');
    }
    async enableShutdownHooks(app) {
        this.$on('beforeExit', async () => {
            await app.close();
        });
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map