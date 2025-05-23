// src/filters/ws-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface ErrorWithMessage {
  message: string;
  [key: string]: unknown;
}

function isErrorWithMessage(obj: unknown): obj is ErrorWithMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    typeof (obj as ErrorWithMessage).message === 'string'
  );
}

@Catch(WsException)
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: WsException, host: ArgumentsHost): void {
    try {
      // Get WebSocket context
      const ctx = host.switchToWs();

      // Explicitly type the client as Socket to satisfy ESLint
      const client = ctx.getClient<Socket>();

      // Handle the error with proper type checking
      let message: string;
      try {
        const error = exception.getError();
        if (typeof error === 'string') {
          message = error;
        } else if (isErrorWithMessage(error)) {
          message = error.message;
        } else {
          message = 'Internal server error';
          this.logger.error('Unexpected error format', error);
        }
      } catch (err) {
        message = 'Error processing exception';
        this.logger.error('Failed to extract error details', err);
      }

      // Emit the error
      if (client && typeof client.emit === 'function') {
        client.emit('error', { message, status: 'error' });
      } else {
        this.logger.error('Unable to emit to client - invalid client object');
      }
    } catch (err) {
      this.logger.error('Exception filter error', err);
    }
  }
}
