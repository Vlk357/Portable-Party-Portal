import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
    app.useWebSocketAdapter(new WsAdapter(app));
    app.setGlobalPrefix('chat');

    await app.listen(3000);
    logger.log('Chat service running on port 3000');
  } catch (error) {
    logger.error('Failed to start chat service', error);
  }
}
bootstrap();
