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
	app.enableCors({
		origin: 'http://localhost:3000', // Next.js frontend URL MUST match exactly
		credentials: true, // CRITICAL: Allows cookies to be sent/received
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		exposedHeaders: ['Set-Cookie'], // Expose Set-Cookie header
	});
	
	const port = process.env.PORT ? Number(process.env.PORT) : 8000;
	await app.listen(port);
	
	console.log(`\n🚀 Server is running on http://localhost:${port}`);
	console.log(`🍪 Cookie-based authentication enabled`);
	console.log(`🌐 CORS enabled for http://localhost:3000`);
}

bootstrap();


