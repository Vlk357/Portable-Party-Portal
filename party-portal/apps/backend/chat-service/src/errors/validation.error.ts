import { ChatError } from './chat.error';

export class ValidationError extends ChatError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ValidationError';
  }
}
