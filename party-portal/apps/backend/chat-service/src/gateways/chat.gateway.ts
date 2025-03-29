import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ChatRoomService } from '../services/chat-room.service';
import { MessageService } from '../services/message.service';
import { MessageDeliveryStatusService } from '../services/message-delivery-status.service';
import { AuthClientService } from 'src/services/auth-client.service';

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
    private readonly authClient: AuthClientService,
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

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Get token from handshake
      const token = client.handshake.auth.token as string;
      if (!token) {
        throw new UnauthorizedException('No auth token provided');
      }

      // Validate token with auth service
      const userId = await this.authClient.validateToken(token);
      client.userId = userId;

      // Store socket connection
      const userSockets = this.userSockets.get(userId) || [];
      userSockets.push(client);
      this.userSockets.set(userId, userSockets);

      // Send initial state to client
      const activeRooms = await this.chatRoomService.getRoomsForUser(userId);
      client.emit('activeRooms', activeRooms);

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
    } catch (error) {
      this.handleError(client, error, 'Connection error: ');
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

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; displayName: string },
  ) {
    try {
      const userHistory = await this.chatRoomService.joinRoom(
        data.roomId,
        client.userId,
        data.displayName,
      );

      client.chatRoomUserId = userHistory.id;
      await client.join(`room:${data.roomId}`);

      // Send recent messages
      const messages = await this.messageService.getRoomMessages(data.roomId);
      client.emit('recentMessages', messages);

      // Notify room about new user
      this.server.to(`room:${data.roomId}`).emit('userJoined', {
        userId: client.userId,
        displayName: data.displayName,
      });
    } catch (error) {
      this.handleError(client, error, 'Join room error: ');
    }
  }

  @SubscribeMessage('sendMessage')
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
      this.handleError(client, error, 'Send message error: ');
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
