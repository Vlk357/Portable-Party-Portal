import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

interface UserListItem {
  id: number;
  username: string;
}

@Injectable()
export class UserCacheService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(UserCacheService.name);
  private userMap: Map<number, string> = new Map(); // Cache: ID -> Username
  private readonly authUrl: string;
  private readonly authHeader: string;
  private readonly cacheInterval: number;
  private intervalRef: NodeJS.Timeout | null = null; // To store interval reference

  constructor(private readonly httpService: HttpService) {
    // Read directly from process.env
    this.authUrl = process.env.AUTH_SERVICE_URL || 'http://nginx/auth';
    const user = process.env.CHAT_SERVICE_AUTH_USER;
    const pass = process.env.CHAT_SERVICE_AUTH_PASSWORD;
    const intervalMsString = process.env.USER_CACHE_INTERVAL_MS;

    // Basic validation
    if (!this.authUrl) {
      throw new Error('AUTH_SERVICE_URL environment variable is not set.');
    }
    if (!user) {
      throw new Error(
        'CHAT_SERVICE_AUTH_USER environment variable is not set.',
      );
    }
    if (!pass) {
      throw new Error(
        'CHAT_SERVICE_AUTH_PASSWORD environment variable is not set.',
      );
    }

    // Encode credentials for Basic Authentication
    const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    this.authHeader = `Basic ${token}`;

    // Parse and validate interval, provide a default
    const defaultInterval = 30 * 60 * 1000; // 30 minutes
    this.cacheInterval = intervalMsString
      ? parseInt(intervalMsString, 10)
      : defaultInterval;
    if (isNaN(this.cacheInterval) || this.cacheInterval < 5000) {
      // Ensure minimum 5 seconds
      this.logger.warn(
        `Invalid or too small USER_CACHE_INTERVAL_MS. Using default: ${defaultInterval}ms`,
      );
      this.cacheInterval = defaultInterval;
    }

    this.logger.log(`User cache interval set to ${this.cacheInterval}ms`);
  }

  // Lifecycle hook to load cache on startup
  async onModuleInit() {
    this.logger.log('Initializing user cache...');
    await this.updateCache();
  }

  // Remove @Interval decorator if using dynamic interval below

  // Set the interval dynamically after bootstrap
  onApplicationBootstrap() {
    this.logger.log(
      `Setting up dynamic interval for user cache update (${this.cacheInterval}ms)`,
    );
    // Clear previous interval if exists (e.g., during hot-reloads)
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }

    this.intervalRef = setInterval(() => {
      this.updateCache().catch((err) => {
        // Log errors specifically from the interval execution that weren't caught inside updateCache
        this.logger.error(
          `Unhandled error during scheduled cache update: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
    }, this.cacheInterval);
  }

  // Optional: Clear interval on shutdown
  onModuleDestroy() {
    if (this.intervalRef) {
      this.logger.log('Clearing user cache update interval.');
      clearInterval(this.intervalRef);
    }
  }

  async updateCache(): Promise<void> {
    this.logger.log('Attempting to update user cache...');
    const endpoint = `${this.authUrl}/user/list`; // Target the new endpoint

    try {
      const response = await firstValueFrom(
        this.httpService.get<UserListItem[]>(endpoint, {
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
          },
          timeout: 10000, // Example timeout: 10 seconds
        }),
      );

      if (response.status === 200 && Array.isArray(response.data)) {
        const newUserMap = new Map<number, string>();
        for (const user of response.data) {
          // Basic validation of received data
          if (
            typeof user?.id === 'number' &&
            typeof user?.username === 'string'
          ) {
            newUserMap.set(user.id, user.username);
          } else {
            this.logger.warn(
              `Received invalid user data item: ${JSON.stringify(user)}`,
            );
          }
        }

        // Atomically replace the map
        this.userMap = newUserMap;
        this.logger.log(
          `User cache updated successfully with ${this.userMap.size} users.`,
        );
      } else {
        this.logger.error(
          `Failed to update user cache. Auth service responded with status ${response.status}. Data: ${JSON.stringify(response.data)}`,
        );
        // Keep stale cache on non-200 response
      }
    } catch (error) {
      // Keep stale cache on error
      if (error instanceof AxiosError) {
        this.logger.error(
          `Error updating user cache (AxiosError): ${error.message}. Status: ${error.response?.status}. Endpoint: ${endpoint}`,
          error.stack,
        );
      } else if (error instanceof Error) {
        this.logger.error(
          `Error updating user cache: ${error.message}. Endpoint: ${endpoint}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Unknown error updating user cache. Endpoint: ${endpoint}`,
          error,
        );
      }
      this.logger.warn('User cache update failed. Keeping stale data.');
    }
  }

  /**
   * Gets the username for a given user ID from the cache.
   * Returns undefined if the user is not found in the cache.
   */
  getUsernameById(id: number): string | undefined {
    return this.userMap.get(id);
  }

  /**
   * Gets a read-only copy of the entire user cache map.
   */
  getUserMap(): ReadonlyMap<number, string> {
    return this.userMap;
  }
}
