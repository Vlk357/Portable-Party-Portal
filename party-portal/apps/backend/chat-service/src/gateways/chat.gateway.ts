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
import { MessageDeliveryStatusService } from '../services/message-delivery-status.service';
import { PermissionService } from '../services/permission.service';
import { PermissionGuard } from '../guards/permission.guard';
import { RequirePermission } from '../guards/permission.guard';
import { WebSocketAuthMiddleware } from '../auth/websocket-auth.middleware';
interface AuthenticatedSocket extends Socket {
  userId: number;
  chatRoomUserId: number;
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
    private readonly statusService: MessageDeliveryStatusService,
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
    } catch (error) {
      this.logger.error(
        `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const userSockets = this.userSockets.get(client.userId) || [];
      const index = userSockets.indexOf(client);

      if (index > -1) {
        // Remove this socket
        userSockets.splice(index, 1);

        if (userSockets.length === 0) {
          // User has no more active connections
          this.userSockets.delete(client.userId);

          // Leave all rooms
          const activeRooms = await this.chatRoomService.getRoomsForUser(
            client.userId,
          );
          await Promise.all(
            activeRooms.map((room) =>
              this.chatRoomService.leaveRoom(room.id, client.userId),
            ),
          );
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
  @RequirePermission('CHAT:MESSAGE:CREATE')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      roomId: number;
      content: string;
      isPriority?: boolean;
      requiresReadReceipt?: boolean;
      threadParentId?: number;
      replyToMessageIds?: number[];
    },
  ) {
    try {
      // Check if user has permission for this specific room
      const canCreateMessages = await this.permissionService.hasPermission(
        client.userId,
        'CHAT',
        'MESSAGE',
        'CREATE',
        data.roomId.toString(),
      );

      if (!canCreateMessages) {
        throw new WsException(
          'You do not have permission to send messages in this room',
        );
      }

      const message = await this.messageService.createMessage({
        chatRoomId: data.roomId,
        userId: client.userId,
        content: data.content,
        createdAt: new Date(),
        isPriority: data.isPriority,
        requiresReadReceipt: data.requiresReadReceipt,
        threadParentId: data.threadParentId,
        replyToMessageIds: data.replyToMessageIds,
      });

      // Broadcast to room
      this.server.to(`room:${data.roomId}`).emit('newMessage', message);

      // Mark as delivered for sender
      await this.statusService.markAsDelivered(
        message.id,
        client.chatRoomUserId,
      );
    } catch (error) {
      this.handleError(client, error, 'Send message error:');
    }
  }

  @SubscribeMessage('messageDelivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: number },
  ) {
    try {
      await this.statusService.markAsDelivered(
        data.messageId,
        client.chatRoomUserId,
      );
    } catch (error) {
      this.handleError(client, error, 'Message delivered error: ');
    }
  }

  @SubscribeMessage('messageSeen')
  async handleMessageSeen(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: number },
  ) {
    try {
      await this.statusService.markAsSeen(
        data.messageId,
        client.chatRoomUserId,
      );
    } catch (error) {
      this.handleError(client, error, 'Message seen error: ');
    }
  }
}
