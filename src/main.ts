import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['verbose'],
  });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  app.enableCors();
  await app.listen(port);
}
bootstrap();
