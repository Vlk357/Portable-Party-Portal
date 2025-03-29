import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageVersion } from '../entities/message-version.entity';

@Injectable()
export class MessageVersionRepository {
  constructor(
    @InjectRepository(MessageVersion)
    private repository: Repository<MessageVersion>
  ) {}

  async findLatestVersion(messageId: number): Promise<MessageVersion | null> {
    return this.repository
      .createQueryBuilder('version')
      .where('version.message_id = :messageId', { messageId })
      .orderBy('version.version', 'DESC')
      .getOne();
  }

  async findVersionsForMessage(messageId: number): Promise<MessageVersion[]> {
    return this.repository
      .createQueryBuilder('version')
      .where('version.message_id = :messageId', { messageId })
      .orderBy('version.version', 'DESC')
      .getMany();
  }

  async create(data: Pick<MessageVersion, 'message_id' | 'version' | 'content' | 'created_at'>): Promise<MessageVersion> {
    const version = this.repository.create(data);
    return this.repository.save(version);
  }
}