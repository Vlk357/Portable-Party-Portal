// src/guards/permission.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../services/permission.service';
import { WsException } from '@nestjs/websockets';
import { Observable } from 'rxjs';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private permissionService: PermissionService,
    private reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredPermission = this.reflector.get<string>(
      'permission',
      context.getHandler(),
    );

    if (!requiredPermission) {
      return true; // No permission required
    }

    // Handle WebSocket context
    if (context.getType() === 'ws') {
      return this.validateWsPermission(context, requiredPermission);
    }

    this.logger.warn('Non-WebSocket context in permission guard');
    return false;
  }

  private async validateWsPermission(
    context: ExecutionContext,
    permission: string,
  ): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const userId = client.userId;

    if (!userId) {
      this.logger.warn('WebSocket client has no userId');
      throw new WsException('Unauthorized');
    }

    const [module, resource, action, constraint] = permission.split(':');

    try {
      const hasPermission = await this.permissionService.hasPermission(
        userId,
        module,
        resource,
        action,
        constraint,
      );

      if (!hasPermission) {
        this.logger.warn(`User ${userId} denied access to ${permission}`);
        throw new WsException('Forbidden');
      }

      return true;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      this.logger.error(
        `Permission check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new WsException('Permission check failed');
    }
  }
}

// Permission decorator
import { SetMetadata } from '@nestjs/common';
export const RequirePermission = (permission: string) =>
  SetMetadata('permission', permission);
