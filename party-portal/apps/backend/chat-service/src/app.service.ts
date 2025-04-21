import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PermissionClientService } from './services/permission.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(private permissionService: PermissionClientService) {}
  async onModuleInit() {
    await this.permissionService.refreshPermissions();
  }

  async OnModuleInit() {
    try {
      await this.permissionService.refreshPermissions();
    } catch (error) {
      this.logger.error("Couldn't initialize cache: ", error);
    }
  }
  getHello(): string {
    return 'Hello World!';
  }
}
