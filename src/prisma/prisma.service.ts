import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(PrismaService.name);

	constructor() {
		// Use DATABASE_URL as-is - don't modify it
		// Connection string should be configured in .env file
		const connectionString = process.env.DATABASE_URL || '';
		
		// Check if using PgBouncer (transaction pooling)
		const isUsingPgBouncer = connectionString.includes(':6543') || connectionString.includes('pgbouncer=true');
		
		// Ensure pgbouncer=true is in the connection string for transaction pooling
		// This tells Prisma to disable prepared statements (required for PgBouncer transaction mode)
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

		// Log after super() call
		if (!connectionString) {
			this.logger.warn('⚠️ DATABASE_URL is not set in environment variables');
		}
		
		if (isUsingPgBouncer && !connectionString.includes('pgbouncer=true')) {
			this.logger.warn('⚠️ Added pgbouncer=true to connection string (required for transaction pooling)');
		}
		
		if (isUsingPgBouncer) {
			this.logger.log('🔄 PgBouncer transaction pooling detected - prepared statements disabled');
		}

		// Log database queries in development (helps debug slow queries)
		if (process.env.NODE_ENV === 'development') {
			this.$on('query' as never, (e: any) => {
				if (e.duration > 1000) { // Log queries slower than 1 second
					this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
				}
			});
		}

		// Log errors
		this.$on('error' as never, (e: any) => {
			this.logger.error('Database error:', e);
		});

		// Log warnings
		this.$on('warn' as never, (e: any) => {
			this.logger.warn('Database warning:', e);
		});
	}

	async onModuleInit() {
		this.logger.log('🔌 Connecting to database...');
		
		try {
			await this.$connect();
			this.logger.log('✅ Database connected successfully');
			
			// Set timezone to Pakistan (PKT - UTC+5) for all database operations
			// Note: With PgBouncer in transaction mode, this might not persist.
			// For production, consider setting timezone at database level:
			// ALTER DATABASE your_database_name SET timezone = 'Asia/Karachi';
			try {
				await this.$executeRaw`SET timezone = 'Asia/Karachi'`;
				this.logger.log('🕐 Database timezone set to Asia/Karachi (PKT - UTC+5)');
			} catch (tzError) {
				this.logger.warn('⚠️ Could not set timezone (may need database-level setting):', tzError);
			}
			
			// Log connection info (without password)
			const dbUrl = process.env.DATABASE_URL || '';
			const host = dbUrl.match(/@([^:]+):/)?.[1] || 'unknown';
			const port = dbUrl.match(/:(\d+)\//)?.[1] || 'unknown';
			
			this.logger.log(`📊 Database: ${host}:${port}`);
			
			if (port === '6543') {
				this.logger.log('🔄 Transaction pooling mode enabled (PgBouncer)');
				this.logger.warn('⚠️ With PgBouncer, timezone should be set at database level for persistence');
			} else if (port === '5432') {
				this.logger.warn('⚠️ Session mode detected - consider using port 6543 for production');
			}
		} catch (error) {
			this.logger.error('❌ Failed to connect to database:', error);
			throw error;
		}
	}

	async onModuleDestroy() {
		this.logger.log('🔌 Disconnecting from database...');
		await this.$disconnect();
		this.logger.log('✅ Database disconnected');
	}

	/**
	 * Enable shutdown hooks for graceful shutdown
	 */
	async enableShutdownHooks(app: any) {
		this.$on('beforeExit' as never, async () => {
			await app.close();
		});
	}
}


