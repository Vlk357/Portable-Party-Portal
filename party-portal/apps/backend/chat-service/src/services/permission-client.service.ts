import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Role } from '../interfaces/role.interface';
import { Ability } from '../interfaces/ability.interface';
import { UserPermissions } from '../interfaces/user-permission.interface';

interface ServicePermissions {
  roles: Role[];
  abilities: Ability[];
  users: UserPermissions[];
}

@Injectable()
export class PermissionClientService {
  private readonly logger = new Logger(PermissionClientService.name);
  private readonly cache = new Map<number, UserPermissions>();
  // Hard-code the URL or use environment variable directly
  private readonly baseUrl: string = process.env.AUTH_SERVICE_URL
    ? `${process.env.AUTH_SERVICE_URL}`
    : 'http://auth';

  constructor(private readonly httpService: HttpService) {
    // No ConfigService dependency
  }

  async refreshPermissions(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ServicePermissions>(
          `${this.baseUrl}/api/permissions/service/CHAT`,
        ),
      );

      // Update cache
      this.cache.clear();
      response.data.users.forEach((user) => {
        this.cache.set(user.id, user);
      });
    } catch (error) {
      this.logger.error('Failed to refresh permissions', error);
      throw error;
    }
  }

  async addUserAbility(userId: number, ability: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/permissions/user/${userId}/ability`,
          { ability },
        ),
      );

      // Refresh cache for this user
      await this.refreshPermissions();
    } catch (error) {
      this.logger.error(`Failed to add ability to user ${userId}`, error);
      throw error;
    }
  }

  checkPermission(userId: number, abilityString: string): boolean {
    const user = this.cache.get(userId);
    if (!user) {
      return false;
    }

    return user.abilities.some((ability) => {
      // Format: MODULE:RESOURCE[:CONSTRAINT]:ACTION
      let permissionString = `${ability.module}:${ability.resource}:${ability.action}`;

      // Add constraint if present, otherwise skip it
      if (ability.resourceConstraint) {
        permissionString += `:${ability.resourceConstraint}`;
      }

      // Compare with the provided ability string
      return permissionString === abilityString;
    });
  }
}
