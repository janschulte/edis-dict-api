import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['verbose'],
  });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dict API für Pegelonline')
    .setDescription('TODO: ADD a description')
    .setVersion(process.env.npm_package_version)
    .build();
  const documentOptions: SwaggerDocumentOptions = {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  };
  const document = SwaggerModule.createDocument(
    app,
    swaggerConfig,
    documentOptions,
  );
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
}
bootstrap();
