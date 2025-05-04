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
import { ModuleEnum } from 'src/enums/module.enum';
import { ResourceEnum } from 'src/enums/resource.enum';
import { ActionEnum } from 'src/enums/action.enum';
interface AuthenticatedSocket extends Socket {
  userId: number;
}

@WebSocketGateway({
  namespace: 'chat',
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
      const userId = await this.wsAuthMiddleware.authenticate(client);
      const authClient = this.setupUserConnection(client, userId);

      // Call the service method to ensure membership in the General room
      await this.chatRoomService.ensureUserMembershipInGeneralRoom(userId);

      // Get rooms the user has permission to access initially
      const permittedRooms =
        await this.chatService.getUserPermittedRooms(userId);

      this.logger.log(permittedRooms);

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
    constraintField: 'roomId',
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

  @UseGuards(PermissionGuard)
  @SubscribeMessage('inviteUsersToRoom')
  @RequirePermission('CHAT:CHAT_ROOM:UPDATE:$resourceId', {
    allowOwner: false,
    resourceIdField: 'roomId',
    constraintField: 'roomId',
  })
  async handleInviteUsers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; userIds: number[] },
  ): Promise<{ success: boolean; error?: string }> {
    const { roomId, userIds } = data;
    if (
      !roomId ||
      !userIds ||
      !Array.isArray(userIds) ||
      userIds.length === 0
    ) {
      throw new WsException(
        'Invalid input: roomId and a non-empty userIds array are required.',
      );
    }

    this.logger.log(
      `User ${client.userId} attempting to invite ${userIds.length} users to room ${roomId}`,
    );
    const userRoleName = `CHAT_ROOM_${roomId}_USER`; // Basic user role

    try {
      const invitePromises = userIds.map(async (userId) => {
        try {
          // 1. Assign the basic user role
          await this.permissionService.assignRole(userId, userRoleName);

          // 2. Add user to the room membership list
          await this.chatRoomService.addUserToRoom(roomId, userId);

          // 3. Join user's sockets to the room
          const userSockets = this.userSockets.get(userId);
          if (userSockets && userSockets.length > 0) {
            const joinPromises = userSockets.map((socket) =>
              socket.join(`room:${roomId}`),
            );
            await Promise.all(joinPromises);
            this.logger.log(
              `Joined invited user ${userId} (${userSockets.length} sockets) to socket room: room:${roomId}`,
            );

            // 4. Notify the invited user
            // Fetch room details to send in notification
            const roomDetails = await this.chatRoomService.getRoom(roomId);
            if (roomDetails) {
              this.broadcastToUser(userId, 'addedToRoom', roomDetails);
            }
          } else {
            this.logger.log(
              `Invited user ${userId} has no active sockets to join to room:${roomId}`,
            );
          }
        } catch (inviteError) {
          this.logger.error(
            `Failed to invite user ${userId} to room ${roomId}: ${inviteError instanceof Error ? inviteError.message : String(inviteError)}`,
          );
          // Continue processing other users
        }
      });

      await Promise.all(invitePromises);

      // Notify the inviter of success
      return { success: true };
    } catch (error) {
      this.handleError(client, error, 'Invite users error:');
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to invite users',
      };
    }
  }

  @UseGuards(PermissionGuard)
  @SubscribeMessage('removeUsersFromRoom')
  async handleRemoveUsers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; userIds: number[] },
  ): Promise<{ success: boolean; error?: string }> {
    const { roomId, userIds } = data;
    if (
      !roomId ||
      !userIds ||
      !Array.isArray(userIds) ||
      userIds.length === 0
    ) {
      throw new WsException(
        'Invalid input: roomId and a non-empty userIds array are required.',
      );
    }

    this.logger.log(
      `User ${client.userId} attempting to remove ${userIds.length} users from room ${roomId}`,
    );

    // Define the permission needed to remove *other* users
    const requiredPermission = {
      module: ModuleEnum.CHAT,
      resource: ResourceEnum.CHAT_ROOM,
      action: ActionEnum.UPDATE, // Or DELETE if more specific
      constraint: roomId,
    };

    try {
      const removePromises = userIds.map(async (userId) => {
        try {
          let canRemove = false;
          // Case 1: User is removing themselves (leaving)
          if (userId === client.userId) {
            canRemove = true;
            this.logger.log(`User ${client.userId} is leaving room ${roomId}`);
          }
          // Case 2: User is removing someone else - check permission
          else {
            const hasPermission = await this.permissionService.hasPermission(
              client.userId,
              requiredPermission.module,
              requiredPermission.resource,
              requiredPermission.action,
              requiredPermission.constraint,
            );
            if (hasPermission) {
              canRemove = true;
              this.logger.log(
                `User ${client.userId} has permission to remove user ${userId} from room ${roomId}`,
              );
            } else {
              this.logger.warn(
                `User ${client.userId} lacks permission to remove user ${userId} from room ${roomId}`,
              );
            }
          }

          // Proceed if allowed
          if (canRemove) {
            // 1. Remove user from room membership list
            await this.chatRoomService.removeUserFromRoom(roomId, userId);

            // 2. Revoke room-specific roles (implement revokeRole in PermissionService/Repo)
            await this.permissionService.revokeAllRoomRoles(userId, roomId);

            // 3. Make user's sockets leave the room
            const userSockets = this.userSockets.get(userId);
            if (userSockets && userSockets.length > 0) {
              const leavePromises = userSockets.map((socket) =>
                socket.leave(`room:${roomId}`),
              );
              await Promise.all(leavePromises);
              this.logger.log(
                `Made user ${userId} (${userSockets.length} sockets) leave socket room: room:${roomId}`,
              );

              // 4. Notify the removed user
              this.broadcastToUser(userId, 'removedFromRoom', { roomId });
            } else {
              this.logger.log(
                `User ${userId} to be removed has no active sockets in room:${roomId}`,
              );
            }
          }
        } catch (removeError) {
          this.logger.error(
            `Failed to remove user ${userId} from room ${roomId}: ${removeError instanceof Error ? removeError.message : String(removeError)}`,
          );
          // Continue processing other users
        }
      });

      await Promise.all(removePromises);

      // Notify the remover of success (even if some removals were skipped due to permissions)
      return { success: true };
    } catch (error) {
      // Handle broader errors (e.g., database connection issues)
      this.handleError(client, error, 'Remove users error:');
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to remove users',
      };
    }
  }

  /**
   * Handles request to get all users known to the chat service cache.
   */
  @SubscribeMessage('getUsers')
  handleGetUsers(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const users = this.chatService.getAllCachedUsers();
      this.logger.log(
        `User ${client.userId} requested all users. Found ${users.length}.`,
      );
      return { success: true, users: users };
    } catch (error) {
      this.handleError(client, error, 'Get users error:');
      return {
        success: false,
        users: [],
        error: error instanceof Error ? error.message : 'Failed to get users',
      };
    }
  }
}
