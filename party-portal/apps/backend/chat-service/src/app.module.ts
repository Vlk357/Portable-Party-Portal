import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatRoom } from './entities/chat-room.entity';
import { ChatRoomUserHistory } from './entities/chat-room-user-history.entity';
import { Message } from './entities/message.entity';
import { MessageVersion } from './entities/message-version.entity';
import { MessageReply } from './entities/message-reply.entity';
import { ChatRoomRepository } from './repositories/chat-room.repository';
import { ChatRoomService } from './services/chat-room.service';
import { MessageDeliveryStatus } from './entities/message-delivery-status.entity';
import { MessageDeliveryStatusService } from './services/message-delivery-status.service';
import { MessageRepository } from './repositories/message.repository';
import { MessageVersionRepository } from './repositories/message-version.repository';
import { MessageReplyRepository } from './repositories/message-reply.repository';
import { MessageService } from './services/message.service';
import { MessageDeliveryStatusRepository } from './repositories/message-delivery-status.repository';
import { ChatRoomUserHistoryRepository } from './repositories/chat-room-user-history.repository';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PermissionClientService } from './services/permission-client.service';
import { AuthClientService } from './services/auth-client.service';
import { ChatGateway } from './gateways/chat.gateway';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'postgres',
      port: 5432,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB || 'chat_db',
      entities: [
        ChatRoom,
        ChatRoomUserHistory,
        Message,
        MessageVersion,
        MessageReply,
        MessageDeliveryStatus,
      ],
      synchronize: process.env.NODE_ENV === 'development',
      logging: process.env.NODE_ENV === 'development',
    }),
    TypeOrmModule.forFeature([
      ChatRoom,
      ChatRoomUserHistory,
      Message,
      MessageVersion,
      MessageReply,
      MessageDeliveryStatus,
    ]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ChatGateway,
    // Repositories
    ChatRoomRepository,
    MessageRepository,
    MessageVersionRepository,
    MessageReplyRepository,
    MessageDeliveryStatusRepository,
    ChatRoomUserHistoryRepository,
    // Services
    ChatRoomService,
    MessageService,
    MessageDeliveryStatusService,
    PermissionClientService,
    AuthClientService,
  ],
  exports: [
    ChatRoomService,
    MessageService,
    MessageDeliveryStatusService,
    PermissionClientService,
    AuthClientService,
  ],
})
export class AppModule {}
