// src/gateways/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { ChatRoomService } from '../services/chat-room.service';
import { MessageService } from '../services/message.service';
import { PermissionService } from '../services/permission.service';
import { PermissionGuard } from '../guards/permission.guard';
import { RequirePermission } from '../guards/permission.guard';
import { WebSocketAuthMiddleware } from '../auth/websocket-auth.middleware';
interface AuthenticatedSocket extends Socket {
  userId: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly userSockets = new Map<number, AuthenticatedSocket[]>();

  constructor(
    private readonly chatRoomService: ChatRoomService,
    private readonly messageService: MessageService,
    private readonly wsAuthMiddleware: WebSocketAuthMiddleware,
    private readonly permissionService: PermissionService,
  ) {}

  private handleError(
    client: AuthenticatedSocket,
    error: unknown,
    message: string,
  ): void {
    const error_message =
      error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(message, error_message);
    client.emit(message, { error_message });
  }

  /**
   * Sets up a user's authenticated socket connection
   * @param client The socket client
   * @param userId The authenticated user ID
   */
  private setupUserConnection(
    client: Socket,
    userId: number,
  ): AuthenticatedSocket {
    const authClient = client as AuthenticatedSocket;
    authClient.userId = userId;

    // Store socket connection
    const userSockets = this.userSockets.get(userId) || [];
    userSockets.push(authClient);
    this.userSockets.set(userId, userSockets);

    return authClient;
  }

  async handleConnection(client: Socket) {
    try {
      // Authenticate the socket connection
      const userId = await this.wsAuthMiddleware.authenticate(client);

      // Setup user connection with authenticated ID
      const authClient = this.setupUserConnection(client, userId);

      // Send initial state to client
      const activeRooms = await this.chatRoomService.getRoomsForUser(userId);
      authClient.emit('activeRooms', activeRooms);

      this.logger.log(`Client connected: ${authClient.id} (User: ${userId})`);

      await this.updateUserStatus(userId, true);
    } catch (error) {
      // Extract the specific error message to send to client
      let errorMessage = 'Authentication failed';

      if (error instanceof WsException) {
        // Use the original WsException message
        errorMessage = error.message;
      } else if (error instanceof Error) {
        // For other errors, use their message but don't expose internal details
        this.logger.error(`Connection failed: ${error.message}`, error.stack);

        // For JWT errors, provide a more user-friendly message
        if (
          error.name === 'JsonWebTokenError' ||
          error.name === 'TokenExpiredError'
        ) {
          errorMessage = 'Invalid or expired token';
        }
      } else {
        this.logger.error('Connection failed with unknown error type', error);
      }

      // Send the appropriate error message to the client
      client.emit('error', { message: errorMessage });
      client.disconnect();
    }
  }

  private async updateUserStatus(userId: number, isOnline: boolean) {
    // Get rooms the user is in
    const userRooms = await this.chatRoomService.getRoomsForUser(userId);

    // Broadcast status to all rooms
    userRooms.forEach((room) => {
      this.server.to(`room:${room.id}`).emit('userStatus', {
        userId,
        status: isOnline ? 'online' : 'offline',
        timestamp: new Date(),
      });
    });
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const userSockets = this.userSockets.get(client.userId) || [];
      const index = userSockets.indexOf(client);

      if (index > -1) {
        // Remove this socket
        userSockets.splice(index, 1);

        if (userSockets.length === 0) {
          this.userSockets.delete(client.userId);
          await this.updateUserStatus(client.userId, false);
        } else {
          // Update remaining sockets
          this.userSockets.set(client.userId, userSockets);
        }
      }

      this.logger.log(
        `Client disconnected: ${client.id} (User: ${client.userId})`,
      );
    } catch (error) {
      this.handleError(client, error, 'Disconnection error: ');
    }
  }

  // Helper method to get all sockets for a user
  private getUserSockets(userId: number): AuthenticatedSocket[] {
    return this.userSockets.get(userId) || [];
  }

  // Helper method to broadcast to user across all their sockets
  private broadcastToUser(userId: number, event: string, data: any) {
    const sockets = this.getUserSockets(userId);
    sockets.forEach((socket) => socket.emit(event, data));
  }

  @UseGuards(PermissionGuard)
  @SubscribeMessage('sendMessage')
  @RequirePermission('CHAT:MESSAGE:CREATE:$resourceId', {
    allowOwner: false,
    resourceIdField: undefined,
    constraintField: 'chatRoomId',
  })
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      roomId: number;
      content: string;
      createdAt: Date;
    },
  ) {
    try {
      // Create the message
      const message = await this.messageService.createMessage({
        chatRoomId: data.roomId,
        userId: client.userId,
        content: data.content,
        createdAt: data.createdAt,
      });

      // Broadcast to room
      this.server.to(`room:${data.roomId}`).emit('newMessage', message);

      return { success: true, messageId: message.id };
    } catch (error) {
      this.handleError(client, error, 'Send message error:');
    }
  }

  @UseGuards(PermissionGuard)
  @SubscribeMessage('getMessages')
  @RequirePermission('CHAT:MESSAGE:READ:$resourceId', {
    allowOwner: false,
    resourceIdField: undefined,
    constraintField: 'roomId',
  })
  async handleGetMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      roomId: number;
      limit?: number;
      beforeId?: number;
      beforeDate?: Date;
    },
  ) {
    try {
      // Get messages with pagination
      const messages = await this.messageService.getRoomMessages(
        data.roomId,
        data.limit || 50,
        data.beforeId,
        data.beforeDate,
      );

      // Return messages directly to the requesting client only
      return {
        success: true,
        roomId: data.roomId,
        messages: messages,
      };
    } catch (error) {
      this.handleError(client, error, 'Get messages error:');
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get messages',
      };
    }
  }

  @UseGuards(PermissionGuard)
  @SubscribeMessage('deleteMessage')
  @RequirePermission('CHAT:MESSAGE:DELETE:$resourceId', {
    allowOwner: true,
    resourceType: 'message',
    resourceIdField: 'messageId',
    constraintField: 'roomId',
  })
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: number; roomId: number },
  ) {
    try {
      // 1. Get the message to verify it exists
      const message = await this.messageService.getMessage(data.messageId);

      if (!message) {
        throw new WsException('Message not found');
      }

      // Verify the provided roomId matches the message's room
      if (message.chat_room_id !== data.roomId) {
        throw new WsException('Invalid room ID for this message');
      }

      // 2. Perform the soft-delete operation and get updated message
      const deletedMessage = await this.messageService.softDeleteMessage(
        data.messageId,
        client.userId,
      );

      // 3. Broadcast deletion to all users in the room using the actual timestamp
      this.server.to(`room:${data.roomId}`).emit('messageDeleted', {
        messageId: deletedMessage.id,
        roomId: deletedMessage.chat_room_id,
        deletedBy: deletedMessage.deleted_by_user_id,
        deletedAt: deletedMessage.deleted_at,
      });

      // 4. Return success to the client that initiated the deletion
      return {
        success: true,
        deletedAt: deletedMessage.deleted_at, // Include the actual timestamp in the response
      };
    } catch (error) {
      this.handleError(client, error, 'Delete message error:');
    }
  }
}
