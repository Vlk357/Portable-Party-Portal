import { Logger } from '@nestjs/common';
import { ServicePermissions } from 'src/interfaces/service-permissions.interface';

/**
 * Simplified permission cache optimized for fast permission checks
 */
export class PermissionCache {
  // Map of ability strings to ability IDs for quick lookup
  private abilityStringToId = new Map<string, number>();

  // Map of user IDs to their ability IDs (combines direct and role-based abilities)
  private userAbilities = new Map<number, Set<number>>();

  // Map of ability IDs to user IDs that have that ability
  private abilityUsers = new Map<number, Set<number>>();

  constructor(private logger: Logger) {}

  clear(): void {
    this.abilityStringToId.clear();
    this.userAbilities.clear();
    this.abilityUsers.clear();
  }

  update(data: ServicePermissions): void {
    this.clear();

    // Step 1: Map ability strings to IDs
    if (data.abilities) {
      for (const ability of data.abilities) {
        this.abilityStringToId.set(ability.ability_string, ability.id);
      }
    }

    // Step 2: Map roles to their ability IDs
    const roleAbilities = new Map<number, Set<number>>();
    if (data.roles) {
      for (const role of data.roles) {
        const abilitySet = new Set<number>();
        for (const abilityRef of role.abilities) {
          abilitySet.add(abilityRef.id);
        }
        roleAbilities.set(role.id, abilitySet);
      }
    }

    // Step 3: Build user abilities map (direct + role-based)
    if (data.users) {
      for (const user of data.users) {
        const userAbilitySet = new Set<number>();

        // Add direct abilities
        for (const abilityRef of user.abilities) {
          userAbilitySet.add(abilityRef.id);
        }

        // Add role-based abilities
        for (const roleRef of user.roles) {
          const roleAbilitySet = roleAbilities.get(roleRef.id);
          if (roleAbilitySet) {
            for (const abilityId of roleAbilitySet) {
              userAbilitySet.add(abilityId);
            }
          } else {
            console.error('RoleAbilitySet not found, but should have been');
          }
        }

        // Store user's complete set of abilities
        this.userAbilities.set(user.id, userAbilitySet);

        // Update the reverse lookup (ability -> users)
        for (const abilityId of userAbilitySet) {
          if (!this.abilityUsers.has(abilityId)) {
            this.abilityUsers.set(abilityId, new Set<number>());
          }
          this.abilityUsers.get(abilityId)?.add(user.id);
        }
      }
    }

    this.logger.log(
      `Permission cache updated: ${this.abilityStringToId.size} unique abilities, ` +
        `${this.userAbilities.size} users`,
    );
  }

  /**
   * Check if a user has a specific permission by ability string
   */
  hasPermission(userId: number, abilityString: string): boolean {
    // Convert ability string to ID
    const abilityId = this.abilityStringToId.get(abilityString);
    if (!abilityId) {
      return false; // Ability doesn't exist
    }

    // Check if user has this ability
    const userAbilitySet = this.userAbilities.get(userId);
    return userAbilitySet ? userAbilitySet.has(abilityId) : false;
  }

  /**
   * Get all users with a specific permission
   */
  getUsersWithPermission(abilityString: string): number[] {
    const abilityId = this.abilityStringToId.get(abilityString);
    if (!abilityId) {
      return []; // Ability doesn't exist
    }

    const users = this.abilityUsers.get(abilityId);
    return users ? Array.from(users) : [];
  }

  /**
   * Check if the user exists in our cache
   */
  hasUser(userId: number): boolean {
    return this.userAbilities.has(userId);
  }

  /**
   * Get all ability IDs for a user
   */
  getUserAbilityIds(userId: number): number[] {
    const abilities = this.userAbilities.get(userId);
    return abilities ? Array.from(abilities) : [];
  }

  /**
   * Get all ability strings for a user
   */
  getUserAbilityStrings(userId: number): string[] {
    const abilityIds = this.getUserAbilityIds(userId);
    const abilityStrings: string[] = [];

    // Map IDs back to strings
    for (const [abilityString, id] of this.abilityStringToId.entries()) {
      if (abilityIds.includes(id)) {
        abilityStrings.push(abilityString);
      }
    }

    return abilityStrings;
  }

  /**
   * Check if a permission exists in the cache
   */
  permissionExists(abilityString: string): boolean {
    return this.abilityStringToId.has(abilityString);
  }
}
