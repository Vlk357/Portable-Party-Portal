import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

interface ServiceTokenResponse {
  token: string;
}

@Injectable()
export class PermissionClientService implements OnModuleInit {
  private readonly logger = new Logger(PermissionClientService.name);
  private readonly cache = new Map<number, UserPermissions>();
  private serviceToken: string | null = null;

  // Hard-code the URL or use environment variable directly
  private readonly baseUrl: string = process.env.AUTH_SERVICE_URL
    ? `${process.env.AUTH_SERVICE_URL}`
    : 'http://nginx/auth';

  constructor(private readonly httpService: HttpService) {
    // No ConfigService dependency
  }
  async onModuleInit() {
    await this.getServiceToken();

    await this.refreshPermissions();

    const refreshInterval = process.env.PERMISSION_REFRESH_INTERVAL
      ? parseInt(process.env.PERMISSION_REFRESH_INTERVAL, 10) * 1000
      : 10 * 60 * 1000; // Default to 10 minutes

    setInterval(() => {
      this.refreshPermissions().catch((error) => {
        this.logger.error("Couldn't refresh permissions: ", error);
      });
    }, refreshInterval);
  }

  private async getServiceToken(): Promise<void> {
    try {
      // Create a URLSearchParams object to send form data instead of JSON
      const formData = new URLSearchParams();
      formData.append('service_id', process.env.CHAT_SERVICE_ID || 'CHAT'); // Match the env value
      formData.append(
        'service_secret',
        process.env.CHAT_SERVICE_SECRET || 'your-secret-here',
      );

      const response = await firstValueFrom(
        this.httpService.post<ServiceTokenResponse>(
          `${this.baseUrl}/api/service-token`,
          formData,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      this.serviceToken = response.data.token;
      this.logger.log('Service token obtained successfully');
    } catch (error) {
      this.logger.error('Failed to get service token', error);
    }
  }

  async refreshPermissions(): Promise<void> {
    try {
      // Try to get a token if we don't have one
      if (!this.serviceToken) {
        await this.getServiceToken();
      }

      // Get permissions with the token in the Authorization header
      const response = await firstValueFrom(
        this.httpService.get<ServicePermissions>(
          `${this.baseUrl}/api/permissions/CHAT`,
          {
            headers: this.serviceToken
              ? {
                  Authorization: `Bearer ${this.serviceToken}`,
                }
              : {},
          },
        ),
      );

      // Update cache - add null check for safety
      this.cache.clear();
      if (response.data?.users) {
        response.data.users.forEach((user) => {
          this.cache.set(user.id, user);
        });
      }
    } catch (error) {
      this.logger.error('Failed to refresh permissions', error);
      // Don't throw the error - makes your service more resilient
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
    let user = this.cache.get(userId);
    if (user === undefined) {
      if (this.cache.size === 0) {
        this.refreshPermissions().catch((error) => {
          this.logger.error("Couldn't refresh permissions: ", error);
        });
        user = this.cache.get(userId);
        if (user === undefined) {
          return false;
        }
      } else {
        return false;
      }
    }

    return user.abilities.some((ability) => {
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
