import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Message } from '../entities/message.entity';
import { MessageRepository } from '../repositories/message.repository';
import { MessageVersionRepository } from '../repositories/message-version.repository';
import { MessageDeliveryStatusRepository } from '../repositories/message-delivery-status.repository';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly messageVersionRepository: MessageVersionRepository,
    private readonly deliveryStatusRepository: MessageDeliveryStatusRepository,
  ) {}

  async createMessage(data: {
    chatRoomId: number;
    userId: number;
    content: string;
    createdAt: Date;
    isPriority?: boolean;
    requiresReadReceipt?: boolean;
    threadParentId?: number;
  }): Promise<Message> {
    try {
      const message = await this.messageRepository.create({
        chat_room_id: data.chatRoomId,
        chat_room_user_id: data.userId,
        created_at: data.createdAt,
        is_priority: data.isPriority ?? false,
        requires_read_receipt: data.requiresReadReceipt ?? false,
        thread_parent_id: data.threadParentId,
      });

      await this.messageVersionRepository.create({
        message_id: message.id,
        version: 1,
        content: data.content,
        created_at: data.createdAt
      });

      return message;
    } catch (error) {
      this.logger.error(`Failed to create message: ${error.message}`, error.stack);
      throw error;
    }
  }

  async editMessage(
    messageId: number,
    content: string,
    createdAt: Date,
  ): Promise<Message> {
    try {
      const message = await this.messageRepository.findById(messageId);
      if (!message) {
        throw new NotFoundException(`Message ${messageId} not found`);
      }

      const latestVersion = await this.messageVersionRepository.findLatestVersion(messageId);
      if (!latestVersion) {
        throw new BadRequestException(`No version found for message ${messageId}`);
      }

      await this.messageVersionRepository.create({
        message_id: messageId,
        version: latestVersion.version + 1,
        content,
        created_at: createdAt
      });

      this.logger.log(`Edited message ${messageId}`);
      return message;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to edit message: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getRoomMessages(
    roomId: number,
    limit: number = 50,
    before?: Date,
  ): Promise<Message[]> {
    try {
      return await this.messageRepository.findMessagesForRoom(
        roomId,
        limit,
        before,
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch room messages: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getThreadMessages(parentId: number): Promise<Message[]> {
    try {
      return await this.messageRepository.findMessagesInThread(parentId);
    } catch (error) {
      this.logger.error(
        `Failed to fetch thread messages: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
