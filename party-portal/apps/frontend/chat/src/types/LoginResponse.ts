export interface LoginResponse {
  token: string;
  refresh_token: string;
  refresh_token_expiration: number; // Assuming it's a Unix timestamp (seconds)
}
