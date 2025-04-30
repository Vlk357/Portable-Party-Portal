import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatRoomRepository } from '../repositories/chat-room.repository';
import { ChatRoom } from '../entities/chat-room.entity';
import { ChatRoomUserRepository } from '../repositories/chat-room-user.repository';
import { ServiceError } from 'src/errors/service.error';
import { RepositoryError } from 'src/errors/repository.error'; // Assuming RepositoryError exists
import { PermissionService } from './permission.service';
import { ModuleEnum } from 'src/enums/module.enum';
import { ResourceEnum } from 'src/enums/resource.enum';
import { ActionEnum } from 'src/enums/action.enum';

// Define the structure for update data if not using DTOs directly in service
interface UpdateRoomData {
  name?: string;
  description?: string;
}

@Injectable()
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);

  constructor(
    private readonly chatRoomRepository: ChatRoomRepository,
    private readonly chatRoomUserRepository: ChatRoomUserRepository,
    private readonly permissionService: PermissionService,
  ) {}

  private handleError(operation: string, error: unknown): never {
    const serviceError =
      error instanceof Error
        ? new ServiceError(`Failed to ${operation}`, operation, error)
        : new ServiceError(`Failed to ${operation}: Unknown error`, operation);

    this.logger.error(serviceError.message, serviceError.cause?.stack);

    // Map to appropriate HTTP exceptions for controller/gateway layer if needed
    // This mapping might be better placed in the controller/gateway itself
    if (
      error instanceof NotFoundException ||
      (error instanceof RepositoryError && error.message.includes('not found'))
    ) {
      throw new NotFoundException(serviceError.message);
    }
    // Throw a more generic server error for other cases
    throw new InternalServerErrorException(serviceError.message);
  }

  /**
   * Sets up the default roles and abilities for a newly created chat room.
   */
  private async setupChatRoomPermissions(
    roomId: number,
    creatorUserId: number,
  ): Promise<void> {
    this.logger.log(`Setting up permissions for new room ${roomId}`);
    const constraint = roomId.toString(); // Use roomId as the constraint

    try {
      // Define abilities required for the room
      const roomAbilities = [
        // Chat Room Management
        {
          module: ModuleEnum.CHAT,
          resource: ResourceEnum.CHAT_ROOM,
          action: ActionEnum.READ,
          constraint,
        },
        {
          module: ModuleEnum.CHAT,
          resource: ResourceEnum.CHAT_ROOM,
          action: ActionEnum.UPDATE,
          constraint,
        },
        {
          module: ModuleEnum.CHAT,
          resource: ResourceEnum.CHAT_ROOM,
          action: ActionEnum.DELETE,
          constraint,
        },
        // Message Management within the room
        {
          module: ModuleEnum.CHAT,
          resource: ResourceEnum.MESSAGE,
          action: ActionEnum.READ,
          constraint,
        },
        {
          module: ModuleEnum.CHAT,
          resource: ResourceEnum.MESSAGE,
          action: ActionEnum.CREATE,
          constraint,
        },
        {
          module: ModuleEnum.CHAT,
          resource: ResourceEnum.MESSAGE,
          action: ActionEnum.DELETE,
          constraint,
        },
      ];

      // Define role structures
      const rolesToCreate = [
        {
          name: `CHAT_ROOM_${roomId}_ADMIN`,
          description: `Admin role for Chat Room ${roomId}`,
          abilities: roomAbilities, // Admin gets all defined abilities
        },
        {
          name: `CHAT_ROOM_${roomId}_USER`,
          description: `Basic user role for Chat Room ${roomId}`,
          abilities: [
            // Can read the room itself
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.CHAT_ROOM,
              action: ActionEnum.READ,
              constraint,
            },
            // Can read and create messages
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.MESSAGE,
              action: ActionEnum.READ,
              constraint,
            },
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.MESSAGE,
              action: ActionEnum.CREATE,
              constraint,
            },
          ],
        },
        {
          name: `CHAT_ROOM_${roomId}_READONLY`,
          description: `Read-only role for Chat Room ${roomId}`,
          abilities: [
            // Can read the room itself
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.CHAT_ROOM,
              action: ActionEnum.READ,
              constraint,
            },
            // Can read messages
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.MESSAGE,
              action: ActionEnum.READ,
              constraint,
            },
          ],
        },
      ];

      // Create roles (PermissionService.createRole handles finding/creating abilities)
      for (const roleData of rolesToCreate) {
        // Check if role already exists before creating
        const existingRole = await this.permissionService.findRoleByName(
          roleData.name,
        );
        if (!existingRole) {
          await this.permissionService.createRole(
            roleData.name,
            roleData.description,
            roleData.abilities,
          );
          this.logger.log(`Created role: ${roleData.name}`);
        } else {
          this.logger.log(`Role already exists: ${roleData.name}`);
          // Optionally: Update existing role's abilities if needed
        }
      }

      // Assign the Admin role to the creator
      await this.permissionService.assignRole(
        creatorUserId,
        `CHAT_ROOM_${roomId}_ADMIN`,
      );
      await this.addUserToRoom(roomId, creatorUserId);
      this.logger.log(
        `Added creator ${creatorUserId} to room ${roomId} user list.`,
      );
      this.logger.log(
        `Assigned ADMIN role for room ${roomId} to creator ${creatorUserId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set up permissions for room ${roomId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw the error to be caught by the calling method (createRoom)
      throw new InternalServerErrorException(
        `Failed to setup permissions for room ${roomId}`,
      );
    }
  }

  async createRoom(chatRoomData: {
    name: string;
    description?: string;
    createdByUserId: number;
    users?: number[];
  }): Promise<ChatRoom> {
    let room: ChatRoom | null = null;
    try {
      // 1. Create the room locally
      room = await this.chatRoomRepository.create({
        name: chatRoomData.name,
        description: chatRoomData.description,
        created_by_user_id: chatRoomData.createdByUserId,
      });

      if (!room) {
        throw new InternalServerErrorException(
          'Room creation failed unexpectedly.',
        ); // Use a more specific error
      }

      this.logger.log(
        `Created new chat room locally: ${room.id} - ${room.name}`,
      );

      // 2. Set up permissions within chat-service
      await this.setupChatRoomPermissions(
        room.id,
        chatRoomData.createdByUserId,
      );

      // 4. Add initial users (if provided) and assign USER role
      if (chatRoomData.users && chatRoomData.users.length > 0) {
        this.logger.log(
          `Adding ${chatRoomData.users.length} initial users to room ${room.id}`,
        );
        const userRoleName = `CHAT_ROOM_${room.id}_USER`; // Basic user role

        // Create an array of promises for adding users and assigning roles
        const addUserPromises = chatRoomData.users
          .filter((userId) => userId !== chatRoomData.createdByUserId)
          .map(async (userId) => {
            try {
              await this.permissionService.assignRole(userId, userRoleName);
              await this.addUserToRoom(room!.id, userId);
              this.logger.log(
                `Added initial user ${userId} to room ${room!.id} with role ${userRoleName}`,
              );
            } catch (addUserError) {
              this.logger.error(
                `Failed to add initial user ${userId} to room ${room!.id}: ${addUserError instanceof Error ? addUserError.message : String(addUserError)}`,
              );
            }
          });

        // Wait for all addUser operations to complete
        await Promise.all(addUserPromises);
        this.logger.log(
          `Finished processing initial users for room ${room.id}.`,
        );
      }

      return room; // Return the successfully created room
    } catch (error) {
      // Re-throw the original error using the handler
      this.handleError('create chat room and setup permissions/users', error);
    }
  }

  async getActiveRooms(): Promise<ChatRoom[]> {
    try {
      return await this.chatRoomRepository.findActiveRooms();
    } catch (error) {
      this.handleError('get active rooms', error);
    }
  }

  async deleteRoom(id: number, userId: number): Promise<void> {
    try {
      const room = await this.chatRoomRepository.findById(id);

      if (!room || room.deleted_at) {
        throw new NotFoundException(
          `Chat room ${id} not found. Perhaps already deleted?`,
        );
      }
      await this.chatRoomRepository.update(id, {
        deleted_at: new Date(),
        deleted_by_user_id: userId,
      });

      this.logger.log(`Chat room ${id} deleted by user ${userId}`);
    } catch (error) {
      this.handleError('delete chat room', error);
    }
  }

  async updateRoom(id: number, updateData: UpdateRoomData): Promise<ChatRoom> {
    try {
      // 1. Find the room
      const room = await this.chatRoomRepository.findById(id);

      // 2. Check if room exists and is not deleted
      if (!room || room.deleted_at) {
        throw new NotFoundException(
          `Chat room ${id} not found or has been deleted`,
        );
      }

      // 3. Update properties if provided
      let updated = false;
      if (updateData.name !== undefined && updateData.name !== room.name) {
        room.name = updateData.name;
        updated = true;
      }
      if (
        updateData.description !== undefined &&
        updateData.description !== room.description
      ) {
        room.description = updateData.description;
        updated = true;
      }

      // 4. Save if changes were made
      if (updated) {
        const updatedRoom = await this.chatRoomRepository.updateAndReturn(
          id,
          room,
        );
        this.logger.log(`Updated chat room ${id}`);
        return updatedRoom;
      } else {
        this.logger.log(
          `No changes detected for chat room ${id}. Skipping update.`,
        );
        return room; // Return the original room if no changes
      }
    } catch (error) {
      // 5. Handle errors
      this.handleError(`update chat room ${id}`, error);
    }
  }

  async addUserToRoom(roomId: number, userId: number): Promise<void> {
    const existing = await this.chatRoomUserRepository.findUserInRoom(
      roomId,
      userId,
    );
    if (!existing) {
      await this.chatRoomUserRepository.create({
        chat_room_id: roomId,
        user_id: userId,
      });
    }
  }

  async removeUserFromRoom(roomId: number, userId: number): Promise<void> {
    await this.chatRoomUserRepository.delete(roomId, userId);
  }

  async getUsersInRoom(roomId: number): Promise<number[]> {
    const roomUsers = await this.chatRoomUserRepository.findUsersInRoom(roomId);
    return roomUsers.map((u) => u.user_id);
  }

  async getRoomsForUser(userId: number): Promise<ChatRoom[]> {
    try {
      return await this.chatRoomRepository.findRoomsForUser(userId);
    } catch (error) {
      this.handleError('get rooms for user', error);
    }
  }

  /*   async ensureGeneralChatExists(chatServiceId: number): Promise<number> {
    const GENERAL_CHAT_NAME = process.env.GENERAL_CHAT_NAME
      ? `${process.env.GENERAL_CHAT_NAME}`
      : 'General';

    try {
      // Find rooms created by the chat service
      const existingRooms =
        await this.chatRoomRepository.findUserCreatedRooms(chatServiceId);

      // Filter to find general chat(s)
      const generalChats = existingRooms.filter(
        (room) => room.created_by_user_id === chatServiceId,
      );

      if (generalChats.length === 0) {
        // Create general chat if it doesn't exist
        this.logger.log('Creating general chat room');

        const generalRoom = await this.createRoom({
          name: GENERAL_CHAT_NAME,
          description: 'Chat room for all users',
          createdByUserId: chatServiceId,
        });

        this.logger.log(`General chat room created with ID: ${generalRoom.id}`);
        return generalRoom.id;

        // Create permissions for this room would go here
        // This would be implemented in the PermissionClientService
      } else if (generalChats.length === 1) {
        // One general chat exists, which is the expected case
        this.logger.log(`General chat exists with ID: ${generalChats[0].id}`);
        return generalChats[0].id;
      } else {
        // Multiple general chats exist, which is an error state
        const ids = generalChats.map((room) => room.id).join(', ');
        this.logger.error(
          `Multiple general chat rooms detected with IDs: ${ids}`,
        );
        // Keep the system running, but notify admins
        // You could add a notification service here
      }
    } catch (error) {
      this.logger.error('Failed to ensure general chat exists', error);
      throw error;
    }
    throw Error('General chat existence was not ensured');
  } */

  async getRoom(id: number): Promise<ChatRoom | null> {
    try {
      const room = await this.chatRoomRepository.findById(id);
      return room;
    } catch (error) {
      this.handleError('get chat room', error);
    }
  }
}
