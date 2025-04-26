// src/services/permission.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PermissionRepository } from '../repositories/permission.repository';
import { PermissionCacheService } from './permission-cache.service';
// import { Ability } from '../entities/ability.entity';
import { Role } from '../entities/role.entity';

@Injectable()
export class PermissionService {
  constructor(
    private permissionRepo: PermissionRepository,
    private permissionCache: PermissionCacheService,
    private logger: Logger,
  ) {}

  async hasPermission(
    userId: number,
    module: string,
    resource: string,
    action: string,
    constraint?: string,
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
    constraint?: string,
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
      constraint?: string;
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
}
