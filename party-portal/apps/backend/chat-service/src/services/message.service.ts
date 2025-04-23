import { Injectable, Logger } from '@nestjs/common';
import { Message } from '../entities/message.entity';
import { MessageRepository } from '../repositories/message.repository';
import { ChatError } from '../errors/chat.error';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(private readonly messageRepository: MessageRepository) {}

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
  }): Promise<Message> {
    try {
      const message = await this.messageRepository.create({
        chat_room_id: data.chatRoomId,
        user_id: data.userId,
        content: data.content,
        created_at: data.createdAt,
      });

      this.logger.log(`Created message ${message.id}`);
      return message;
    } catch (error) {
      this.handleError(error, 'Failed to create message');
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

  async getMessage(messageId: number): Promise<Message | null> {
    try {
      const message = await this.messageRepository.findById(messageId);

      if (!message) {
        return null;
      }

      return message;
    } catch (error) {
      this.handleError(error, `Failed to fetch message ${messageId}`);
    }
  }

  async softDeleteMessage(messageId: number, userId: number): Promise<void> {
    try {
      await this.messageRepository.update(messageId, {
        deleted_at: new Date(),
        deleted_by_user_id: userId,
      });

      this.logger.log(`Deleted message ${messageId} by user ${userId}`);
    } catch (error) {
      this.handleError(error, `Failed to delete message ${messageId}`);
    }
  }
}
