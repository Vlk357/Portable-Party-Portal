import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Ability } from '../entities/ability.entity';
import { ChatRoom } from '../entities/chat-room.entity';
import { ModuleEnum } from '../enums/module.enum';
import { ActionEnum } from '../enums/action.enum';
import { ResourceEnum } from '../enums/resource.enum';
import { UserCacheService } from '../cache/user-cache.service';
import { ChatRoomService } from './chat-room.service'; // Import ChatRoomService
import { ChatRoomRepository } from '../repositories/chat-room.repository'; // Import custom repository if used

// Helper function for async delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeederService.name);
  private readonly MAX_WAIT_TIME_MS = 120000; // Max wait 2 minutes
  private readonly WAIT_INTERVAL_MS = 2000; // Check every 2 seconds

  constructor(
    @InjectRepository(Ability)
    private readonly abilityRepository: Repository<Ability>,
    // Inject the custom repository if you created one, otherwise keep Repository<ChatRoom>
    private readonly chatRoomRepository: ChatRoomRepository,
    private readonly configService: ConfigService,
    private readonly userCacheService: UserCacheService,
    private readonly chatRoomService: ChatRoomService, // Inject ChatRoomService
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Starting database seeding...');
    await this.seedAbilities();
    await this.seedGeneralChat();
    this.logger.log('Database seeding finished.');
  }

  // --- Seed Abilities (Remains the same) ---
  private async seedAbilities() {
    // ... existing seedAbilities logic ...
    this.logger.log('Seeding Chat module abilities...');
    const abilitiesToSeed: Partial<Ability>[] = [];
    const chatResources = [ResourceEnum.MESSAGE, ResourceEnum.CHAT_ROOM];
    const chatActions = [
      ActionEnum.CREATE,
      ActionEnum.READ,
      ActionEnum.UPDATE,
      ActionEnum.DELETE,
    ];

    for (const resource of chatResources) {
      for (const action of chatActions) {
        abilitiesToSeed.push({
          module: ModuleEnum.CHAT,
          resource: resource,
          action: action,
          resourceConstraint: null,
          description: `Can ${action} ${resource}s`,
        });
      }
    }

    let createdCount = 0;
    for (const abilityData of abilitiesToSeed) {
      const findCriteria = {
        module: abilityData.module,
        resource: abilityData.resource,
        action: abilityData.action,
        resourceConstraint:
          abilityData.resourceConstraint === null
            ? IsNull()
            : abilityData.resourceConstraint,
      };
      const existing = await this.abilityRepository.findOneBy(findCriteria);

      if (!existing) {
        try {
          const newAbility = this.abilityRepository.create(abilityData);
          await this.abilityRepository.save(newAbility);
          this.logger.log(
            `Created ability: ${abilityData.module}:${abilityData.resource}:${abilityData.action}${abilityData.resourceConstraint ? ':' + abilityData.resourceConstraint : ''}`,
          );
          createdCount++;
        } catch (error: unknown) {
          let errorMessage = 'Unknown error';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          this.logger.error(
            `Failed to create ability ${abilityData.module}:${abilityData.resource}:${abilityData.action}: ${errorMessage}`,
          );
        }
      }
    }
    this.logger.log(
      `Seeding Chat abilities complete. ${createdCount} new abilities created.`,
    );
  }

  // --- Seed General Chat (Refactored) ---

  /**
   * Orchestrates the seeding of the General chat room and its permissions.
   */
  private async seedGeneralChat() {
    this.logger.log('Seeding General chat room and permissions...');

    const isCacheReady = await this._waitForUserCache();
    if (!isCacheReady) return; // Stop if cache didn't become ready

    const serviceUserId = this._getServiceUserId();
    if (serviceUserId === null) return; // Stop if user ID couldn't be found

    const generalChat = await this._findOrCreateGeneralChat(serviceUserId);
    if (!generalChat) return; // Stop if room couldn't be found or created

    await this._ensureGeneralChatPermissions(generalChat, serviceUserId);

    this.logger.log('General chat room seeding process complete.');
  }

  /**
   * Waits for the UserCacheService to indicate it's ready (logged in).
   * @returns True if the cache became ready within the time limit, false otherwise.
   */
  private async _waitForUserCache(): Promise<boolean> {
    this.logger.log('Waiting for UserCacheService to log in...');
    const startTime = Date.now();
    while (!this.userCacheService.isReady()) {
      if (Date.now() - startTime > this.MAX_WAIT_TIME_MS) {
        this.logger.error(
          `UserCacheService did not log in within ${this.MAX_WAIT_TIME_MS / 1000} seconds. Aborting General chat seed.`,
        );
        return false;
      }
      this.logger.debug(
        `UserCacheService not ready, waiting ${this.WAIT_INTERVAL_MS / 1000}s...`,
      );
      await delay(this.WAIT_INTERVAL_MS);
    }
    this.logger.log('UserCacheService is ready (logged in).');
    return true;
  }

  /**
   * Retrieves the service user's ID from the UserCacheService.
   * @returns The service user's ID, or null if not found.
   */
  private _getServiceUserId(): number | null {
    const serviceUsername = this.userCacheService.getServiceUsername();
    const userMap = this.userCacheService.getUserMap();
    let serviceUserId: number | null = null;

    for (const [id, username] of userMap.entries()) {
      if (username === serviceUsername) {
        serviceUserId = id;
        break;
      }
    }

    if (serviceUserId === null) {
      this.logger.error(
        `Could not find service user ID for username "${serviceUsername}" in the user cache. Cache size: ${userMap.size}. Cannot seed General chat.`,
      );
      // this.logger.debug(`Current user map: ${JSON.stringify(Array.from(userMap.entries()))}`);
    } else {
      this.logger.log(
        `Found service user ID: ${serviceUserId} for username: ${serviceUsername}.`,
      );
    }
    return serviceUserId;
  }

  /**
   * Finds the General chat room created by the service user, or creates it if not found.
   * Assumes the service user should only create one "General" room.
   * @param serviceUserId The ID of the chat service user.
   * @returns The ChatRoom entity, or null if an error occurred.
   */
  private async _findOrCreateGeneralChat(
    serviceUserId: number,
  ): Promise<ChatRoom | null> {
    const generalChatName = this.configService.get<string>(
      'GENERAL_CHAT_NAME',
      'General',
    );

    try {
      // Find rooms created by this specific user
      const userCreatedRooms =
        await this.chatRoomRepository.findUserCreatedRooms(serviceUserId);

      if (userCreatedRooms.length > 0) {
        if (userCreatedRooms.length > 1) {
          this.logger.warn(
            `Multiple rooms found created by service user ${serviceUserId}. Using the first one found (ID: ${userCreatedRooms[0].id}) as the General chat.`,
          );
        } else {
          this.logger.log(
            `Found existing General chat room (ID: ${userCreatedRooms[0].id}) created by service user ${serviceUserId}.`,
          );
        }
        return userCreatedRooms[0]; // Return the first one found
      }

      // If no room found created by this user, create it
      this.logger.log(
        `No General chat room found created by service user ${serviceUserId}. Creating new one...`,
      );
      const generalChat = await this.chatRoomRepository.create({
        name: generalChatName,
        description: 'Default chat room for everyone',
        created_by_user_id: serviceUserId,
      });
      this.logger.log(
        `Created General chat room "${generalChatName}" (ID: ${generalChat.id}) by user ID ${serviceUserId}`,
      );
      return generalChat;
    } catch (error: unknown) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      this.logger.error(
        `Failed to find or create General chat room for service user ${serviceUserId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Ensures the necessary permissions and roles are set up for the General chat room.
   * Calls the idempotent setup function in ChatRoomService.
   * @param generalChat The General ChatRoom entity.
   * @param serviceUserId The ID of the user who created/owns the General chat.
   */
  private async _ensureGeneralChatPermissions(
    generalChat: ChatRoom,
    serviceUserId: number,
  ): Promise<void> {
    this.logger.log(
      `Ensuring permissions for General chat room ${generalChat.id}...`,
    );
    try {
      // Call the public, idempotent function in ChatRoomService
      await this.chatRoomService.setupChatRoomPermissions(
        generalChat.id,
        serviceUserId,
      );
      this.logger.log(
        `Successfully ensured permissions for General chat room ${generalChat.id}.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set up permissions for General chat room ${generalChat.id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Log the error but don't necessarily stop the entire seeding process
    }
  }
}
