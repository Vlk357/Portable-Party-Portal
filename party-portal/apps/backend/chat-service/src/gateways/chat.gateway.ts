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
import { Logger, UseGuards } from '@nestjs/common';
import { ChatRoomService } from '../services/chat-room.service';
import { MessageService } from '../services/message.service';
import { MessageDeliveryStatusService } from '../services/message-delivery-status.service';

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
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Token validation will go here
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      // For now, mock user authentication
      client.userId = 1; // This will come from token
      
      // Store socket connection
      const userSockets = this.userSockets.get(client.userId) || [];
      userSockets.push(client);
      this.userSockets.set(client.userId, userSockets);

      this.logger.log(`Client connected: ${client.id}`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userSockets = this.userSockets.get(client.userId) || [];
    const index = userSockets.indexOf(client);
    if (index > -1) {
      userSockets.splice(index, 1);
      if (userSockets.length === 0) {
        this.userSockets.delete(client.userId);
      } else {
        this.userSockets.set(client.userId, userSockets);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: number, displayName: string }
  ) {
    try {
      const userHistory = await this.chatRoomService.joinRoom(
        data.roomId,
        client.userId,
        data.displayName
      );
      
      client.chatRoomUserId = userHistory.id;
      client.join(`room:${data.roomId}`);

      // Send recent messages
      const messages = await this.messageService.getRoomMessages(data.roomId);
      client.emit('recentMessages', messages);

      // Notify room about new user
      this.server.to(`room:${data.roomId}`).emit('userJoined', {
        userId: client.userId,
        displayName: data.displayName
      });
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: {
      roomId: number;
      content: string;
      isPriority?: boolean;
      requiresReadReceipt?: boolean;
      threadParentId?: number;
      replyToMessageIds?: number[];
    }
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
        replyToMessageIds: data.replyToMessageIds
      });

      // Broadcast to room
      this.server.to(`room:${data.roomId}`).emit('newMessage', message);

      // Mark as delivered for sender
      await this.statusService.markAsDelivered(message.id, client.chatRoomUserId);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('messageDelivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: number }
  ) {
    try {
      await this.statusService.markAsDelivered(data.messageId, client.chatRoomUserId);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('messageSeen')
  async handleMessageSeen(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: number }
  ) {
    try {
      await this.statusService.markAsSeen(data.messageId, client.chatRoomUserId);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }
}