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

  async authenticate(client: Socket): Promise<number> {
    await Promise.resolve();
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

    this.logger.log(decodedToken);
    // Validate payload structure
    if (!this.hasValidSub(decodedToken)) {
      this.logger.warn('Invalid token payload structure');
      throw new WsException('Invalid token payload');
    }
    // Convert user ID to number safely
    const userId = this.extractUserId(decodedToken.sub);
    if (isNaN(userId)) {
      this.logger.warn(`Invalid user ID in token: ${String(decodedToken.sub)}`);
      throw new WsException('Invalid user ID in token');
    }
    return userId;
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

  /**
   * Decodes a JWT token string and extracts the user ID from the 'sub' claim.
   * Does not verify the token's signature or expiration.
   * Logs warnings/errors if decoding fails or the 'sub' claim is invalid/missing.
   *
   * @param jwtToken The JWT token string.
   * @returns The user ID as a number, or null if extraction fails.
   */
  public getUserIdFromToken(jwtToken: string): number | null {
    try {
      // Decode the token string into a payload object
      // Assign to 'unknown' first to satisfy ESLint
      const decoded: unknown = this.jwtService.decode(jwtToken);

      // Check if decoding resulted in a non-null object
      if (typeof decoded !== 'object' || decoded === null) {
        this.logger.warn(
          'Failed to decode token or token is not an object payload.',
        );
        return null;
      }

      // Now that we know it's an object, pass it to the validator
      // hasValidSub already performs the necessary checks
      if (!this.hasValidSub(decoded)) {
        this.logger.warn(
          "Provided token payload is missing or has invalid 'sub' claim.",
        );
        return null;
      }

      // If hasValidSub passed, 'decoded' is now narrowed to JwtPayload
      // Extract the user ID from the 'sub' claim
      const userId = this.extractUserId(decoded.sub);

      // Check if the extraction resulted in a valid number
      if (isNaN(userId)) {
        this.logger.warn(
          `Extracted 'sub' claim from provided token is not a valid number: ${decoded.sub}`,
        );
        return null;
      }

      // Return the valid user ID
      return userId;
    } catch (error) {
      // Log any errors during the decoding process
      this.logger.error(
        `Failed to decode provided JWT token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
