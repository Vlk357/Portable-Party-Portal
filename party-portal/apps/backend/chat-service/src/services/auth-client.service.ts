import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

interface TokenValidationResponse {
  valid: boolean;
  userId: number;
}

interface AuthServiceErrorResponse {
  message: string;
  statusCode: number;
}

@Injectable()
export class AuthClientService {
  constructor(private readonly httpService: HttpService) {}

  async validateToken(token: string): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TokenValidationResponse>(
          `${process.env.AUTH_SERVICE_URL}/validate-token`,
          { token },
        ),
      );

      if (!response.data.valid) {
        throw new UnauthorizedException('Invalid token');
      }

      return response.data.userId;
    } catch (error) {
      if (error instanceof AxiosError) {
        const typedError = error as AxiosError<AuthServiceErrorResponse>;
        const errorMessage = this.getErrorMessage(typedError);
        throw new UnauthorizedException(
          `Token validation failed: ${errorMessage}`,
        );
      }
      throw new UnauthorizedException(
        'Token validation failed: Unknown error occurred',
      );
    }
  }

  private getErrorMessage(error: AxiosError<AuthServiceErrorResponse>): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    return error.message ?? 'Unknown error';
  }
}
