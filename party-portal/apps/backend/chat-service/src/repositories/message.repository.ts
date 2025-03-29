import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';
import { BaseRepository } from './base.repository';
import { RepositoryError } from 'src/errors/repository.error';

@Injectable()
export class MessageRepository extends BaseRepository<Message> {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {
    super(messageRepository);
  }

  async findMessagesForRoom(
    roomId: number,
    limit = 50,
    before?: Date,
  ): Promise<Message[]> {
    try {
      const query = this.repository
        .createQueryBuilder('message')
        .where('message.chat_room_id = :roomId', { roomId })
        .andWhere('message.thread_parent_id IS NULL')
        .andWhere('message.deleted_at IS NULL')
        .leftJoinAndSelect('message.versions', 'version')
        .orderBy('message.created_at', 'DESC')
        .take(limit);

      if (before) {
        query.andWhere('message.created_at < :before', { before });
      }

      return query.getMany();
    } catch (error) {
      throw new RepositoryError(
        'find messages for room',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findMessagesInThread(
    parentId: number,
    limit: number = 50,
    before?: Date,
  ): Promise<Message[]> {
    const query = this.messageRepository
      .createQueryBuilder('message')
      .where('message.thread_parent_id = :parentId', { parentId })
      .andWhere('message.deleted_at IS NULL')
      .leftJoinAndSelect('message.versions', 'version')
      .orderBy('message.created_at', 'DESC')
      .take(limit);

    if (before) {
      query.andWhere('message.created_at < :before', { before });
    }

    return query.getMany();
  }

  async findThreadsWithReplies(roomId: number): Promise<Message[]> {
    const query = this.messageRepository
      .createQueryBuilder('message')
      .where('message.chat_room_id = :roomId', { roomId })
      .andWhere('message.thread_parent_id IS NULL')
      .andWhere('message.deleted_at IS NULL')
      .leftJoinAndSelect('message.versions', 'version');

    // Subquery to check for replies
    const subQuery = this.messageRepository
      .createQueryBuilder('reply')
      .where('reply.thread_parent_id = message.id')
      .andWhere('reply.deleted_at IS NULL');

    return query
      .andWhere(`EXISTS (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .getMany();
  }

  async findPriorityMessages(roomId: number): Promise<Message[]> {
    return this.messageRepository
      .createQueryBuilder('message')
      .where('message.chat_room_id = :roomId', { roomId })
      .andWhere('message.is_priority = :priority', { priority: true })
      .andWhere('message.deleted_at IS NULL')
      .leftJoinAndSelect('message.versions', 'version')
      .orderBy('message.created_at', 'DESC')
      .getMany();
  }
}
