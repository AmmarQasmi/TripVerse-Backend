import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { MulterExceptionFilter } from './common/filters/multer-exception.filter';

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'warn', 'log'],
	});
	
	// Enable cookie parser - MUST come before routes
	app.use(cookieParser());
	
	// Global exception filter for multer errors
	app.useGlobalFilters(new MulterExceptionFilter());
	
	// Enable global validation
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);

	// CORS configuration for cookies
	const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
	const allowedOrigins = frontendUrl.split(',').map(url => url.trim());
	
	app.enableCors({
		origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
		credentials: true, // CRITICAL: Allows cookies to be sent/received
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		exposedHeaders: ['Set-Cookie'], // Expose Set-Cookie header
	});
	
	const port = process.env.PORT ? Number(process.env.PORT) : 8000;
	const host = '0.0.0.0'; // Bind to all network interfaces for Render
	await app.listen(port, host);
	
	console.log(`\n🚀 Server is running on port ${port}`);
	console.log(`🍪 Cookie-based authentication enabled`);
	console.log(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`);
	console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();


