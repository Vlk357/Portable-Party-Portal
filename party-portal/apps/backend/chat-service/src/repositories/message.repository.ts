import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';
import { BaseRepository } from './base.repository';
import { RepositoryError } from '../errors/repository.error';

@Injectable()
export class MessageRepository extends BaseRepository<Message> {
  private readonly DELETED_MESSAGE_TEXT =
    process.env['DELETED_MESSAGE_TEXT'] || 'This message has been deleted';

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {
    super(messageRepository);
  }

  /**
   * Process messages to replace content of deleted messages with placeholder
   */
  private processMessages(messages: Message[]): Message[] {
    return messages.map((message) => {
      // Create a shallow copy to avoid modifying the repo data
      const processedMessage = { ...message };

      // Check if the message is deleted
      if (processedMessage.deleted_at) {
        processedMessage.content = this.DELETED_MESSAGE_TEXT;
      }

      return processedMessage;
    });
  }

  async findMessagesForRoom(
    roomId: number,
    limit = 50,
    beforeId?: number,
    beforeDate?: Date,
  ): Promise<Message[]> {
    try {
      const query = this.repository
        .createQueryBuilder('message')
        .where('message.chat_room_id = :roomId', { roomId })
        .orderBy('message.created_at', 'DESC')
        .take(limit);

      // Apply filters - priority to ID if both are provided
      if (beforeId) {
        query.andWhere('message.id < :beforeId', { beforeId });
      } else if (beforeDate) {
        query.andWhere('message.created_at < :beforeDate', { beforeDate });
      }

      const messages = await query.getMany();
      return this.processMessages(messages);
    } catch (error) {
      throw new RepositoryError(
        'find messages for room',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findById(id: number): Promise<Message | null> {
    try {
      const message = await this.repository.findOne({
        where: { id },
      });

      if (!message) {
        return null;
      }

      // Process message
      return this.processMessages([message])[0];
    } catch (error) {
      throw new RepositoryError(
        'find message by id',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
