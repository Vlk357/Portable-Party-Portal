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


@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'postgres',
      port: 5432,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: 'chat',
      entities: [
        ChatRoom,
        ChatRoomUserHistory,
        Message,
        MessageVersion,
        MessageReply,
      ],
      synchronize: process.env.NODE_ENV === 'development',
    }),
    TypeOrmModule.forFeature([ChatRoom]),
  ],
  controllers: [AppController],
  providers: [AppService, ChatRoomRepository, ChatRoomService],
  exports: [ChatRoomService],
})
export class AppModule {}
