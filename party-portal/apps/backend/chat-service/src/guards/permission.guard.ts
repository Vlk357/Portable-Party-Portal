// src/guards/permission.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../services/permission.service';
import { WsException } from '@nestjs/websockets';
import { Observable } from 'rxjs';
import { MessageService } from '../services/message.service';
import { ChatRoomService } from '../services/chat-room.service';

export interface PermissionOptions {
  allowOwner?: boolean; // Whether resource owners bypass permission checks
  resourceType?: string; // Type of resource for ownership check (message, room)
  resourceIdField?: string; // Field containing ID for ownership check
  constraintField?: string; // Field containing ID for permission constraint
}

// Define a type for the client to avoid using 'any'
interface AuthenticatedClient {
  userId: number;
  [key: string]: unknown;
}

// Define a type for the data payload
interface DataPayload {
  [key: string]: unknown;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private permissionService: PermissionService,
    private reflector: Reflector,
    @Optional() private messageService?: MessageService,
    @Optional() private chatRoomService?: ChatRoomService,
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
    // Get client and extract userId with proper typing
    const client = context.switchToWs().getClient<AuthenticatedClient>();
    const userId = client.userId;
    const data = context.switchToWs().getData<DataPayload>();

    if (!userId) {
      this.logger.warn('WebSocket client has no userId');
      throw new WsException('Unauthorized');
    }

    // Get permission options
    const options =
      this.reflector.get<PermissionOptions>(
        'permissionOptions',
        context.getHandler(),
      ) || {};

    // Check for resource ownership if relevant
    if (options.allowOwner && options.resourceType && options.resourceIdField) {
      // Get the ID of the resource from the request data
      const resourceIdField = options.resourceIdField;
      const resourceId = data[resourceIdField];

      if (typeof resourceId === 'number') {
        try {
          const isOwner = await this.checkResourceOwnership(
            options.resourceType,
            resourceId,
            userId,
          );

          // If user is the owner, bypass permission check
          if (isOwner) {
            return true;
          }
        } catch (error) {
          this.logger.error(
            `Error checking resource ownership: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
          // Continue with normal permission check
        }
      }
    }

    // Extract permission parts
    const [module, resource, action, constraint] = permission.split(':');

    // Get resource ID for context-specific permissions
    let contextConstraint = constraint;
    if (constraint === '$resourceId') {
      if (
        options.constraintField &&
        data[options.constraintField] !== undefined
      ) {
        // Use the specified constraint field (e.g., roomId)
        contextConstraint = String(data[options.constraintField]);
      } else if (
        options.resourceIdField &&
        data[options.resourceIdField] !== undefined
      ) {
        // Fall back to resourceIdField if constraintField not specified
        contextConstraint = String(data[options.resourceIdField]);
      }
    }

    try {
      const hasPermission = await this.permissionService.hasPermission(
        userId,
        module,
        resource,
        action,
        contextConstraint,
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
        `Permission check error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw new WsException('Permission check failed');
    }
  }

  private async checkResourceOwnership(
    resourceType: string,
    resourceId: number,
    userId: number,
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'message': {
          if (!this.messageService) {
            this.logger.warn(
              'MessageService not available for ownership check',
            );
            return false;
          }
          const message = await this.messageService.getMessage(resourceId);
          // Make sure the property name matches your Message interface
          return message !== null && message.user_id === userId;
        }
        case 'room': {
          if (!this.chatRoomService) {
            this.logger.warn(
              'ChatRoomService not available for ownership check',
            );
            return false;
          }
          // Get room with proper error handling
          const room = await this.chatRoomService.getRoom(resourceId);
          // Safely check if room exists and user is owner
          return room !== null && room.created_by_user_id === userId;
        }
        // Add more resource types as needed
        default:
          this.logger.warn(`Unknown resource type: ${resourceType}`);
          return false;
      }
    } catch (error) {
      this.logger.error(
        `Error checking resource ownership: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }
}

// Enhanced permission decorator with proper typing
export const RequirePermission = (
  permission: string,
  options?: PermissionOptions,
): MethodDecorator => {
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    SetMetadata('permission', permission)(target, key, descriptor);
    if (options) {
      SetMetadata('permissionOptions', options)(target, key, descriptor);
    }
    return descriptor;
  };
};
