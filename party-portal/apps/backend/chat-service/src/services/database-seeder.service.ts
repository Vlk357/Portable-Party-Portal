import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Ability } from '../entities/ability.entity';
import { ChatRoom } from '../entities/chat-room.entity';
import { ModuleEnum } from '../enums/module.enum';
import { ActionEnum } from '../enums/action.enum';
import { ResourceEnum } from '../enums/resource.enum';
import { UserCacheService } from '../cache/user-cache.service'; // Import UserCacheService

// Helper function for async delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeederService.name);
  private readonly MAX_WAIT_TIME_MS = 120000; // Max wait 2 minutes for cache service login
  private readonly WAIT_INTERVAL_MS = 2000; // Check every 2 seconds

  constructor(
    @InjectRepository(Ability)
    private readonly abilityRepository: Repository<Ability>,
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepository: Repository<ChatRoom>,
    private readonly configService: ConfigService,
    private readonly userCacheService: UserCacheService, // Inject UserCacheService
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Starting database seeding...');
    // Seed abilities first (no user dependency)
    await this.seedAbilities();
    // Seed general chat (depends on user cache service login)
    await this.seedGeneralChat();
    this.logger.log('Database seeding finished.');
  }

  private async seedAbilities() {
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
      // Use IsNull() for checking null constraints
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
            `Created ability: ${abilityData.module}:${abilityData.resource}:${abilityData.action}${abilityData.resourceConstraint ? ':' + abilityData.resourceConstraint : ''}`, // Log constraint if present
          );
          createdCount++;
        } catch (error: unknown) {
          // Type error as unknown
          let errorMessage = 'Unknown error';
          if (error instanceof Error) {
            errorMessage = error.message; // Safely access message
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

  private async seedGeneralChat() {
    this.logger.log('Seeding General chat room...');
    const generalChatName = this.configService.get<string>(
      'GENERAL_CHAT_NAME',
      'General',
    );

    // 1. Wait for the UserCacheService to be ready (logged in)
    this.logger.log('Waiting for UserCacheService to log in...');
    const startTime = Date.now();
    while (!this.userCacheService.isReady()) {
      if (Date.now() - startTime > this.MAX_WAIT_TIME_MS) {
        this.logger.error(
          `UserCacheService did not log in within ${this.MAX_WAIT_TIME_MS / 1000} seconds. Aborting General chat seed.`,
        );
        return;
      }
      this.logger.debug(
        `UserCacheService not ready, waiting ${this.WAIT_INTERVAL_MS / 1000}s...`,
      );
      await delay(this.WAIT_INTERVAL_MS);
    }
    this.logger.log('UserCacheService is ready (logged in).');

    // 2. Check if chat room already exists
    const existing = await this.chatRoomRepository.findOneBy({
      name: generalChatName,
    });

    if (existing) {
      this.logger.log(`General chat room "${generalChatName}" already exists.`);
      return;
    }

    // 3. Get the service user's ID from the cache
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
        `Could not find service user ID for username "${serviceUsername}" in the user cache even after login. Cache size: ${userMap.size}. Cannot seed General chat.`,
      );
      // Log the map contents for debugging if needed (might be large)
      // this.logger.debug(`Current user map: ${JSON.stringify(Array.from(userMap.entries()))}`);
      return;
    }

    this.logger.log(
      `Found service user ID: ${serviceUserId} for username: ${serviceUsername}. Creating General chat room...`,
    );

    // 4. Create the chat room
    try {
      const generalChat = this.chatRoomRepository.create({
        name: generalChatName,
        description: 'Default chat room for everyone',
        created_by_user_id: serviceUserId, // Use the found service user ID
      });
      await this.chatRoomRepository.save(generalChat);
      this.logger.log(
        `Created General chat room: "${generalChatName}" by user ID ${serviceUserId}`,
      );
    } catch (error: unknown) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      this.logger.error(`Failed to create General chat room: ${errorMessage}`);
    }
  }
}
