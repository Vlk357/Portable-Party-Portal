import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  // Remove OnModuleInit if no longer needed
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRoomRepository } from '../repositories/chat-room.repository';
import { ChatRoom } from '../entities/chat-room.entity';
import { ChatRoomUserRepository } from '../repositories/chat-room-user.repository';
import { ServiceError } from 'src/errors/service.error';
import { RepositoryError } from 'src/errors/repository.error';
import { PermissionService } from './permission.service';
import { ModuleEnum } from 'src/enums/module.enum';
import { ResourceEnum } from 'src/enums/resource.enum';
import { ActionEnum } from 'src/enums/action.enum';
import { UserCacheService } from 'src/cache/user-cache.service';

// Define the structure for update data if not using DTOs directly in service
interface UpdateRoomData {
  name?: string;
  description?: string;
}

@Injectable()
// Remove 'implements OnModuleInit'
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);

  constructor(
    private readonly chatRoomRepository: ChatRoomRepository,
    private readonly chatRoomUserRepository: ChatRoomUserRepository,
    private readonly permissionService: PermissionService,
    private readonly configService: ConfigService,
    private readonly userCacheService: UserCacheService,
  ) {}

  // REMOVE onModuleInit method
  // REMOVE ensureGeneralRoomPermissions method

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
   * Sets up the default roles and abilities for a chat room.
   * Called by createRoom and explicitly by the seeder for the General room.
   * Checks for existing roles before creating. Assigns Admin role to creator.
   */
  public async setupChatRoomPermissions(
    // Changed to public
    roomId: number,
    creatorUserId: number,
  ): Promise<void> {
    this.logger.log(`Setting up permissions for room ${roomId}`);
    const constraint = roomId;

    try {
      // Define abilities required for the room
      const roomAbilities = [
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
          abilities: roomAbilities,
        },
        {
          name: `CHAT_ROOM_${roomId}_USER`,
          description: `Basic user role for Chat Room ${roomId}`,
          abilities: [
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.CHAT_ROOM,
              action: ActionEnum.READ,
              constraint,
            },
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
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.CHAT_ROOM,
              action: ActionEnum.READ,
              constraint,
            },
            {
              module: ModuleEnum.CHAT,
              resource: ResourceEnum.MESSAGE,
              action: ActionEnum.READ,
              constraint,
            },
          ],
        },
      ];

      // Create roles if they don't exist
      for (const roleData of rolesToCreate) {
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
        }
      }

      // Assign the Admin role to the creator if they don't have it
      const adminRoleName = `CHAT_ROOM_${roomId}_ADMIN`;
      const hasAdminRole = await this.permissionService.userHasRole(
        creatorUserId,
        adminRoleName,
      ); // Assumes implementation exists
      if (!hasAdminRole) {
        await this.permissionService.assignRole(creatorUserId, adminRoleName);
        this.logger.log(
          `Assigned ADMIN role (${adminRoleName}) for room ${roomId} to user ${creatorUserId}`,
        );
      } else {
        this.logger.log(
          `User ${creatorUserId} already has ADMIN role (${adminRoleName}) for room ${roomId}. Skipping assignment.`,
        );
      }

      // Ensure creator is in the room user list
      await this.addUserToRoom(roomId, creatorUserId);
      this.logger.log(
        `Ensured user ${creatorUserId} is in room ${roomId} user list.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set up permissions for room ${roomId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
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
      // 1. Create the room entity
      room = await this.chatRoomRepository.create({
        // Use create method from repository
        name: chatRoomData.name,
        description: chatRoomData.description,
        created_by_user_id: chatRoomData.createdByUserId,
        // is_general: false, // No is_general flag
      });

      if (!room) {
        throw new InternalServerErrorException(
          'Room creation failed unexpectedly.',
        );
      }
      this.logger.log(
        `Created new chat room locally: ${room.id} - ${room.name}`,
      );

      // 2. Set up permissions (calls the public method above)
      await this.setupChatRoomPermissions(
        room.id,
        chatRoomData.createdByUserId,
      );

      // 3. Add initial users (if provided)
      if (chatRoomData.users && chatRoomData.users.length > 0) {
        this.logger.log(
          `Adding ${chatRoomData.users.length} initial users to room ${room.id}`,
        );
        const userRoleName = `CHAT_ROOM_${room.id}_USER`;
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
        await Promise.all(addUserPromises);
        this.logger.log(
          `Finished processing initial users for room ${room.id}.`,
        );
      }

      return room;
    } catch (error) {
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

  async getRoom(id: number): Promise<ChatRoom | null> {
    try {
      const room = await this.chatRoomRepository.findById(id);
      return room;
    } catch (error) {
      this.handleError('get chat room', error);
    }
  }

  /**
   * Finds and returns the designated General chat room based on creator ID from config.
   * @returns The ChatRoom entity for the General room, or null if not found/configured correctly.
   */
  async getGeneralRoom(): Promise<ChatRoom | null> {
    // This logic remains the same, relying on the config for lookup
    const serviceUserId = this.userCacheService.getServiceUserId();

    if (serviceUserId === null) {
      this.logger.error(
        `Cannot find General room: Service user ID is not available from UserCacheService. Cache might not be ready or login failed.`,
      );
      return null; // Cannot proceed without the ID
    }

    if (isNaN(serviceUserId)) {
      this.logger.error(
        `Invalid GENERAL_CHAT_ADMIN_USER_ID configured. Cannot find General room.`,
      );
      return null;
    }

    try {
      const potentialGeneralRooms =
        await this.chatRoomRepository.findUserCreatedRooms(serviceUserId);

      if (potentialGeneralRooms.length === 0) {
        this.logger.error(
          `No chat room found created by the designated General Room Admin User (ID: ${serviceUserId}). Check seeder and config.`,
        );
        return null;
      }

      if (potentialGeneralRooms.length > 1) {
        this.logger.warn(
          `Multiple chat rooms found created by the designated General Room Admin User (ID: ${serviceUserId}). Returning the first one found (ID: ${potentialGeneralRooms[0].id}). Ensure only one room is created by this user.`,
        );
      }
      return potentialGeneralRooms[0];
    } catch (error) {
      this.logger.error(
        `Error finding General room by creator ID ${serviceUserId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Ensures a user is a member of the designated General chat room.
   * If the user is not a member, they are added and assigned the basic USER role.
   * This method relies on getGeneralRoom() to identify the correct room.
   *
   * @param userId The ID of the user to check and potentially add.
   * @param currentPermittedRoomIds A list of room IDs the user already has access to.
   * @returns The ID of the General room if found and the user is now a member, otherwise null.
   */
  async ensureUserMembershipInGeneralRoom(
    userId: number,
    currentPermittedRoomIds: number[] = [],
  ): Promise<number | null> {
    const generalRoom = await this.getGeneralRoom(); // Use the correct lookup method

    if (!generalRoom) {
      this.logger.error(
        `Critical: General room could not be found based on creator ID. Cannot ensure user ${userId} membership. Check service logs and configuration.`,
      );
      return null; // Indicate failure or room not found
    }

    let permittedIdsToCheck: number[];
    if (currentPermittedRoomIds && currentPermittedRoomIds.length > 0) {
      permittedIdsToCheck = currentPermittedRoomIds;
      this.logger.debug(`Using provided permitted room IDs for user ${userId}`);
    } else {
      this.logger.debug(`Fetching permitted room IDs for user ${userId}`);
      try {
        const rooms = await this.getRoomsForUser(userId); // Await the promise
        permittedIdsToCheck = rooms.map((room) => room.id); // Map ChatRoom[] to number[]
      } catch (fetchError) {
        this.logger.error(
          `Failed to fetch rooms for user ${userId} to check General room membership: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        );
        // Decide how to handle - maybe return null or throw? Returning null for now.
        return null;
      }
    }

    const isMemberOfGeneral = permittedIdsToCheck.includes(generalRoom.id);

    if (!isMemberOfGeneral) {
      this.logger.log(
        `User ${userId} is not in General room (${generalRoom.id}). Adding...`,
      );
      try {
        // Add user to room membership in DB
        await this.addUserToRoom(generalRoom.id, userId);

        // Assign the basic role for the general room
        const generalRoomRoleName = `CHAT_ROOM_${generalRoom.id}_USER`;
        // Check if user already has the role before assigning (optional but good practice)
        const hasRole = await this.permissionService.userHasRole(
          userId,
          generalRoomRoleName,
        );
        if (!hasRole) {
          await this.permissionService.assignRole(userId, generalRoomRoleName);
          this.logger.log(
            `Assigned role ${generalRoomRoleName} to user ${userId}`,
          );
        } else {
          this.logger.log(
            `User ${userId} already has role ${generalRoomRoleName}. Skipping assignment.`,
          );
        }

        // Return the room ID so the gateway knows to join the socket
        return generalRoom.id;
      } catch (addError) {
        this.logger.error(
          `Failed to add user ${userId} to General room ${generalRoom.id}: ${addError instanceof Error ? addError.message : String(addError)}`,
        );
        // Return null on failure to add
        return null;
      }
    } else {
      // User is already a member, return the room ID for consistency
      return generalRoom.id;
    }
  }
}
