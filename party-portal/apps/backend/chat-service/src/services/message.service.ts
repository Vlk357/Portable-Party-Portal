import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Message } from '../entities/message.entity';
import { MessageRepository } from '../repositories/message.repository';
import { MessageVersionRepository } from '../repositories/message-version.repository';
import { MessageReplyRepository } from '../repositories/message-reply.repository';
import { MessageDeliveryStatusRepository } from '../repositories/message-delivery-status.repository';
import { ChatError } from 'src/errors/chat.error';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly messageVersionRepository: MessageVersionRepository,
    private readonly messageReplyRepository: MessageReplyRepository,
    private readonly deliveryStatusRepository: MessageDeliveryStatusRepository,
  ) {}

  private handleError(error: unknown, message: string): never {
    if (error instanceof ChatError) {
      throw error;
    }
    const chatError = new ChatError(
      message,
      error instanceof Error ? error : undefined,
    );
    this.logger.error(chatError.message, chatError.stack);
    throw chatError;
  }

  async createMessage(data: {
    chatRoomId: number;
    userId: number;
    content: string;
    createdAt: Date;
    isPriority?: boolean;
    requiresReadReceipt?: boolean;
    threadParentId?: number;
    replyToMessageIds?: number[]; // Add reference to messages being replied to
  }): Promise<Message> {
    try {
      const message = await this.messageRepository.create({
        chat_room_id: data.chatRoomId,
        user_id: data.userId,
        created_at: data.createdAt,
        is_priority: data.isPriority ?? false,
        requires_read_receipt: data.requiresReadReceipt ?? false,
        thread_parent_id: data.threadParentId,
      });

      await this.messageVersionRepository.create({
        message_id: message.id,
        version: 1,
        content: data.content,
        created_at: data.createdAt,
      });

      // Create replies if any
      if (data.replyToMessageIds?.length) {
        await Promise.all(
          data.replyToMessageIds.map((referencedId) =>
            this.messageReplyRepository.create({
              replying_message_id: message.id,
              referenced_message_id: referencedId,
            }),
          ),
        );
      }

      return message;
    } catch (error: unknown) {
      this.handleError(error, 'Failed to create message');
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

      const latestVersion =
        await this.messageVersionRepository.findLatestVersion(messageId);
      if (!latestVersion) {
        throw new BadRequestException(
          `No version found for message ${messageId}`,
        );
      }

      await this.messageVersionRepository.create({
        message_id: messageId,
        version: latestVersion.version + 1,
        content,
        created_at: createdAt,
      });

      this.logger.log(`Edited message ${messageId}`);
      return message;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.handleError(error, 'Failed to edit message');
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
      this.handleError(error, `Failed to fetch messages for room ${roomId}`);
    }
  }

  async getThreadMessages(parentId: number): Promise<Message[]> {
    try {
      return await this.messageRepository.findMessagesInThread(parentId);
    } catch (error) {
      this.handleError(error, `Failed to fetch messages in thread ${parentId}`);
    }
  }

  // These methods need to exist in your MessageService class
  async getMessage(messageId: number): Promise<Message | null> {
    // Fetch message with room details
    return this.messageRepository.findById(messageId);
  }

  async softDeleteMessage(messageId: number, user_id: number): Promise<void> {
    // Update message to mark as deleted but keep in database
    await this.messageRepository.update(messageId, {
      deleted_at: new Date(),
      deleted_by_user_id: user_id,
    });
  }
}
