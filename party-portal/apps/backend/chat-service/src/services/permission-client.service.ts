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

/**
 * PermissionCache class to efficiently store and query permissions
 */
class PermissionCache {
  private roles = new Map<number, Role>();
  private abilities = new Map<number, Ability>();
  private users = new Map<number, UserPermissions>();

  // Quick lookup maps
  private userRoles = new Map<number, Set<number>>(); // userId -> Set of roleIds
  private userAbilities = new Map<number, Set<number>>(); // userId -> Set of abilityIds
  private roleAbilities = new Map<number, Set<number>>(); // roleId -> Set of abilityIds
  private abilityByName = new Map<string, number>(); // abilityName -> abilityId

  constructor(private logger: Logger) {}

  /**
   * Clear all cached data
   */
  clear(): void {
    this.roles.clear();
    this.abilities.clear();
    this.users.clear();
    this.userRoles.clear();
    this.userAbilities.clear();
    this.roleAbilities.clear();
    this.abilityByName.clear();
  }

  /**
   * Update the cache with new permissions data
   */
  update(data: ServicePermissions): void {
    this.clear();

    // First, store all abilities and create name lookups
    if (data.abilities) {
      data.abilities.forEach((ability) => {
        this.abilities.set(ability.id, ability);

        // Create ability name -> id lookup
        const abilityName = this.getAbilityFullName(ability);
        this.abilityByName.set(abilityName, ability.id);
      });
    }

    // Next, store all roles and their abilities
    if (data.roles) {
      data.roles.forEach((role) => {
        this.roles.set(role.id, role);

        // Store role -> abilities relationships
        const roleAbilityIds = new Set<number>();
        if (role.abilities) {
          role.abilities.forEach((ability) => {
            roleAbilityIds.add(ability.id);
          });
        }
        this.roleAbilities.set(role.id, roleAbilityIds);
      });
    }

    // Finally, store users with their roles and abilities
    if (data.users) {
      data.users.forEach((user) => {
        this.users.set(user.id, user);

        // Store user -> roles relationships
        const userRoleIds = new Set<number>();
        if (user.roles) {
          user.roles.forEach((role) => {
            // Extract the role ID
            userRoleIds.add(role.id);
          });
        }
        this.userRoles.set(user.id, userRoleIds);

        // Store user -> abilities relationships (direct assignments)
        const userAbilityIds = new Set<number>();
        if (user.abilities) {
          user.abilities.forEach((ability) => {
            userAbilityIds.add(ability.id);
          });
        }
        this.userAbilities.set(user.id, userAbilityIds);
      });
    }

    this.logger.log(
      `Permission cache updated: ${this.abilities.size} abilities, ` +
        `${this.roles.size} roles, ${this.users.size} users`,
    );
  }

  /**
   * Check if a user has a specific permission
   */
  hasPermission(userId: number, permissionString: string): boolean {
    // First check if user exists
    if (!this.users.has(userId)) {
      return false;
    }

    // Check direct user ability assignments
    if (this.hasDirectAbility(userId, permissionString)) {
      return true;
    }

    // Check user's roles for the ability
    return this.hasRoleBasedAbility(userId, permissionString);
  }

  /**
   * Get all users with a specific permission
   */
  getUsersWithPermission(permissionString: string): number[] {
    const result: number[] = [];

    // Get the ability ID from the permission string
    const abilityId = this.getAbilityIdByName(permissionString);
    if (!abilityId) {
      return result;
    }

    // Check each user
    this.users.forEach((user, userId) => {
      if (this.hasPermission(userId, permissionString)) {
        result.push(userId);
      }
    });

    return result;
  }

  /**
   * Get a user by ID with all permissions resolved
   */
  getUser(userId: number): UserPermissions | undefined {
    return this.users.get(userId);
  }

  /**
   * Get all roles for a user
   */
  getUserRoles(userId: number): Role[] {
    const roleIds = this.userRoles.get(userId);
    if (!roleIds) {
      return [];
    }

    const roles: Role[] = [];
    roleIds.forEach((roleId) => {
      const role = this.roles.get(roleId);
      if (role) {
        roles.push(role);
      }
    });

    return roles;
  }

  /**
   * Get all abilities for a user
   */
  getUserAbilities(userId: number): Ability[] {
    // Start with direct abilities
    const abilities = new Map<number, Ability>();

    // Add direct abilities
    const directAbilityIds =
      this.userAbilities.get(userId) || new Set<number>();
    directAbilityIds.forEach((abilityId) => {
      const ability = this.abilities.get(abilityId);
      if (ability) {
        abilities.set(abilityId, ability);
      }
    });

    // Add abilities from roles
    const roleIds = this.userRoles.get(userId) || new Set<number>();
    roleIds.forEach((roleId) => {
      const roleAbilityIds =
        this.roleAbilities.get(roleId) || new Set<number>();
      roleAbilityIds.forEach((abilityId) => {
        const ability = this.abilities.get(abilityId);
        if (ability) {
          abilities.set(abilityId, ability);
        }
      });
    });

    return Array.from(abilities.values());
  }

  // Helper methods
  private hasDirectAbility(userId: number, permissionString: string): boolean {
    // Get ability ID
    const abilityId = this.getAbilityIdByName(permissionString);
    if (!abilityId) {
      return false;
    }

    // Check if user has this ability directly
    const userAbilityIds = this.userAbilities.get(userId);
    return userAbilityIds ? userAbilityIds.has(abilityId) : false;
  }

  private hasRoleBasedAbility(
    userId: number,
    permissionString: string,
  ): boolean {
    // Get ability ID
    const abilityId = this.getAbilityIdByName(permissionString);
    if (!abilityId) {
      return false;
    }

    // Check if any of user's roles has this ability
    const userRoleIds = this.userRoles.get(userId);
    if (!userRoleIds) {
      return false;
    }

    for (const roleId of userRoleIds) {
      const roleAbilityIds = this.roleAbilities.get(roleId);
      if (roleAbilityIds && roleAbilityIds.has(abilityId)) {
        return true;
      }
    }

    return false;
  }

  private getAbilityIdByName(permissionString: string): number | undefined {
    return this.abilityByName.get(permissionString);
  }

  private getAbilityFullName(ability: Ability): string {
    let name = `${ability.module}:${ability.resource}:${ability.action}`;
    if (ability.resourceConstraint) {
      name += `:${ability.resourceConstraint}`;
    }
    return name;
  }
}

@Injectable()
export class PermissionClientService implements OnModuleInit {
  private readonly logger = new Logger(PermissionClientService.name);
  private readonly permissionCache = new PermissionCache(this.logger);

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

      // Update the permission cache with fresh data
      this.permissionCache.update(response.data);

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

  /**
   * Check if a user has a specific permission
   */
  checkPermission(userId: number, abilityString: string): boolean {
    return this.permissionCache.hasPermission(userId, abilityString);
  }

  /**
   * Get all roles for a user
   */
  getUserRoles(userId: number): Role[] {
    return this.permissionCache.getUserRoles(userId);
  }

  /**
   * Get all abilities for a user
   */
  getUserAbilities(userId: number): Ability[] {
    return this.permissionCache.getUserAbilities(userId);
  }

  /**
   * Get all users with a specific permission
   */
  getUsersWithPermission(abilityString: string): number[] {
    return this.permissionCache.getUsersWithPermission(abilityString);
  }

  /**
   * Get user details with permissions
   */
  getUser(userId: number): UserPermissions | undefined {
    return this.permissionCache.getUser(userId);
  }
}
