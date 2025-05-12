// src/services/permission.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PermissionRepository } from '../repositories/permission.repository';
import { PermissionCacheService } from './permission-cache.service';
import { Role } from '../entities/role.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Ability } from 'src/entities/ability.entity';
import { UserRole } from 'src/entities/user-role.entity';
import { RoleAbility } from 'src/entities/role-ability.entity';
import { Repository } from 'typeorm';
import { ModuleEnum } from 'src/enums/module.enum';
import { ResourceEnum } from 'src/enums/resource.enum';
import { ActionEnum } from 'src/enums/action.enum';

@Injectable()
export class PermissionService {
  constructor(
    private permissionRepo: PermissionRepository,
    private permissionCache: PermissionCacheService,
    private logger: Logger,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Ability)
    private readonly abilityRepository: Repository<Ability>,
    @InjectRepository(UserRole) // Inject UserRole repository
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(RoleAbility)
    private readonly roleAbilityRepository: Repository<RoleAbility>,
  ) {}

  async hasPermission(
    userId: number,
    module: string,
    resource: string,
    action: string,
    constraint?: number,
  ): Promise<boolean> {
    const permString = `${module}:${resource}:${action}${constraint ? `:${constraint}` : ''}`;
    const cacheKey = `PERM:${userId}:${permString}`;

    // Try cache first
    const cached = this.permissionCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Check from database
    const hasPermission = await this.permissionRepo.checkPermission(
      userId,
      module,
      resource,
      action,
      constraint,
    );

    // Cache result
    this.permissionCache.set(cacheKey, hasPermission);

    return hasPermission;
  }

  // Method to grant an ability directly to a user
  async grantAbility(
    userId: number,
    module: string,
    resource: string,
    action: string,
    constraint?: number,
    expiresAt?: Date,
  ): Promise<void> {
    try {
      // Find or create the ability
      let ability = await this.permissionRepo.findAbility(
        module,
        resource,
        action,
        constraint,
      );

      if (!ability) {
        // Create ability if it doesn't exist
        ability = await this.permissionRepo.createAbility(
          module,
          resource,
          action,
          constraint,
        );
      }

      // Grant ability to user
      await this.permissionRepo.grantAbilityToUser(userId, ability, expiresAt);

      // Clear cache for this permission
      const permString = `${module}:${resource}:${action}${constraint ? `:${constraint}` : ''}`;
      const cacheKey = `PERM:${userId}:${permString}`;
      this.permissionCache.delete(cacheKey);

      this.logger.log(`Granted ability ${permString} to user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to grant ability: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  // Method to assign a role to a user
  async assignRole(
    userId: number,
    roleName: string,
    expiresAt?: Date,
  ): Promise<void> {
    try {
      // Find or create the role
      const role = await this.permissionRepo.findRoleByName(roleName);

      if (!role) {
        throw new Error(`Role ${roleName} does not exist`);
      }

      // Assign role to user
      await this.permissionRepo.assignRoleToUser(userId, role, expiresAt);

      // Clear all permission caches for this user as role grants many permissions
      // In a real implementation, you might want to be more selective
      this.logger.log(`Assigned role ${roleName} to user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to assign role: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  // Method to create a role with abilities
  async createRole(
    roleName: string,
    description: string,
    abilities: Array<{
      module: string;
      resource: string;
      action: string;
      constraint?: number;
    }>,
  ): Promise<Role> {
    try {
      // Create the role
      const role = await this.permissionRepo.createRole(roleName, description);

      // Add each ability to the role
      for (const abilityData of abilities) {
        let ability = await this.permissionRepo.findAbility(
          abilityData.module,
          abilityData.resource,
          abilityData.action,
          abilityData.constraint,
        );

        if (!ability) {
          ability = await this.permissionRepo.createAbility(
            abilityData.module,
            abilityData.resource,
            abilityData.action,
            abilityData.constraint,
          );
        }

        await this.permissionRepo.addAbilityToRole(role, ability);
      }

      this.logger.log(
        `Created role ${roleName} with ${abilities.length} abilities`,
      );

      return role;
    } catch (error) {
      this.logger.error(
        `Failed to create role: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async findRoleByName(roleName: string): Promise<Role | null> {
    try {
      // Delegate to the repository method
      const role = await this.permissionRepo.findRoleByName(roleName);
      if (role) {
        this.logger.log(`Found role by name: ${roleName}`);
      } else {
        this.logger.log(`Role not found by name: ${roleName}`);
      }
      return role;
    } catch (error) {
      this.logger.error(
        `Failed to find role by name ${roleName}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  async revokeRole(userId: number, roleName: string): Promise<void> {
    try {
      const role = await this.permissionRepo.findRoleByName(roleName);
      if (!role) {
        this.logger.warn(`Cannot revoke role: Role ${roleName} not found.`);
        return; // Role doesn't exist, nothing to revoke
      }

      // Call repository method to delete the UserRole entry
      await this.permissionRepo.revokeRoleFromUser(userId, role.id);

      this.logger.log(`Revoked role ${roleName} from user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to revoke role ${roleName} for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error; // Re-throw
    }
  }

  /**
   * Revokes all standard roles associated with a specific chat room for a given user.
   * Standard roles are assumed to be CHAT_ROOM_{roomId}_ADMIN, _USER, _READONLY.
   * @param userId The ID of the user whose roles should be revoked.
   * @param roomId The ID of the chat room.
   */
  async revokeAllRoomRoles(userId: number, roomId: number): Promise<void> {
    this.logger.log(
      `Attempting to revoke all room roles for room ${roomId} from user ${userId}`,
    );
    const roomRolePrefix = `CHAT_ROOM_${roomId}_`;
    const standardRoleSuffixes = ['ADMIN', 'USER', 'READONLY'];

    let revokedCount = 0;
    const errors: Error[] = [];

    for (const suffix of standardRoleSuffixes) {
      const roleName = `${roomRolePrefix}${suffix}`;
      try {
        const role = await this.permissionRepo.findRoleByName(roleName);
        if (role) {
          // Role exists, attempt to revoke it from the user
          const revoked = await this.permissionRepo.revokeRoleFromUser(
            userId,
            role.id,
          );
          if (revoked) {
            // Assuming revokeRoleFromUser returns true/false or affected rows > 0
            this.logger.log(
              `Successfully revoked role ${roleName} from user ${userId}`,
            );
            revokedCount++;
          } else {
            this.logger.log(
              `User ${userId} did not have role ${roleName} to revoke.`,
            );
          }
        } else {
          // Role itself doesn't exist, log and continue
          this.logger.warn(`Role ${roleName} does not exist, cannot revoke.`);
        }
      } catch (error) {
        this.logger.error(
          `Error occurred while trying to revoke role ${roleName} for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
        if (error instanceof Error) {
          errors.push(error);
        }
        // Continue trying to revoke other roles even if one fails
      }
    }

    if (revokedCount > 0) {
      this.logger.log(
        `Finished revoking roles for room ${roomId} from user ${userId}. Revoked ${revokedCount} roles.`,
      );
    } else {
      this.logger.log(
        `No roles found or revoked for room ${roomId} for user ${userId}.`,
      );
    }

    // Optional: Decide how to handle partial failures
    if (errors.length > 0) {
      // You could throw a custom aggregate error, or just log that some revocations failed
      this.logger.error(
        `Encountered ${errors.length} errors during room role revocation for user ${userId}, room ${roomId}.`,
      );
      // throw new Error(`Failed to revoke one or more roles for room ${roomId}. See logs.`);
    }
  }

  /**
   * Checks if a user is directly assigned a specific role by name.
   * @param userId The ID of the user.
   * @param roleName The name of the role.
   * @returns A promise resolving to true if the user has the role, false otherwise.
   */
  async userHasRole(userId: number, roleName: string): Promise<boolean> {
    this.logger.debug(`Checking if user ${userId} has role "${roleName}"`);
    try {
      // Find the role by name first
      const role = await this.roleRepository.findOne({
        where: { name: roleName },
      });
      if (!role) {
        this.logger.warn(
          `Role "${roleName}" not found during userHasRole check for user ${userId}.`,
        );
        return false; // Role doesn't exist, so user can't have it
      }

      // Check the UserRole join table
      const count = await this.userRoleRepository.count({
        where: {
          userId: userId,
          roleId: role.id,
        },
      });

      const hasRole = count > 0;
      this.logger.debug(
        `User ${userId} ${hasRole ? 'has' : 'does not have'} role "${roleName}" (ID: ${role.id})`,
      );
      return hasRole;
    } catch (error) {
      this.logger.error(
        `Error checking if user ${userId} has role "${roleName}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return false; // Return false on error to prevent accidental permission grants
    }
  }

  async ensureCreateChatRoomPermission(userId: number): Promise<void> {
    const permissionString = `${ModuleEnum.CHAT}:${ResourceEnum.CHAT_ROOM}:${ActionEnum.CREATE}`;

    this.logger.log(
      `Ensuring user ${userId} has permission: ${permissionString}`,
      PermissionService.name, // Or the name of your service class
    );

    try {
      // 1. Check if the user already has the permission
      const hasPermission = await this.permissionRepo.checkPermission(
        userId,
        ModuleEnum.CHAT,
        ResourceEnum.CHAT_ROOM,
        ActionEnum.CREATE,
      );

      if (hasPermission) {
        this.logger.log(
          `User ${userId} already has permission: ${permissionString}`,
          PermissionService.name,
        );
        return;
      }

      this.logger.log(
        `User ${userId} does not have permission: ${permissionString}. Attempting to grant.`,
        PermissionService.name,
      );

      // 2. Find or create the ability
      let ability = await this.permissionRepo.findAbility(
        ModuleEnum.CHAT,
        ResourceEnum.CHAT_ROOM,
        ActionEnum.CREATE,
      );

      if (!ability) {
        this.logger.log(
          `Ability ${permissionString} not found. Creating it...`,
          PermissionService.name,
        );
        ability = await this.permissionRepo.createAbility(
          ModuleEnum.CHAT,
          ResourceEnum.CHAT_ROOM,
          ActionEnum.CREATE,
          undefined, // No constraint for this general permission
          `Allows user to create a new chat room`,
        );
        this.logger.log(
          `Ability ${permissionString} created with ID: ${ability.id}`,
          PermissionService.name,
        );
      } else {
        this.logger.log(
          `Ability ${permissionString} found with ID: ${ability.id}`,
          PermissionService.name,
        );
      }

      // 3. Grant the ability to the user
      await this.permissionRepo.grantAbilityToUser(userId, ability);
      this.logger.log(
        `Successfully granted permission ${permissionString} (Ability ID: ${ability.id}) to user ${userId}`,
        PermissionService.name,
      );
    } catch (error) {
      this.logger.error(
        `Failed to ensure/grant permission ${permissionString} for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        PermissionService.name,
      );
      // Depending on your error handling strategy, you might want to rethrow the error
      // or handle it gracefully. For now, it's logged.
      // If this permission is critical for connection, you might throw a WsException here.
      // throw new WsException(`Failed to set up necessary permissions for user ${userId}.`);
    }
  }
}
