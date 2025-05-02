// src/repositories/permission.repository.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ability } from '../entities/ability.entity';
import { UserAbility } from '../entities/user-ability.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { RoleAbility } from '../entities/role-ability.entity';
import { ModuleEnum } from '../enums/module.enum';
import { ResourceEnum } from '../enums/resource.enum';
import { ActionEnum } from '../enums/action.enum';

@Injectable()
export class PermissionRepository {
  constructor(
    @InjectRepository(Ability)
    private abilityRepo: Repository<Ability>,
    @InjectRepository(UserAbility)
    private userAbilityRepo: Repository<UserAbility>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(RoleAbility)
    private roleAbilityRepo: Repository<RoleAbility>,
    private logger: Logger,
  ) {}

  async checkPermission(
    userId: number,
    module: ModuleEnum | string,
    resource: ResourceEnum | string,
    action: ActionEnum | string,
    constraint?: number | string,
  ): Promise<boolean> {
    try {
      // Convert string inputs to proper enums if needed
      const moduleEnum =
        typeof module === 'string' ? (module as ModuleEnum) : module;
      const resourceEnum =
        typeof resource === 'string' ? (resource as ResourceEnum) : resource;
      const actionEnum =
        typeof action === 'string' ? (action as ActionEnum) : action;

      // Convert string constraint to number if needed
      const constraintValue =
        typeof constraint === 'string' && !isNaN(parseInt(constraint))
          ? parseInt(constraint)
          : (constraint as number | undefined);

      // Check direct permission
      const directCount = await this.userAbilityRepo
        .createQueryBuilder('ua')
        .innerJoin('ua.ability', 'a')
        .where('ua.userId = :userId', { userId })
        .andWhere('a.module = :module', { module: moduleEnum })
        .andWhere('a.resource = :resource', { resource: resourceEnum })
        .andWhere('a.action = :action', { action: actionEnum })
        .andWhere('(ua.expiresAt IS NULL OR ua.expiresAt > :now)', {
          now: new Date(),
        })
        .andWhere(
          constraintValue !== undefined
            ? 'a.resourceConstraint = :constraint'
            : 'a.resourceConstraint IS NULL',
          constraintValue !== undefined ? { constraint: constraintValue } : {},
        )
        .getCount();

      if (directCount > 0) return true;

      // Check role-based permission
      const roleCount = await this.userRoleRepo
        .createQueryBuilder('ur')
        .innerJoin('ur.role', 'r')
        .innerJoin('r.roleAbilities', 'ra')
        .innerJoin('ra.ability', 'a')
        .where('ur.userId = :userId', { userId })
        .andWhere('a.module = :module', { module: moduleEnum })
        .andWhere('a.resource = :resource', { resource: resourceEnum })
        .andWhere('a.action = :action', { action: actionEnum })
        .andWhere('(ur.expiresAt IS NULL OR ur.expiresAt > :now)', {
          now: new Date(),
        })
        .andWhere('(ra.expiresAt IS NULL OR ra.expiresAt > :now)', {
          now: new Date(),
        })
        .andWhere(
          constraintValue !== undefined
            ? 'a.resourceConstraint = :constraint'
            : 'a.resourceConstraint IS NULL',
          constraintValue !== undefined ? { constraint: constraintValue } : {},
        )
        .getCount();

      return roleCount > 0;
    } catch (error) {
      this.logger.error(
        `Error checking permission: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  // Method to grant a direct ability to a user
  async grantAbilityToUser(
    userId: number,
    ability: Ability,
    expiresAt?: Date,
  ): Promise<UserAbility> {
    try {
      const userAbility = this.userAbilityRepo.create({
        userId,
        ability,
        abilityId: ability.id,
        expiresAt,
      });

      return await this.userAbilityRepo.save(userAbility);
    } catch (error) {
      this.logger.error(
        `Error granting ability to user: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  // Method to assign a role to a user
  async assignRoleToUser(
    userId: number,
    role: Role,
    expiresAt?: Date,
  ): Promise<UserRole> {
    try {
      // Check if the user already has this role
      const existingUserRole = await this.userRoleRepo.findOne({
        where: {
          userId: userId,
          roleId: role.id,
        },
      });

      if (existingUserRole) {
        this.logger.log(
          `User ${userId} already has role ${role.name} (ID: ${role.id}). Skipping assignment.`,
        );
        if (
          expiresAt !== undefined &&
          existingUserRole.expiresAt?.getTime() !== expiresAt.getTime()
        ) {
          existingUserRole.expiresAt = expiresAt;
          return await this.userRoleRepo.save(existingUserRole);
        }
        return existingUserRole;
      }

      // User does not have the role, create the new assignment
      const newUserRole = this.userRoleRepo.create({
        userId,
        role,
        roleId: role.id,
        expiresAt,
      });

      this.logger.log(
        `Assigning role ${role.name} (ID: ${role.id}) to user ${userId}.`,
      );
      return await this.userRoleRepo.save(newUserRole);
    } catch (error) {
      this.logger.error(
        `Error assigning role ${role.id} to user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Removes a specific role assignment from a user.
   * @param userId The user ID.
   * @param roleId The role ID.
   * @returns True if a role was revoked, false otherwise.
   */
  async revokeRoleFromUser(userId: number, roleId: number): Promise<boolean> {
    try {
      const result = await this.userRoleRepo.delete({
        userId: userId,
        roleId: roleId,
      });
      if (result.affected === 0) {
        this.logger.log(
          `No UserRole found to revoke for userId: ${userId}, roleId: ${roleId}`,
        );
        return false;
      } else {
        this.logger.log(`Revoked roleId: ${roleId} from userId: ${userId}`);
        return true;
      }
    } catch (error) {
      this.logger.error(
        `Error revoking role ${roleId} from user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error; // Re-throw
    }
  }

  // Find ability by its components
  async findAbility(
    module: ModuleEnum | string,
    resource: ResourceEnum | string,
    action: ActionEnum | string,
    constraint?: number,
  ): Promise<Ability | null> {
    try {
      // Convert string inputs to proper enums if needed
      const moduleEnum =
        typeof module === 'string' ? (module as ModuleEnum) : module;
      const resourceEnum =
        typeof resource === 'string' ? (resource as ResourceEnum) : resource;
      const actionEnum =
        typeof action === 'string' ? (action as ActionEnum) : action;

      // Use TypeORM's query builder instead of findOne to avoid type issues
      const query = this.abilityRepo
        .createQueryBuilder('ability')
        .where('ability.module = :module', { module: moduleEnum })
        .andWhere('ability.resource = :resource', { resource: resourceEnum })
        .andWhere('ability.action = :action', { action: actionEnum });

      // Add constraint condition based on value
      if (constraint) {
        query.andWhere('ability.resourceConstraint = :constraint', {
          constraint: constraint,
        });
      } else {
        query.andWhere('ability.resourceConstraint IS NULL');
      }

      return await query.getOne();
    } catch (error) {
      this.logger.error(
        `Error finding ability: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  // Create a new ability
  async createAbility(
    module: ModuleEnum | string,
    resource: ResourceEnum | string,
    action: ActionEnum | string,
    constraint?: number,
    description?: string,
  ): Promise<Ability> {
    try {
      // Convert string inputs to proper enums if needed
      const moduleEnum =
        typeof module === 'string' ? (module as ModuleEnum) : module;
      const resourceEnum =
        typeof resource === 'string' ? (resource as ResourceEnum) : resource;
      const actionEnum =
        typeof action === 'string' ? (action as ActionEnum) : action;

      // Create a new ability entity properly typed
      const ability = new Ability();
      ability.module = moduleEnum;
      ability.resource = resourceEnum;
      ability.action = actionEnum;

      // Fix nullable field assignments without 'any'
      if (constraint) {
        ability.resourceConstraint = constraint;
      }

      if (description) {
        ability.description = description;
      }

      return await this.abilityRepo.save(ability);
    } catch (error) {
      this.logger.error(
        `Error creating ability: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  // Find role by name
  async findRoleByName(name: string): Promise<Role | null> {
    try {
      return await this.roleRepo.findOne({
        where: { name },
        relations: ['roleAbilities', 'roleAbilities.ability'],
      });
    } catch (error) {
      this.logger.error(
        `Error finding role: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  // Create a new role
  async createRole(name: string, description?: string): Promise<Role> {
    try {
      const role = this.roleRepo.create({
        name,
        description,
      });

      return await this.roleRepo.save(role);
    } catch (error) {
      this.logger.error(
        `Error creating role: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  // Add ability to role
  async addAbilityToRole(
    role: Role,
    ability: Ability,
    expiresAt?: Date,
  ): Promise<RoleAbility> {
    try {
      const roleAbility = this.roleAbilityRepo.create({
        role,
        roleId: role.id,
        ability,
        abilityId: ability.id,
        expiresAt,
      });

      return await this.roleAbilityRepo.save(roleAbility);
    } catch (error) {
      this.logger.error(
        `Error adding ability to role: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
