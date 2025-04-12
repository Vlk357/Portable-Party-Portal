import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Role } from '../interfaces/role.interface';
import { Ability } from '../interfaces/ability.interface';
import { UserPermissions } from '../interfaces/user-permission.interface';
import { decode } from 'jsonwebtoken';

interface ServicePermissions {
  roles: Role[];
  abilities: Ability[];
  users: UserPermissions[];
}

interface TokenResponse {
  token: string;
  refresh_token: string;
  refresh_token_expiration: number;
}

@Injectable()
export class PermissionClientService implements OnModuleInit {
  private readonly logger = new Logger(PermissionClientService.name);
  private readonly cache = new Map<number, UserPermissions>();

  // Authentication state
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private accessTokenExpiry: number | null = null;
  private refreshTokenExpiry: number | null = null;
  private tokenRefreshInProgress = false;

  // Timeout handles
  private accessTokenRefreshTimeout: NodeJS.Timeout | null = null;
  private permissionRefreshTimeout: NodeJS.Timeout | null = null;

  // Hard-code the URL or use environment variable directly
  private readonly baseUrl: string = process.env.AUTH_SERVICE_URL
    ? `${process.env.AUTH_SERVICE_URL}`
    : 'http://nginx/auth';

  constructor(private readonly httpService: HttpService) {}

  async onModuleInit() {
    await this.authenticate();
    await this.refreshPermissions();
  }

  private async authenticate(): Promise<void> {
    try {
      const credentials = {
        username: process.env.CHAT_SERVICE_ID || 'CHAT',
        password: process.env.CHAT_SERVICE_SECRET || 'your-secret-here',
      };

      const response = await firstValueFrom(
        this.httpService.post<TokenResponse>(
          `${this.baseUrl}/api/login`,
          credentials,
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );

      this.updateTokens(response.data);
      this.logger.log('Authentication successful');
    } catch (error) {
      this.logger.error('Authentication failed', error);
      throw error;
    }
  }

  private scheduleAccessTokenRefresh(): void {
    if (!this.accessTokenExpiry) {
      this.logger.warn('Cannot schedule token refresh: No access token expiry');
      return;
    }

    // Clear any existing timeout
    if (this.accessTokenRefreshTimeout) {
      clearTimeout(this.accessTokenRefreshTimeout);
      this.accessTokenRefreshTimeout = null;
    }

    const currentTime = Date.now();
    const expiryTime = this.accessTokenExpiry;

    // Add a buffer to refresh token before it actually expires (1 minute)
    const bufferTimeMs = 60 * 1000;

    // Calculate time until refresh needs to happen
    const timeUntilRefresh = Math.max(
      0,
      expiryTime - currentTime - bufferTimeMs,
    );

    // Log the scheduled refresh
    const refreshDate = new Date(currentTime + timeUntilRefresh);
    this.logger.log(
      `Access token expires at ${new Date(expiryTime).toISOString()}`,
    );

    this.accessTokenRefreshTimeout = setTimeout(() => {
      this.refreshAccessToken().catch((error) => {
        this.logger.error('Failed to refresh access token:', error);
      });
    }, timeUntilRefresh);

    this.logger.log(
      `Scheduled token refresh at ${refreshDate.toISOString()} (in ${timeUntilRefresh / 1000}s)`,
    );
  }

  private schedulePermissionRefresh(): void {
    // Clear any existing timeout
    if (this.permissionRefreshTimeout) {
      clearTimeout(this.permissionRefreshTimeout);
      this.permissionRefreshTimeout = null;
    }

    // Get refresh interval from environment or use default
    const refreshInterval = process.env.PERMISSION_REFRESH_INTERVAL
      ? parseInt(process.env.PERMISSION_REFRESH_INTERVAL, 10) * 1000
      : 10 * 60 * 1000; // Default to 10 minutes

    this.permissionRefreshTimeout = setTimeout(() => {
      this.refreshPermissions()
        .catch((error) => {
          this.logger.error('Failed to refresh permissions:', error);
        })
        .finally(() => {
          // Schedule next refresh regardless of success or failure
          this.schedulePermissionRefresh();
        });
    }, refreshInterval);
  }

  private async refreshAccessToken(): Promise<void> {
    // Prevent multiple concurrent refresh attempts
    if (this.tokenRefreshInProgress) {
      return;
    }

    try {
      this.tokenRefreshInProgress = true;

      if (!this.refreshToken) {
        // If no refresh token, we need to do a full authentication
        await this.authenticate();
        return;
      }

      const response = await firstValueFrom(
        this.httpService.post<TokenResponse>(
          `${this.baseUrl}/api/token/refresh`,
          { refresh_token: this.refreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );

      this.updateTokens(response.data);
      this.logger.log('Token refreshed successfully');
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      // On refresh failure, try full authentication
      this.refreshToken = null;
      await this.authenticate();
    } finally {
      this.tokenRefreshInProgress = false;
    }
  }

  private updateTokens(tokenData: TokenResponse): void {
    this.accessToken = tokenData.token;
    this.refreshToken = tokenData.refresh_token;

    // Parse JWT to get access token expiry
    try {
      const decoded = decode(tokenData.token);

      // Type guard to check if decoded is an object with exp property
      if (decoded && typeof decoded === 'object' && 'exp' in decoded) {
        this.accessTokenExpiry = (decoded.exp as number) * 1000; // Convert to milliseconds
        // Schedule refresh based on actual token expiry
        this.scheduleAccessTokenRefresh();
      } else {
        this.logger.warn('JWT token does not contain expiration claim');
      }
    } catch (e) {
      this.logger.error('Failed to decode JWT', e);
    }

    // Set refresh token expiry
    this.refreshTokenExpiry = tokenData.refresh_token_expiration * 1000;
  }

  private getAuthHeaders() {
    return this.accessToken
      ? { Authorization: `Bearer ${this.accessToken}` }
      : {};
  }

  async refreshPermissions(): Promise<void> {
    await this.executeWithRetry(async () => {
      const response = await firstValueFrom(
        this.httpService.get<ServicePermissions>(
          `${this.baseUrl}/api/permissions/CHAT`,
          { headers: this.getAuthHeaders() },
        ),
      );

      // Update cache
      this.cache.clear();
      if (response.data?.users) {
        response.data.users.forEach((user) => {
          this.cache.set(user.id, user);
        });
      }

      // After initial permissions fetch, schedule periodic refreshes
      if (!this.permissionRefreshTimeout) {
        this.schedulePermissionRefresh();
      }
    });
  }

  async addUserAbility(userId: number, ability: string): Promise<void> {
    await this.executeWithRetry(async () => {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/permissions/user/${userId}/ability`,
          { ability },
          { headers: this.getAuthHeaders() },
        ),
      );

      // Refresh cache for this user
      await this.refreshPermissions();
    });
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries = 1,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      // Check for 401 Unauthorized error
      const axiosError = error as { response?: { status?: number } };

      if (
        axiosError.response?.status === 401 &&
        retries > 0 &&
        !this.tokenRefreshInProgress
      ) {
        this.logger.log('Request failed with 401, attempting token refresh');
        await this.refreshAccessToken();
        return this.executeWithRetry(fn, retries - 1);
      }
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
