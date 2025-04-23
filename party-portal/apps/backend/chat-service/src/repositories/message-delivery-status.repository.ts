import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageDeliveryStatus } from '../entities/message-delivery-status.entity';

@Injectable()
export class MessageDeliveryStatusRepository {
  constructor(
    @InjectRepository(MessageDeliveryStatus)
    private repository: Repository<MessageDeliveryStatus>,
  ) {}

  async create(
    data: Pick<MessageDeliveryStatus, 'message_id' | 'chat_room_user_id'>,
  ): Promise<MessageDeliveryStatus> {
    const status = this.repository.create(data);
    return this.repository.save(status);
  }

  /**
   * Ensures a status record exists (creates if not)
   */
  private async ensureStatusExists(
    messageId: number,
    userId: number,
  ): Promise<MessageDeliveryStatus> {
    // Try to find existing record
    let status = await this.repository.findOne({
      where: {
        message_id: messageId,
        chat_room_user_id: userId,
      },
    });

    // Create if it doesn't exist
    if (!status) {
      status = await this.create({
        message_id: messageId,
        chat_room_user_id: userId,
      });
    }

    return status;
  }

  /**
   * Mark a message as delivered to device
   * Only sets timestamp if not already set
   */
  async markAsDelivered(messageId: number, userId: number): Promise<void> {
    const status = await this.ensureStatusExists(messageId, userId);

    // Only update if not already delivered
    if (!status.delivered_to_device_at) {
      await this.repository.update(
        { message_id: messageId, chat_room_user_id: userId },
        { delivered_to_device_at: new Date() },
      );
    }
  }

  /**
   * Mark a message as seen
   * Only sets timestamp if not already set
   * Ensures delivered status is also set
   */
  async markAsSeen(messageId: number, userId: number): Promise<void> {
    const status = await this.ensureStatusExists(messageId, userId);

    const updates: Partial<MessageDeliveryStatus> = {};
    const now = new Date();

    // Ensure delivered timestamp exists
    if (!status.delivered_to_device_at) {
      updates.delivered_to_device_at = now;
    }

    // Only update seen if not already set
    if (!status.seen_at) {
      updates.seen_at = now;
    }

    // Only update if changes needed
    if (Object.keys(updates).length > 0) {
      await this.repository.update(
        { message_id: messageId, chat_room_user_id: userId },
        updates,
      );
    }
  }

  /**
   * Mark a message as read (send read receipt)
   * Only sets timestamp if not already set
   * Ensures delivered and seen statuses are also set
   */
  async markAsRead(messageId: number, userId: number): Promise<void> {
    const status = await this.ensureStatusExists(messageId, userId);

    const updates: Partial<MessageDeliveryStatus> = {};
    const now = new Date();

    // Ensure delivered timestamp exists
    if (!status.delivered_to_device_at) {
      updates.delivered_to_device_at = now;
    }

    // Ensure seen timestamp exists
    if (!status.seen_at) {
      updates.seen_at = now;
    }

    // Only update read receipt if not already set
    if (!status.read_receipt_at) {
      updates.read_receipt_at = now;
    }

    // Only update if changes needed
    if (Object.keys(updates).length > 0) {
      await this.repository.update(
        { message_id: messageId, chat_room_user_id: userId },
        updates,
      );
    }
  }

  async findMessageStatus(messageId: number): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.message_id = :messageId', { messageId })
      .leftJoinAndSelect('status.chat_room_user', 'user')
      .getMany();
  }

  async findUndeliveredMessages(
    chatRoomUserId: number,
  ): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.chat_room_user_id = :chatRoomUserId', { chatRoomUserId })
      .andWhere('status.delivered_to_device_at IS NULL')
      .leftJoinAndSelect('status.message', 'message')
      .leftJoinAndSelect('message.versions', 'version')
      .getMany();
  }

  async findUnseenMessages(
    chatRoomUserId: number,
  ): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.chat_room_user_id = :chatRoomUserId', { chatRoomUserId })
      .andWhere('status.seen_at IS NULL')
      .leftJoinAndSelect('status.message', 'message')
      .leftJoinAndSelect('message.versions', 'version')
      .getMany();
  }

  async findPendingReadReceipts(
    chatRoomUserId: number,
  ): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.chat_room_user_id = :chatRoomUserId', { chatRoomUserId })
      .andWhere('status.read_receipt_at IS NULL')
      .innerJoin(
        'status.message',
        'message',
        'message.requires_read_receipt = :required',
        { required: true },
      )
      .leftJoinAndSelect('message.versions', 'version')
      .getMany();
  }
}
