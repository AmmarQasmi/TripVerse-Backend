"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const cookieParser = require("cookie-parser");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    app.use(cookieParser());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.enableCors({
        origin: 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Set-Cookie'],
    });
    const port = process.env.PORT ? Number(process.env.PORT) : 8000;
    await app.listen(port);
    console.log(`\n🚀 Server is running on http://localhost:${port}`);
    console.log(`🍪 Cookie-based authentication enabled`);
    console.log(`🌐 CORS enabled for http://localhost:3000`);
}
bootstrap();
//# sourceMappingURL=main.js.map