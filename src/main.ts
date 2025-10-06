import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'warn'],
	});
	app.setGlobalPrefix('api');
	await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

bootstrap();


