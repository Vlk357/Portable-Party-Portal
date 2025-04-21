// src/auth/websocket-auth.middleware.ts
import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

// Define JwtPayload interface
interface JwtPayload {
  sub: string | number;
  [key: string]: unknown;
}

@Injectable()
export class WebSocketAuthMiddleware {
  private readonly logger = new Logger(WebSocketAuthMiddleware.name);

  constructor(private readonly jwtService: JwtService) {}

  authenticate(client: Socket): Promise<number> {
    return Promise.resolve().then(() => {
      try {
        // Get token from handshake
        const authToken = this.getAuthToken(client);

        if (!authToken) {
          this.logger.warn('No authentication token provided');
          throw new WsException('No authentication token provided');
        }

        // Verify the JWT token with proper typing
        const decodedToken = this.jwtService.verify<JwtPayload>(authToken);

        // Check if token is valid
        if (!decodedToken) {
          this.logger.warn('Token verification failed');
          throw new WsException('Invalid token');
        }

        // Validate payload structure
        if (!this.hasValidSub(decodedToken)) {
          this.logger.warn('Invalid token payload structure');
          throw new WsException('Invalid token payload');
        }

        // Convert user ID to number safely
        const userId = this.extractUserId(decodedToken.sub);

        if (isNaN(userId)) {
          this.logger.warn(
            `Invalid user ID in token: ${String(decodedToken.sub)}`,
          );
          throw new WsException('Invalid user ID in token');
        }

        return userId;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Authentication failed: ${errorMessage}`);
        throw new WsException('Authentication failed');
      }
    });
  }

  private getAuthToken(client: Socket): string | undefined {
    // Extract token from either auth object or headers
    const authObj = client.handshake.auth;
    const headers = client.handshake.headers;

    // Check for token in auth object
    if (authObj && typeof authObj === 'object' && 'token' in authObj) {
      // Use Record type to safely access the property
      const tokenValue = (authObj as Record<string, unknown>).token;
      if (typeof tokenValue === 'string') {
        return tokenValue;
      }
    }

    // Check for token in authorization header
    if (headers && typeof headers === 'object' && 'authorization' in headers) {
      const authHeader = headers.authorization;
      if (typeof authHeader === 'string') {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          return parts[1];
        }
      }
    }

    return undefined;
  }

  private hasValidSub(payload: unknown): payload is JwtPayload {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      'sub' in payload &&
      (typeof (payload as Record<string, unknown>).sub === 'string' ||
        typeof (payload as Record<string, unknown>).sub === 'number')
    );
  }

  private extractUserId(sub: string | number): number {
    if (typeof sub === 'string') {
      return parseInt(sub, 10);
    }
    return sub;
  }
}
