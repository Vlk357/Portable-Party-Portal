// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebSocketAuthMiddleware } from './websocket-auth.middleware';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') || 'your_jwt_secret_here',
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  providers: [WebSocketAuthMiddleware],
  exports: [WebSocketAuthMiddleware, JwtModule],
})
export class AuthModule {}
