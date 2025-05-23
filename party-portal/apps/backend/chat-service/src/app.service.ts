import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService /* Remove OnModuleInit if not used */ {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    return 'Chat Service is running!'; // More descriptive message
  }
}
