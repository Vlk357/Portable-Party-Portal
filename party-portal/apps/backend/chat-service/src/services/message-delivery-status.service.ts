import { Injectable, Logger } from '@nestjs/common';
import { MessageDeliveryStatusRepository } from '../repositories/message-delivery-status.repository';
import { MessageDeliveryStatus } from '../entities/message-delivery-status.entity';

@Injectable()
export class MessageDeliveryStatusService {
  private readonly logger = new Logger(MessageDeliveryStatusService.name);

  constructor(
    private readonly statusRepository: MessageDeliveryStatusRepository
  ) {}

  async markAsDelivered(messageId: number, chatRoomUserId: number): Promise<void> {
    try {
      await this.statusRepository.updateDeliveryStatus(
        messageId,
        chatRoomUserId,
        { delivered_to_device_at: new Date() }
      );
      this.logger.log(`Message ${messageId} marked as delivered for user ${chatRoomUserId}`);
    } catch (error) {
      this.logger.error(`Failed to mark message ${messageId} as delivered: ${error.message}`);
      throw error;
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
          seen_at: now
        }
      );
      this.logger.log(`Message ${messageId} marked as seen for user ${chatRoomUserId}`);
    } catch (error) {
      this.logger.error(`Failed to mark message ${messageId} as seen: ${error.message}`);
      throw error;
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
          read_receipt_at: now
        }
      );
      this.logger.log(`Message ${messageId} marked as read for user ${chatRoomUserId}`);
    } catch (error) {
      this.logger.error(`Failed to mark message ${messageId} as read: ${error.message}`);
      throw error;
    }
  }

  async getUndeliveredMessages(chatRoomUserId: number): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findUndeliveredMessages(chatRoomUserId);
    } catch (error) {
      this.logger.error(`Failed to get undelivered messages: ${error.message}`);
      throw error;
    }
  }

  async getUnseenMessages(chatRoomUserId: number): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findUnseenMessages(chatRoomUserId);
    } catch (error) {
      this.logger.error(`Failed to get unseen messages: ${error.message}`);
      throw error;
    }
  }

  async getPendingReadReceipts(chatRoomUserId: number): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findPendingReadReceipts(chatRoomUserId);
    } catch (error) {
      this.logger.error(`Failed to get pending read receipts: ${error.message}`);
      throw error;
    }
  }

  async getMessageStatus(messageId: number): Promise<MessageDeliveryStatus[]> {
    try {
      return await this.statusRepository.findMessageStatus(messageId);
    } catch (error) {
      this.logger.error(`Failed to get message status: ${error.message}`);
      throw error;
    }
  }
}