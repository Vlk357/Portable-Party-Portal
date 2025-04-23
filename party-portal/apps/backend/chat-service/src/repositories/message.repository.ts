import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';
import { BaseRepository } from './base.repository';
import { RepositoryError } from '../errors/repository.error';
import { MessageVersion } from '../entities/message-version.entity';

@Injectable()
export class MessageRepository extends BaseRepository<Message> {
  private readonly DELETED_MESSAGE_TEXT = 'This message has been deleted';

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {
    super(messageRepository);
  }

  /**
   * Process messages to replace content of deleted messages with placeholder
   * and include only latest version by default
   */
  private processMessages(
    messages: Message[],
    includeAllVersions = false,
  ): Message[] {
    return messages.map((message) => {
      // Create a shallow copy to avoid modifying the repo data
      const processedMessage = { ...message };

      // Process versions - keep only latest unless specified
      if (processedMessage.versions && processedMessage.versions.length > 0) {
        // Sort versions by created_at to find the latest
        const sortedVersions = [...processedMessage.versions].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        // Check if the message is deleted
        if (processedMessage.deleted_at) {
          // Modify just the latest version's content
          sortedVersions[0] = {
            ...sortedVersions[0],
            content: this.DELETED_MESSAGE_TEXT,
          };
        }

        // Keep all versions or just the latest
        processedMessage.versions = includeAllVersions
          ? sortedVersions
          : [sortedVersions[0]];
      }

      return processedMessage;
    });
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
        // Include versions
        .leftJoinAndSelect('message.versions', 'version')
        // Include replies
        .leftJoinAndSelect('message.replies_received', 'reply')
        .leftJoinAndSelect('reply.replying_message', 'replyingMessage')
        .leftJoinAndSelect('replyingMessage.versions', 'replyMessageVersion')
        .orderBy('message.created_at', 'DESC')
        .take(limit);

      if (before) {
        query.andWhere('message.created_at < :before', { before });
      }

      const messages = await query.getMany();

      // Process messages to handle deleted content and versions
      return this.processMessages(messages);
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
    try {
      const query = this.messageRepository
        .createQueryBuilder('message')
        .where('message.thread_parent_id = :parentId', { parentId })
        // Include versions
        .leftJoinAndSelect('message.versions', 'version')
        // Include replies
        .leftJoinAndSelect('message.replies_received', 'reply')
        .leftJoinAndSelect('reply.replying_message', 'replyingMessage')
        .leftJoinAndSelect('replyingMessage.versions', 'replyMessageVersion')
        .orderBy('message.created_at', 'DESC')
        .take(limit);

      if (before) {
        query.andWhere('message.created_at < :before', { before });
      }

      const messages = await query.getMany();

      // Process messages
      return this.processMessages(messages);
    } catch (error) {
      throw new RepositoryError(
        'find messages in thread',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findThreadsWithReplies(roomId: number): Promise<Message[]> {
    try {
      const query = this.messageRepository
        .createQueryBuilder('message')
        .where('message.chat_room_id = :roomId', { roomId })
        .andWhere('message.thread_parent_id IS NULL')
        // Include versions
        .leftJoinAndSelect('message.versions', 'version')
        // Include replies
        .leftJoinAndSelect('message.replies_received', 'reply')
        .leftJoinAndSelect('reply.replying_message', 'replyingMessage')
        .leftJoinAndSelect('replyingMessage.versions', 'replyMessageVersion');

      // Subquery to check for replies
      const subQuery = this.messageRepository
        .createQueryBuilder('sub_message')
        .where('sub_message.thread_parent_id = message.id');

      const messages = await query
        .andWhere(`EXISTS (${subQuery.getQuery()})`)
        .setParameters(subQuery.getParameters())
        .getMany();

      // Process messages
      return this.processMessages(messages);
    } catch (error) {
      throw new RepositoryError(
        'find threads with replies',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findPriorityMessages(roomId: number): Promise<Message[]> {
    try {
      const messages = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.chat_room_id = :roomId', { roomId })
        .andWhere('message.is_priority = :priority', { priority: true })
        // Include versions
        .leftJoinAndSelect('message.versions', 'version')
        // Include replies
        .leftJoinAndSelect('message.replies_received', 'reply')
        .leftJoinAndSelect('reply.replying_message', 'replyingMessage')
        .leftJoinAndSelect('replyingMessage.versions', 'replyMessageVersion')
        .orderBy('message.created_at', 'DESC')
        .getMany();

      // Process messages
      return this.processMessages(messages);
    } catch (error) {
      throw new RepositoryError(
        'find priority messages',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findById(id: number): Promise<Message | null> {
    try {
      const message = await this.repository.findOne({
        where: { id },
        relations: [
          'versions',
          'replies_received',
          'replies_received.replying_message',
          'replies_received.replying_message.versions',
          'replies_sent',
          'replies_sent.referenced_message',
          'replies_sent.referenced_message.versions',
        ],
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

  /**
   * Get all versions for a specific message
   */
  async findAllVersionsForMessage(
    messageId: number,
  ): Promise<MessageVersion[]> {
    try {
      const message = await this.repository.findOne({
        where: { id: messageId },
        relations: ['versions'],
      });

      if (!message) {
        throw new RepositoryError(
          'find all versions for message',
          this.repository.metadata.name,
          new Error(`Message with ID ${messageId} not found`),
        );
      }

      // Return sorted versions, newest first
      return message.versions.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } catch (error) {
      throw new RepositoryError(
        'find all versions for message',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find replies to a specific message
   */
  async findRepliesForMessage(messageId: number): Promise<Message[]> {
    try {
      const message = await this.repository.findOne({
        where: { id: messageId },
        relations: [
          'replies_received',
          'replies_received.replying_message',
          'replies_received.replying_message.versions',
        ],
      });

      if (!message || !message.replies_received) {
        return [];
      }

      // Extract the replying messages
      const replyMessages = message.replies_received.map(
        (reply) => reply.replying_message,
      );

      // Process and return the reply messages
      return this.processMessages(replyMessages);
    } catch (error) {
      throw new RepositoryError(
        'find replies for message',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
