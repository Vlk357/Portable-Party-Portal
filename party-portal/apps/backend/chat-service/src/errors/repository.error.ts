import { ChatError } from './chat.error';

export class RepositoryError extends ChatError {
  constructor(operation: string, entity: string, cause?: Error) {
    super(`Failed to ${operation} ${entity}`, cause);
    this.name = 'RepositoryError';
  }
}
