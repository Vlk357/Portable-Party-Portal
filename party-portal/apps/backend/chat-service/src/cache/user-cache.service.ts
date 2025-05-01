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
import { WebSocketAuthMiddleware } from 'src/auth/websocket-auth.middleware';

// Interfaces based on the example response
interface UserListItem {
  id: number;
  username: string;
}

interface LoginResponse {
  token: string;
  refresh_token: string;
  refresh_token_expiration: number; // Unix timestamp
}

interface RefreshResponse {
  token: string;
  refresh_token: string;
}

// Helper function for async delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class UserCacheService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(UserCacheService.name);
  private userMap: Map<number, string> = new Map(); // Cache: ID -> Username
  private readonly authUrl: string;
  private readonly serviceUsername: string;
  private readonly servicePassword: string;
  private jwtToken: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false; // Simple lock to prevent concurrent refreshes
  private readonly cacheInterval: number;
  private intervalRef: NodeJS.Timeout | null = null;
  private serviceUserId: number | null = null; // Add a property to store the ID

  // Retry configuration for initial login
  private readonly INITIAL_LOGIN_MAX_RETRIES = 10;
  private readonly INITIAL_LOGIN_RETRY_DELAY_MS = 5000;

  constructor(
    private readonly httpService: HttpService,
    private readonly authMiddleware: WebSocketAuthMiddleware,
  ) {
    // Read configuration from environment variables
    this.authUrl = process.env.AUTH_SERVICE_URL || 'http://nginx/auth'; // Adjust if needed (e.g., http://auth)
    const user = process.env.CHAT_SERVICE_API_USER; // Read into temporary variable
    const pass = process.env.CHAT_SERVICE_API_PASSWORD; // Read into temporary variable
    const intervalMsString = process.env.USER_CACHE_INTERVAL_MS;

    // --- Validation (Essential) ---
    if (!this.authUrl) throw new Error('AUTH_SERVICE_URL not set.');
    if (!user) throw new Error('CHAT_SERVICE_API_USER not set.'); // Validate temp variable
    if (!pass) throw new Error('CHAT_SERVICE_API_PASSWORD not set.'); // Validate temp variable
    // --- End Validation ---

    // Assign validated values to properties AFTER validation
    this.serviceUsername = user;
    this.servicePassword = pass;

    // --- Interval setup (Keep as before) ---
    const defaultInterval = 30 * 60 * 1000; // 30 minutes default
    this.cacheInterval = intervalMsString
      ? parseInt(intervalMsString, 10)
      : defaultInterval;
    if (isNaN(this.cacheInterval) || this.cacheInterval < 10000) {
      // Min 10s
      this.logger.warn(
        `Invalid USER_CACHE_INTERVAL_MS. Using default: ${defaultInterval}ms`,
      );
      this.cacheInterval = defaultInterval;
    }
    this.logger.log(`User cache interval set to ${this.cacheInterval}ms`);
    // --- End Interval setup ---
  }

  // --- Lifecycle Hooks ---
  async onModuleInit() {
    this.logger.log('Initializing user cache - attempting initial login...');
    let loggedIn = false;
    let attempts = 0;

    while (!loggedIn && attempts < this.INITIAL_LOGIN_MAX_RETRIES) {
      attempts++;
      this.logger.log(
        `Initial login attempt ${attempts}/${this.INITIAL_LOGIN_MAX_RETRIES}...`,
      );
      try {
        loggedIn = await this.login();
        if (loggedIn) {
          this.logger.log('Initial login successful.');
          if (this.jwtToken) {
            const extractedId = this.authMiddleware.getUserIdFromToken(
              this.jwtToken,
            );
            if (extractedId !== null) {
              this.serviceUserId = extractedId;
              this.logger.log(
                `Successfully extracted service user ID from initial JWT: ${this.serviceUserId}`,
              );
            } else {
              // Log error if extraction failed despite having a token
              this.logger.error(
                'Initial login succeeded, but failed to extract user ID from the JWT.',
              );
            }
          }
          await this.updateCache(); // Perform initial cache load if login succeeded
        } else {
          // login() returned false but didn't throw (e.g., 401 Unauthorized) - no point retrying this specific error
          this.logger.error(
            'Initial login failed with non-retryable error (e.g., bad credentials). Cache will not be populated initially.',
          );
          break; // Exit the retry loop
        }
      } catch (error) {
        // Check if it's a potentially temporary error (like 502, 503, 504, connection refused)
        const isRetryable =
          error instanceof AxiosError &&
          (!error.response || // Network error (connection refused, DNS, etc.)
            (error.response.status >= 500 && error.response.status <= 504)); // Server/Gateway errors

        if (isRetryable && attempts < this.INITIAL_LOGIN_MAX_RETRIES) {
          this.logger.warn(
            `Initial login attempt ${attempts} failed with retryable error (${error instanceof Error ? error.message : String(error)}). Retrying in ${this.INITIAL_LOGIN_RETRY_DELAY_MS / 1000}s...`,
          );
          await delay(this.INITIAL_LOGIN_RETRY_DELAY_MS);
        } else {
          // Non-retryable error or max retries reached
          this.logger.error(
            `Initial login failed after ${attempts} attempts. Cache will not be populated initially. Last error: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Log the original error from login() if it exists and wasn't logged deeply enough
          if (
            !(error instanceof AxiosError && error.response?.status === 401)
          ) {
            // Avoid double logging 401s
            this.logAuthError(
              'Final initial login attempt failed',
              error,
              `${this.authUrl}/api/login`,
            );
          }
          break; // Exit the retry loop
        }
      }
    }

    if (!loggedIn && attempts >= this.INITIAL_LOGIN_MAX_RETRIES) {
      this.logger.error(
        `Initial login failed after exhausting all ${this.INITIAL_LOGIN_MAX_RETRIES} retries. Cache will not be populated initially.`,
      );
    }
  }

  onApplicationBootstrap() {
    this.logger.log(
      `Setting up dynamic interval for user cache update (${this.cacheInterval}ms)`,
    );
    if (this.intervalRef) clearInterval(this.intervalRef);

    // Use void operator to ignore the promise returned by updateCache inside the callback
    this.intervalRef = setInterval(() => {
      void this.updateCache().catch((err) => {
        // Add void here
        this.logger.error(
          `Unhandled error during scheduled cache update: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
    }, this.cacheInterval);
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      this.logger.log('Clearing user cache update interval.');
      clearInterval(this.intervalRef);
    }
  }
  // --- End Lifecycle Hooks ---

  // --- Authentication Methods ---
  private async login(): Promise<boolean> {
    const loginEndpoint = `${this.authUrl}/api/login`; // Use the correct login path
    try {
      const response = await firstValueFrom(
        this.httpService.post<LoginResponse>(
          loginEndpoint,
          {
            username: this.serviceUsername,
            password: this.servicePassword,
          },
          { timeout: 15000 }, // Increased timeout for login
        ),
      );

      if (
        response.status === 200 &&
        response.data?.token &&
        response.data?.refresh_token
      ) {
        this.jwtToken = response.data.token;
        this.refreshToken = response.data.refresh_token;
        return true;
      } else {
        this.logger.error(
          `Service login failed. Status: ${response.status}. Data: ${JSON.stringify(response.data)}`,
        );
        this.clearTokens();
        return false; // Indicate non-exception failure (e.g., 401)
      }
    } catch (error) {
      // Don't log generic error here, let the caller (onModuleInit) handle logging based on retry logic
      this.clearTokens();
      // Re-throw the error so the caller knows an exception occurred
      throw error;
    }
  }

  private async refreshTokens(): Promise<boolean> {
    if (!this.refreshToken) {
      this.logger.warn('Cannot refresh tokens: No refresh token available.');
      return false;
    }
    if (this.isRefreshing) {
      this.logger.warn('Token refresh already in progress. Skipping.');
      return false; // Or wait for the existing refresh to complete
    }

    this.isRefreshing = true;
    const refreshEndpoint = `${this.authUrl}/api/token/refresh`;
    this.logger.log(`Attempting to refresh tokens at ${refreshEndpoint}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post<RefreshResponse>(
          refreshEndpoint,
          { refresh_token: this.refreshToken },
          { timeout: 10000 },
        ),
      );

      if (
        response.status === 200 &&
        response.data?.token &&
        response.data?.refresh_token
      ) {
        this.jwtToken = response.data.token;
        this.refreshToken = response.data.refresh_token;
        this.logger.log('Token refresh successful. New tokens stored.');
        this.isRefreshing = false;
        return true;
      } else {
        this.logger.error(
          `Token refresh failed. Status: ${response.status}. Data: ${JSON.stringify(response.data)}`,
        );
        // If refresh fails (e.g., refresh token expired), force re-login next time
        this.clearTokens();
        this.isRefreshing = false;
        return false;
      }
    } catch (error) {
      this.logAuthError('Token refresh failed', error, refreshEndpoint);
      // Assume refresh token is invalid, clear all tokens to force re-login
      this.clearTokens();
      this.isRefreshing = false;
      return false;
    }
  }

  /** Ensures a valid JWT is available, attempting refresh or login if necessary. */
  private async ensureValidToken(): Promise<boolean> {
    if (this.jwtToken) {
      // Basic check: token exists. Could add expiry check here if needed.
      return true;
    }

    this.logger.warn('No valid JWT token found. Attempting recovery...');

    // Try refreshing first if possible
    if (this.refreshToken) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return true;
      // If refresh failed, fall through to login
      this.logger.warn('Token refresh failed. Attempting full login.');
    } else {
      this.logger.warn('No refresh token available. Attempting full login.');
    }

    // Attempt full login as a last resort
    // Note: This login call within ensureValidToken does NOT have the retry logic.
    // The retry logic is primarily for the *initial* startup sequence in onModuleInit.
    // If ensureValidToken fails here, subsequent calls might retry if the root cause was temporary.
    try {
      const loggedIn = await this.login();
      return loggedIn;
    } catch (error) {
      // Log the error from this specific login attempt if needed
      this.logAuthError(
        'Login attempt within ensureValidToken failed',
        error,
        `${this.authUrl}/api/login`,
      );
      return false;
    }
  }

  private clearTokens(): void {
    this.jwtToken = null;
    this.refreshToken = null;
  }
  // --- End Authentication Methods ---

  // --- Cache Update Logic ---
  async updateCache(): Promise<void> {
    // Ensure we have a valid token before proceeding
    const hasToken = await this.ensureValidToken();
    if (!hasToken) {
      this.logger.error(
        'Cannot update cache: Failed to obtain a valid authentication token.',
      );
      return; // Abort update if no token could be obtained
    }

    this.logger.log('Attempting to update user cache using JWT...');
    const endpoint = `${this.authUrl}/api/user/list`; // Ensure this endpoint exists

    try {
      const response = await firstValueFrom(
        this.httpService.get<UserListItem[]>(endpoint, {
          headers: {
            Authorization: `Bearer ${this.jwtToken}`, // Use JWT
            Accept: 'application/json',
          },
          timeout: 10000,
        }),
      );

      // --- Process successful response (Keep as before) ---
      if (response.status === 200 && Array.isArray(response.data)) {
        const newUserMap = new Map<number, string>();
        for (const user of response.data) {
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
        this.userMap = newUserMap; // Atomic update
        this.logger.log(
          `User cache updated successfully with ${this.userMap.size} users.`,
        );
      } else {
        this.logger.error(
          `Failed to update user cache. Auth service responded with status ${response.status}. Data: ${JSON.stringify(response.data)}`,
        );
      }
      // --- End Process successful response ---
    } catch (error) {
      // --- Error Handling ---
      if (error instanceof AxiosError && error.response?.status === 401) {
        // Unauthorized - Token likely expired or invalid
        this.logger.warn(
          'Received 401 Unauthorized during cache update. Clearing JWT token to force refresh/login on next attempt.',
        );
        this.jwtToken = null; // Clear only JWT, keep refresh token to attempt refresh
      } else {
        // Log other errors
        this.logAuthError('Error updating user cache', error, endpoint);
      }
      this.logger.warn('User cache update failed. Keeping stale data.');
      // --- End Error Handling ---
    }
  }
  // --- End Cache Update Logic ---

  // --- Utility and Public Methods ---
  private logAuthError(
    message: string,
    error: unknown,
    endpoint: string,
  ): void {
    if (error instanceof AxiosError) {
      this.logger.error(
        `${message} (AxiosError): ${error.message}. Status: ${error.response?.status}. Endpoint: ${endpoint}`,
        error.stack, // Include stack trace for Axios errors too
      );
    } else if (error instanceof Error) {
      this.logger.error(
        `${message}: ${error.message}. Endpoint: ${endpoint}`,
        error.stack,
      );
    } else {
      this.logger.error(
        `${message} (Unknown Error). Endpoint: ${endpoint}`,
        error,
      );
    }
  }

  getUsernameById(id: number): string | undefined {
    return this.userMap.get(id);
  }

  getUserMap(): ReadonlyMap<number, string> {
    return this.userMap;
  }

  /** Checks if the service has successfully logged in (has a JWT token). */
  isReady(): boolean {
    // Consider adding a check if the userMap has been populated at least once?
    // return !!this.jwtToken && this.userMap.size > 0;
    return !!this.jwtToken;
  }

  /** Returns the username configured for this service. */
  getServiceUsername(): string {
    return this.serviceUsername;
  }

  /**
   * Returns the cached ID of the service user used by this service instance.
   * Returns null if the service hasn't logged in successfully or couldn't find its own ID yet.
   */
  public getServiceUserId(): number | null {
    // Ensure this is called only after the service is likely initialized and logged in.
    // The null check handles cases where the ID hasn't been found/cached yet.
    if (this.serviceUserId === null) {
      this.logger.warn(
        'getServiceUserId() called but serviceUserId is null. Cache might not be ready or ID not found.',
      );
    }
    return this.serviceUserId;
  }

  // --- End Utility and Public Methods ---
}
