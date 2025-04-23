import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MessageDeliveryStatusRepository } from '../repositories/message-delivery-status.repository';
import { MessageDeliveryStatus } from '../entities/message-delivery-status.entity';
import { DeliveryStatusError } from 'src/errors/delivery-status.error';
import { ChatRoomUser } from 'src/entities/chat-room-user.entity';
import { ChatRoomUserRepository } from '../repositories/chat-room-user.repository';
import { MessageRepository } from 'src/repositories/message.repository';

@Injectable()
export class MessageDeliveryStatusService {
  private readonly logger = new Logger(MessageDeliveryStatusService.name);

  constructor(
    private readonly statusRepository: MessageDeliveryStatusRepository,
    private readonly chatRoomUserRepository: ChatRoomUserRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  private handleError(
    operation: string,
    error: unknown,
    messageId?: number,
    userId?: number,
  ): never {
    const statusError =
      error instanceof DeliveryStatusError
        ? error
        : new DeliveryStatusError(
            operation,
            messageId,
            userId,
            error instanceof Error ? error : undefined,
          );

    this.logger.error(
      statusError.message,
      error instanceof Error ? error.stack : undefined,
    );
    throw statusError;
  }

  async markAsDelivered(messageId: number, userId: number): Promise<void> {
    try {
      const chatRoomUser = await this.getChatRoomUserFromMessageAndUserId(
        messageId,
        userId,
      );
      await this.statusRepository.markAsDelivered(messageId, chatRoomUser.id);
      this.logger.log(
        `Message ${messageId} marked as delivered for user ${userId} (ChatRoomUser ${chatRoomUser.id})`,
      );
    } catch (error) {
      this.handleError('mark message as delivered', error, messageId, userId);
    }
  }

  async getChatRoomUserFromMessageAndUserId(
    messageId: number,
    userId: number,
  ): Promise<ChatRoomUser> {
    const message = await this.messageRepository.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    // Find the ChatRoomUser record for this user in this room
    const chatRoomUser = await this.chatRoomUserRepository.findUserInRoom(
      message.chat_room_id,
      userId,
    );

    if (!chatRoomUser) {
      throw new NotFoundException(
        `User ${userId} is not a member of the room for message ${messageId}`,
      );
    }

    return chatRoomUser;
  }

  async markAsSeen(messageId: number, userId: number): Promise<void> {
    try {
      const chatRoomUser = await this.getChatRoomUserFromMessageAndUserId(
        messageId,
        userId,
      );
      await this.statusRepository.markAsSeen(messageId, chatRoomUser.id);
      this.logger.log(
        `Message ${messageId} marked as seen for user ${userId} (ChatRoomUser ${chatRoomUser.id})`,
      );
    } catch (error) {
      this.handleError('mark message as seen', error, messageId, userId);
    }
  }

  async markAsRead(messageId: number, userId: number): Promise<void> {
    try {
      const chatRoomUser = await this.getChatRoomUserFromMessageAndUserId(
        messageId,
        userId,
      );
      await this.statusRepository.markAsRead(messageId, chatRoomUser.id);
      this.logger.log(
        `Message ${messageId} marked as read for user ${userId} (ChatRoomUser ${chatRoomUser.id})`,
      );
    } catch (error) {
      this.handleError('mark message as read', error, messageId, userId);
    }
  }

  async getUndeliveredMessages(
    chatRoomUserId: number,
  ): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findUndeliveredMessages(
        chatRoomUserId,
      );
    } catch (error) {
      this.handleError(
        'get undelivered messages',
        error,
        undefined,
        chatRoomUserId,
      );
    }
  }

  async getUnseenMessages(
    chatRoomUserId: number,
  ): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findUnseenMessages(chatRoomUserId);
    } catch (error) {
      this.handleError('get unseen messages', error, undefined, chatRoomUserId);
    }
  }

  async getPendingReadReceipts(
    chatRoomUserId: number,
  ): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findPendingReadReceipts(
        chatRoomUserId,
      );
    } catch (error) {
      this.handleError(
        'get pending read receipts',
        error,
        undefined,
        chatRoomUserId,
      );
    }
  }

  async getMessageStatus(messageId: number): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findMessageStatus(messageId);
    } catch (error) {
      this.handleError('get message status', error, messageId, undefined);
    }
  }
}
