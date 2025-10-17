import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(PrismaService.name);

	constructor() {
		// Build optimized connection string
		const databaseUrl = process.env.DATABASE_URL || '';
		const hasPgBouncer = databaseUrl.includes('pgbouncer=true');
		
		// If using PgBouncer and params not already in URL, add them programmatically
		let connectionString = databaseUrl;
		
		if (!hasPgBouncer && databaseUrl.includes(':6543')) {
			// Port 6543 detected but no pgbouncer params → add them
			const separator = databaseUrl.includes('?') ? '&' : '?';
			connectionString = `${databaseUrl}${separator}pgbouncer=true&connection_limit=1&pool_timeout=10`;
			console.log('🔧 Auto-configured PgBouncer parameters');
		}
		
		super({
			log: [
				{ level: 'warn', emit: 'event' },
				{ level: 'error', emit: 'event' },
			],
			errorFormat: 'minimal',
			datasources: {
				db: {
					url: connectionString,
				},
			},
		});

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
			
			// Log connection info (without password)
			const dbUrl = process.env.DATABASE_URL || '';
			const host = dbUrl.match(/@([^:]+):/)?.[1] || 'unknown';
			const port = dbUrl.match(/:(\d+)\//)?.[1] || 'unknown';
			
			this.logger.log(`📊 Database: ${host}:${port}`);
			
			if (port === '6543') {
				this.logger.log('🔄 Transaction pooling mode enabled (PgBouncer)');
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


