import { Injectable, Logger } from '@nestjs/common';
import { ChatRoomService } from './chat-room.service';
import { MessageService } from './message.service';
import { PermissionService } from './permission.service';
import { UserCacheService } from '../cache/user-cache.service';
import { SimpleUser } from '../interfaces/simple-user.interface';
import { ChatRoom } from '../entities/chat-room.entity';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRoomService: ChatRoomService,
    private readonly messageService: MessageService,
    private readonly permissionService: PermissionService,
    private readonly userCacheService: UserCacheService,
  ) {}

  /**
   * Fetches details (ID and username) for a list of user IDs using the cache.
   */
  private _getUsersDetails(userIds: number[]): SimpleUser[] {
    // Fix: Use JSON.stringify for logging arrays in template literals
    this.logger.debug(
      `Fetching details for user IDs from cache: ${JSON.stringify(userIds)}`,
    );
    const users: SimpleUser[] = [];

    for (const id of userIds) {
      const username = this.userCacheService.getUsernameById(id);
      if (username) {
        users.push({ id, username });
      } else {
        this.logger.warn(`Username for user ID ${id} not found in cache.`);
        users.push({ id, username: `User_${id}` }); // Default fallback
      }
    }
    return users;
  }

  /**
   * Gets details for a single permitted room (messages, user count).
   */
  private async _getPermittedRoomDetails(
    userId: number,
    room: ChatRoom,
  ): Promise<{ messages: any[]; userCount: number } | null> {
    try {
      const hasPermission = await this.permissionService.hasPermission(
        userId,
        'CHAT',
        'MESSAGE',
        'READ',
        room.id,
      );

      if (!hasPermission) {
        return null;
      }

      const messages = await this.messageService.getRoomMessages(room.id, 10);
      const userIdsInRoom = await this.chatRoomService.getUsersInRoom(room.id);

      return { messages, userCount: userIdsInRoom.length };
    } catch (error) {
      this.logger.error(
        `Error processing details for room ${room.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Get initial data for a user connecting to the chat service.
   */
  async getUserInitialData(userId: number): Promise<{
    success: boolean;
    rooms: any[];
    roomMessages: Record<number, any[]>;
    users: SimpleUser[];
    error?: string;
  }> {
    try {
      const userRooms = await this.chatRoomService.getRoomsForUser(userId);
      this.logger.debug(
        `User ${userId} is in rooms: ${JSON.stringify(userRooms.map((r) => r.id))}`,
      );

      const responseRooms: any[] = [];
      const responseMessages: Record<number, any[]> = {};
      const uniqueUserIds = new Set<number>([userId]);

      for (const room of userRooms) {
        const roomDetails = await this._getPermittedRoomDetails(userId, room);

        if (roomDetails) {
          responseRooms.push({
            ...room,
            userCount: roomDetails.userCount,
          });
          responseMessages[room.id] = roomDetails.messages;

          const userIdsInRoom = await this.chatRoomService.getUsersInRoom(
            room.id,
          );
          userIdsInRoom.forEach((id) => uniqueUserIds.add(id));
        }
      }

      const usersDetails = this._getUsersDetails(Array.from(uniqueUserIds));

      return {
        success: true,
        rooms: responseRooms,
        roomMessages: responseMessages,
        users: usersDetails,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get user initial data for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        success: false,
        rooms: [],
        roomMessages: {},
        users: [],
        error: 'Failed to get initial chat data.',
      };
    }
  }

  /**
   * Gets a list of users relevant to the specified user using the cache.
   */
  async getRelevantUsers(userId: number): Promise<SimpleUser[]> {
    try {
      const userRooms = await this.chatRoomService.getRoomsForUser(userId);
      const uniqueUserIds = new Set<number>([userId]);

      for (const room of userRooms) {
        const userIdsInRoom = await this.chatRoomService.getUsersInRoom(
          room.id,
        );
        userIdsInRoom.forEach((id) => uniqueUserIds.add(id));
      }

      const usersDetails = this._getUsersDetails(Array.from(uniqueUserIds));
      return usersDetails;
    } catch (error) {
      this.logger.error(
        `Failed to get relevant users for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }

  /**
   * Get rooms that a user has permission to access
   */
  async getUserPermittedRooms(userId: number): Promise<{ roomId: number }[]> {
    try {
      const rooms = await this.chatRoomService.getRoomsForUser(userId);

      const permittedRooms = await Promise.all(
        rooms.map(async (room) => {
          const hasPermission = await this.permissionService.hasPermission(
            userId,
            'CHAT',
            'MESSAGE',
            'READ',
            room.id,
          );
          return hasPermission ? { roomId: room.id } : null;
        }),
      );

      // Type assertion is safe here because filter removes nulls
      return permittedRooms.filter(
        (room): room is { roomId: number } => room !== null,
      );
    } catch (error) {
      this.logger.error(
        'Failed to get user permitted rooms',
        error instanceof Error ? error.message : 'Unknown error',
        // Fix: Check if error is an instance of Error before accessing stack
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }
}
