import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
    app.useGlobalFilters(new WsExceptionFilter());
    app.setGlobalPrefix('chat');

    await app.listen(3000);
    logger.log('Chat service running on port 3000');
  } catch (error) {
    logger.error('Failed to start chat service', error);
  }
}
bootstrap();
