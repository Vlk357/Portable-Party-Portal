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
   * Converts a Map of user IDs to usernames into an array of SimpleUser objects.
   */
  private _mapUsersToSimpleUsers(
    userMap: ReadonlyMap<number, string>,
  ): SimpleUser[] {
    const usersDetails: SimpleUser[] = [];
    userMap.forEach((username, id) => {
      // Ensure we don't include users with missing usernames if the map somehow contains them
      if (username) {
        usersDetails.push({ id, username });
      } else {
        // Log if a user ID exists in the map but has no username (should ideally not happen with getUserMap)
        this.logger.warn(
          `User ID ${id} found in cache map but has no username.`,
        );
      }
    });
    return usersDetails;
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

      for (const room of userRooms) {
        const roomDetails = await this._getPermittedRoomDetails(userId, room);

        if (roomDetails) {
          responseRooms.push({
            ...room,
            userCount: roomDetails.userCount,
          });
          responseMessages[room.id] = roomDetails.messages;
        }
      }

      // Fetch ALL users from the cache map
      const allUsersMap = this.userCacheService.getUserMap();
      // Convert the map to the SimpleUser array using the helper
      const allUsersDetails = this._mapUsersToSimpleUsers(allUsersMap);
      this.logger.debug(
        `Included ${allUsersDetails.length} users in initial data for user ${userId}.`,
      );

      return {
        success: true,
        rooms: responseRooms,
        roomMessages: responseMessages,
        users: allUsersDetails,
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
   * Gets a list of all users currently known by the UserCacheService.
   */
  getAllCachedUsers(): SimpleUser[] {
    try {
      this.logger.debug('Fetching all users from cache.');
      const allUsersMap = this.userCacheService.getUserMap();
      // Use the helper function for conversion
      const usersDetails = this._mapUsersToSimpleUsers(allUsersMap);
      this.logger.debug(`Returning ${usersDetails.length} users from cache.`);
      return usersDetails;
    } catch (error) {
      this.logger.error(
        `Failed to get all cached users: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }
}
