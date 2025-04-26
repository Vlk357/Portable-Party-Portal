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
import { ChatService } from 'src/services/chat.service';
import { CreateRoomDto } from 'src/dtos/create-room.dto';
import { ChatRoom } from 'src/entities/chat-room.entity';
import { UpdateRoomDto } from 'src/dtos/update-room.dto';
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
    private readonly chatService: ChatService,
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

      // Get rooms the user has permission to access
      const permittedRooms =
        await this.chatService.getUserPermittedRooms(userId);

      // Join all permitted rooms
      for (const room of permittedRooms) {
        await authClient.join(`room:${room.roomId}`);
      }

      // Get complete initial data
      const initialData = await this.chatService.getUserInitialData(userId);

      // Send initial data to client
      authClient.emit('initialData', initialData);

      this.logger.log(`Client connected: ${authClient.id} (User: ${userId})`);
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

  handleDisconnect(client: AuthenticatedSocket) {
    try {
      const userId = client.userId;
      if (!userId) return; // Skip if no userId (not authenticated)

      // Get all the rooms this socket is in
      const socketRooms = Array.from(client.rooms).filter(
        (room) => room !== client.id && room.startsWith('room:'),
      );

      // Leave all rooms (Socket.io automatically handles this, but we log it)
      this.logger.debug(
        `Client ${client.id} leaving ${socketRooms.length} rooms`,
      );

      const userSockets = this.userSockets.get(userId) || [];
      const remainingSockets = userSockets.filter(
        (socket) => socket !== client,
      );

      if (remainingSockets.length > 0) {
        this.userSockets.set(userId, remainingSockets);
      } else {
        this.userSockets.delete(userId);
      }

      this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);
    } catch (error) {
      // Properly typed error handling
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Disconnection error: ${errorMessage}`);
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

  // --- Chat Room Handlers ---

  @UseGuards(PermissionGuard)
  @SubscribeMessage('createRoom')
  @RequirePermission('CHAT:CHAT_ROOM:CREATE')
  async handleCreateRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: CreateRoomDto,
  ): Promise<{ success: boolean; room?: ChatRoom; error?: string }> {
    try {
      const newRoom = await this.chatRoomService.createRoom({
        name: data.name,
        description: data.description,
        createdByUserId: client.userId,
        users: data.users,
      });

      // Automatically join the creator to the new room's socket.io room
      await client.join(`room:${newRoom.id}`);
      this.logger.log(
        `Creator ${client.userId} joined socket room: room:${newRoom.id}`,
      );

      // Join initial users to the socket.io room
      if (data.users && data.users.length > 0) {
        this.logger.log(
          `Attempting to join ${data.users.length} initial users to socket room: room:${newRoom.id}`,
        );
        for (const userId of data.users) {
          // Don't try to rejoin the creator
          if (userId === client.userId) continue;

          const userSockets = this.userSockets.get(userId);
          if (userSockets && userSockets.length > 0) {
            // Join all active sockets for this user to the room
            const joinPromises = userSockets.map((socket) =>
              socket.join(`room:${newRoom.id}`),
            );
            await Promise.all(joinPromises);
            this.logger.log(
              `Joined user ${userId} (${userSockets.length} sockets) to socket room: room:${newRoom.id}`,
            );
          } else {
            // User might not be connected, log this but don't fail
            this.logger.log(
              `User ${userId} not found or has no active sockets, cannot join to room:${newRoom.id}`,
            );
          }
        }
      }

      // Return the created room details to the creator
      return { success: true, room: newRoom };
    } catch (error) {
      this.handleError(client, error, 'Create room error:');
      // Return error structure for WebSocket response
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create room',
      };
    }
  }

  @UseGuards(PermissionGuard)
  @SubscribeMessage('updateRoom')
  // Permission needs to check against the specific room ID being updated
  @RequirePermission('CHAT:CHAT_ROOM:UPDATE:$resourceId', {
    allowOwner: false, // Or true if owners can always update? Define in Voter.
    resourceIdField: 'roomId', // Field in the message body containing the ID
    constraintField: 'roomId', // Use roomId also as the constraint for the ability lookup
  })
  async handleUpdateRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: UpdateRoomDto & { roomId: number }, // Combine DTO with roomId
  ): Promise<{ success: boolean; room?: ChatRoom; error?: string }> {
    try {
      const { roomId, ...updateData } = data; // Separate roomId from update payload
      if (!roomId) {
        throw new WsException('Room ID is required for update');
      }

      const updatedRoom = await this.chatRoomService.updateRoom(
        roomId,
        updateData,
      );

      // Broadcast the update to all users currently in that room
      this.server
        .to(`room:${roomId}`)
        .emit('roomUpdated', { roomId: updatedRoom.id, ...updateData }); // Send only updated fields

      return { success: true, room: updatedRoom };
    } catch (error) {
      this.handleError(client, error, 'Update room error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update room',
      };
    }
  }

  @UseGuards(PermissionGuard)
  @SubscribeMessage('deleteRoom')
  // Permission needs to check against the specific room ID being deleted
  @RequirePermission('CHAT:CHAT_ROOM:DELETE:$resourceId', {
    allowOwner: false, // Or true? Define in Voter.
    resourceIdField: 'roomId', // Field in the message body containing the ID
    constraintField: 'roomId', // Use roomId also as the constraint for the ability lookup
  })
  async handleDeleteRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: number }, // Simple payload with just the ID
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!data.roomId) {
        throw new WsException('Room ID is required for deletion');
      }

      await this.chatRoomService.deleteRoom(data.roomId, client.userId);

      // Broadcast the deletion event to the room
      this.server
        .to(`room:${data.roomId}`)
        .emit('roomDeleted', { roomId: data.roomId });

      // Optionally, make all sockets leave the room on the server side
      this.server.socketsLeave(`room:${data.roomId}`);

      return { success: true };
    } catch (error) {
      this.handleError(client, error, 'Delete room error:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete room',
      };
    }
  }

  // Update getInitialData to be simpler and just reuse the service
  @SubscribeMessage('getInitialData')
  async handleGetInitialData(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      // This is now just a refreshing method that reuses the service
      const initialData = await this.chatService.getUserInitialData(
        client.userId,
      );
      return initialData;
    } catch (error) {
      this.handleError(client, error, 'Get initial data error:');
      return {
        success: false,
        rooms: [],
        roomMessages: {},
        error:
          error instanceof Error ? error.message : 'Failed to get initial data',
      };
    }
  }
}
