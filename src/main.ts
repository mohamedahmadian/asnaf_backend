import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  parseAcceptLanguage,
  runWithRequestLocale,
} from './common/request-locale';

const httpLogger = new Logger('HTTP');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept-Language',
  });

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      const path = req.originalUrl ?? req.url;
      httpLogger.log(
        `${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`,
      );
    });
    next();
  });

  app.use((req, _res, next) => {
    runWithRequestLocale(
      parseAcceptLanguage(req.headers['accept-language']),
      next,
    );
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application is running on port ${port}`, 'Bootstrap');
}

bootstrap();
