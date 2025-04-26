import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatRoom } from './entities/chat-room.entity';
import { ChatRoomUser } from './entities/chat-room-user.entity';
import { Message } from './entities/message.entity';
import { ChatRoomRepository } from './repositories/chat-room.repository';
import { ChatRoomService } from './services/chat-room.service';
import { MessageRepository } from './repositories/message.repository';
import { MessageService } from './services/message.service';
import { ChatRoomUserRepository } from './repositories/chat-room-user.repository';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PermissionService } from './services/permission.service';
import { AuthClientService } from './services/auth-client.service';
import { ChatGateway } from './gateways/chat.gateway';
import { Ability } from './entities/ability.entity';
import { UserAbility } from './entities/user-ability.entity';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RoleAbility } from './entities/role-ability.entity';
import { PermissionCacheService } from './services/permission-cache.service';
import { PermissionRepository } from './repositories/permission.repository';
import { PermissionGuard } from './guards/permission.guard';
import { ChatService } from './services/chat.service';
import { ScheduleModule } from '@nestjs/schedule';
import { WebSocketAuthMiddleware } from './auth/websocket-auth.middleware';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'postgres',
      port: 5432,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB || 'chat_db',
      entities: [ChatRoom, ChatRoomUser, Message],
      synchronize: process.env.NODE_ENV === 'development',
      logging: process.env.NODE_ENV === 'development',
    }),
    TypeOrmModule.forFeature([
      ChatRoom,
      ChatRoomUser,
      Message,
      Ability,
      UserAbility,
      Role,
      UserRole,
      RoleAbility,
    ]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [AppController],
  providers: [
    Logger,
    AppService,
    ChatGateway,
    // Repositories
    ChatRoomRepository,
    MessageRepository,
    ChatRoomUserRepository,
    PermissionRepository,
    // Services
    ChatRoomService,
    MessageService,
    PermissionService,
    PermissionCacheService,
    AuthClientService,
    ChatService,
    // Guards
    PermissionGuard,
    // Middleware
    WebSocketAuthMiddleware,
  ],
  exports: [
    ChatRoomService,
    MessageService,
    PermissionService,
    AuthClientService,
  ],
})
export class AppModule {}
