import { Injectable, Logger } from '@nestjs/common';
import { MessageDeliveryStatusRepository } from '../repositories/message-delivery-status.repository';
import { MessageDeliveryStatus } from '../entities/message-delivery-status.entity';
import { DeliveryStatusError } from 'src/errors/delivery-status.error';

@Injectable()
export class MessageDeliveryStatusService {
  private readonly logger = new Logger(MessageDeliveryStatusService.name);

  constructor(
    private readonly statusRepository: MessageDeliveryStatusRepository,
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

  async markAsDelivered(
    messageId: number,
    chatRoomUserId: number,
  ): Promise<void> {
    try {
      await this.statusRepository.updateDeliveryStatus(
        messageId,
        chatRoomUserId,
        { delivered_to_device_at: new Date() },
      );
      this.logger.log(
        `Message ${messageId} marked as delivered for user ${chatRoomUserId}`,
      );
    } catch (error) {
      this.handleError(
        'mark message as delivered',
        error,
        messageId,
        chatRoomUserId,
      );
    }
  }

  async markAsSeen(messageId: number, chatRoomUserId: number): Promise<void> {
    try {
      const now = new Date();
      await this.statusRepository.updateDeliveryStatus(
        messageId,
        chatRoomUserId,
        {
          delivered_to_device_at: now, // Ensure delivery is marked
          seen_at: now,
        },
      );
      this.logger.log(
        `Message ${messageId} marked as seen for user ${chatRoomUserId}`,
      );
    } catch (error) {
      this.handleError(
        'mark message as seen',
        error,
        messageId,
        chatRoomUserId,
      );
    }
  }

  async markAsRead(messageId: number, chatRoomUserId: number): Promise<void> {
    try {
      const now = new Date();
      await this.statusRepository.updateDeliveryStatus(
        messageId,
        chatRoomUserId,
        {
          delivered_to_device_at: now, // Ensure delivery is marked
          seen_at: now, // Ensure seen is marked
          read_receipt_at: now,
        },
      );
      this.logger.log(
        `Message ${messageId} marked as read for user ${chatRoomUserId}`,
      );
    } catch (error) {
      this.handleError(
        'mark message as read',
        error,
        messageId,
        chatRoomUserId,
      );
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
