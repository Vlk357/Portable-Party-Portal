import { Injectable, Logger } from '@nestjs/common';
import { ChatRoomService } from './chat-room.service';
import { MessageService } from './message.service';
import { PermissionService } from './permission.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRoomService: ChatRoomService,
    private readonly messageService: MessageService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Get initial data for a user connecting to the chat service
   */
  async getUserInitialData(userId: number): Promise<{
    success: boolean;
    rooms: any[];
    roomMessages: Record<number, any[]>;
    error?: string;
  }> {
    try {
      // Get all rooms for this user
      const rooms = await this.chatRoomService.getRoomsForUser(userId);

      // Prepare response structure
      const response = {
        success: true,
        rooms: [] as any[],
        roomMessages: {} as Record<number, any[]>,
      };

      // For each room, get permissions and latest messages
      for (const room of rooms) {
        try {
          // Check if user has permission to read messages in this room
          const hasPermission = await this.permissionService.hasPermission(
            userId,
            'CHAT',
            'MESSAGE',
            'READ',
            `${room.id}`,
          );

          if (hasPermission) {
            // Get latest messages (limited to 20 for initial load)
            const messages = await this.messageService.getRoomMessages(
              room.id,
              20,
            );

            // Store messages in response
            response.roomMessages[room.id] = messages;

            // Add room to response with user count
            const userIds = await this.chatRoomService.getUsersInRoom(room.id);
            response.rooms.push({
              ...room,
              userCount: userIds.length,
            });
          }
        } catch (roomError) {
          // Log error but continue with other rooms
          this.logger.error(
            `Error processing room ${room.id}:`,
            roomError instanceof Error ? roomError.message : 'Unknown error',
          );
        }
      }

      return response;
    } catch (error) {
      this.logger.error(
        'Failed to get user initial data',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return {
        success: false,
        rooms: [],
        roomMessages: {},
        error:
          error instanceof Error ? error.message : 'Failed to get initial data',
      };
    }
  }

  /**
   * Get rooms that a user has permission to access
   */
  async getUserPermittedRooms(userId: number): Promise<{ roomId: number }[]> {
    try {
      // Get all rooms for this user
      const rooms = await this.chatRoomService.getRoomsForUser(userId);

      // Filter rooms by permission
      const permittedRooms = await Promise.all(
        rooms.map(async (room) => {
          const hasPermission = await this.permissionService.hasPermission(
            userId,
            'CHAT',
            'MESSAGE',
            'READ',
            `${room.id}`,
          );

          return hasPermission ? { roomId: room.id } : null;
        }),
      );

      return permittedRooms.filter((room) => room !== null);
    } catch (error) {
      this.logger.error(
        'Failed to get user permitted rooms',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return [];
    }
  }
}
