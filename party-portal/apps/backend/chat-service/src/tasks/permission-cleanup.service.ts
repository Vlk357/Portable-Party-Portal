import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, LessThanOrEqual } from 'typeorm';
import { UserAbility } from '../entities/user-ability.entity';
import { RoleAbility } from '../entities/role-ability.entity'; // Import RoleAbility
import { UserRole } from '../entities/user-role.entity'; // Import UserRole

@Injectable()
export class PermissionCleanupService {
  private readonly logger = new Logger(PermissionCleanupService.name);

  constructor(
    @InjectRepository(UserAbility)
    private userAbilityRepo: Repository<UserAbility>,
    @InjectRepository(RoleAbility)
    private roleAbilityRepo: Repository<RoleAbility>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
  ) {}

  // Main cron job to trigger all cleanups
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAllExpiries() {
    this.logger.log('Starting scheduled permission expiry cleanup...');
    const now = new Date();

    try {
      // Run all cleanup tasks in parallel
      await Promise.all([
        this.handleExpiredUserAbilities(now),
        this.handleExpiredRoleAbilities(now),
        this.handleExpiredUserRoles(now),
      ]);
      this.logger.log('Finished scheduled permission expiry cleanup.');
    } catch (error) {
      // Catch potential errors from Promise.all (though individual methods also log)
      this.logger.error(
        `Error during parallel cleanup execution: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleExpiredUserAbilities(now: Date): Promise<void> {
    this.logger.debug('Running cleanup for expired UserAbility records...');
    try {
      const result = await this.userAbilityRepo.delete({
        expiresAt: LessThanOrEqual(now),
      });
      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Deleted ${result.affected} expired UserAbility records.`,
        );
      } else {
        this.logger.debug('No expired UserAbility records found to delete.');
      }
    } catch (error) {
      this.logger.error(
        `Error during expired UserAbility cleanup: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleExpiredRoleAbilities(now: Date): Promise<void> {
    this.logger.debug('Running cleanup for expired RoleAbility records...');
    try {
      const result = await this.roleAbilityRepo.delete({
        expiresAt: LessThanOrEqual(now),
      });
      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Deleted ${result.affected} expired RoleAbility records.`,
        );
      } else {
        this.logger.debug('No expired RoleAbility records found to delete.');
      }
    } catch (error) {
      this.logger.error(
        `Error during expired RoleAbility cleanup: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleExpiredUserRoles(now: Date): Promise<void> {
    this.logger.debug('Running cleanup for expired UserRole records...');
    try {
      const result = await this.userRoleRepo.delete({
        expiresAt: LessThanOrEqual(now),
      });
      if (result.affected && result.affected > 0) {
        this.logger.log(`Deleted ${result.affected} expired UserRole records.`);
      } else {
        this.logger.debug('No expired UserRole records found to delete.');
      }
    } catch (error) {
      this.logger.error(
        `Error during expired UserRole cleanup: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
