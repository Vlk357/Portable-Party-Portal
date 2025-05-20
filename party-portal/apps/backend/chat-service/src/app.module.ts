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
import { ConfigModule, ConfigService } from '@nestjs/config'; // Import ConfigService
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
import { DatabaseSeederService } from './services/database-seeder.service';
import { UserCacheService } from './cache/user-cache.service';
import * as fs from 'fs'; // Import fs
import * as path from 'path'; // Import path
import * as https from 'https';

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
        ChatRoomUser,
        Message,
        Ability,
        Role,
        UserRole,
        RoleAbility,
        UserAbility,
      ],
      // synchronize: process.env.NODE_ENV === 'development',
      synchronize: true,
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
    HttpModule.registerAsync({
      useFactory: () => {
        const agent = new https.Agent({
          rejectUnauthorized: false,
        });
        return {
          httpsAgent: agent,
          // You might also need to set a base URL if all auth calls go to the same place
          // baseURL: 'https://nginx/auth/api',
        };
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule], // Make ConfigService available
      useFactory: (configService: ConfigService) => {
        const publicKeyPath = configService.get<string>('JWT_PUBLIC_KEY_PATH');
        if (!publicKeyPath) {
          throw new Error('JWT_PUBLIC_KEY_PATH environment variable not set.');
        }
        const absolutePath = path.resolve(publicKeyPath);
        try {
          const publicKey = fs.readFileSync(absolutePath, 'utf8'); // Synchronous read
          return {
            publicKey: publicKey,
            verifyOptions: { algorithms: ['RS256'] }, // Specify algorithm for verification
          };
        } catch (error) {
          console.error(
            `Error reading JWT public key from ${absolutePath}:`,
            error,
          );
          throw new Error(
            `Could not read JWT public key file at ${absolutePath}`,
          );
        }
      },
      inject: [ConfigService], // Inject ConfigService
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
    UserCacheService,
    DatabaseSeederService,
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
    UserCacheService,
    // --- Export JwtModule if needed by other modules ---
    JwtModule,
    WebSocketAuthMiddleware, // Export middleware if needed elsewhere
  ],
})
export class AppModule {}
