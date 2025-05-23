import { ChatError } from './chat.error';

export class AuthenticationError extends ChatError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'AuthenticationError';
  }
}
