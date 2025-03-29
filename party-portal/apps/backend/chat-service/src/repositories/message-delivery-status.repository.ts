import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageDeliveryStatus } from '../entities/message-delivery-status.entity';

@Injectable()
export class MessageDeliveryStatusRepository {
  constructor(
    @InjectRepository(MessageDeliveryStatus)
    private repository: Repository<MessageDeliveryStatus>
  ) {}

  async updateDeliveryStatus(
    messageId: number,
    chatRoomUserId: number,
    status: Partial<Pick<MessageDeliveryStatus, 'delivered_to_device_at' | 'seen_at' | 'read_receipt_at'>>
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(MessageDeliveryStatus)
      .values({
        message_id: messageId,
        chat_room_user_id: chatRoomUserId,
        ...status
      })
      .orUpdate(
        ['delivered_to_device_at', 'seen_at', 'read_receipt_at'],
        ['message_id', 'chat_room_user_id']
      )
      .execute();
  }

  async findMessageStatus(messageId: number): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.message_id = :messageId', { messageId })
      .leftJoinAndSelect('status.chat_room_user', 'user')
      .getMany();
  }

  async findUndeliveredMessages(chatRoomUserId: number): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.chat_room_user_id = :chatRoomUserId', { chatRoomUserId })
      .andWhere('status.delivered_to_device_at IS NULL')
      .leftJoinAndSelect('status.message', 'message')
      .leftJoinAndSelect('message.versions', 'version')
      .getMany();
  }

  async findUnseenMessages(chatRoomUserId: number): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.chat_room_user_id = :chatRoomUserId', { chatRoomUserId })
      .andWhere('status.seen_at IS NULL')
      .leftJoinAndSelect('status.message', 'message')
      .leftJoinAndSelect('message.versions', 'version')
      .getMany();
  }

  async findPendingReadReceipts(chatRoomUserId: number): Promise<MessageDeliveryStatus[]> {
    return this.repository
      .createQueryBuilder('status')
      .where('status.chat_room_user_id = :chatRoomUserId', { chatRoomUserId })
      .andWhere('status.read_receipt_at IS NULL')
      .innerJoin('status.message', 'message', 'message.requires_read_receipt = :required', { required: true })
      .leftJoinAndSelect('message.versions', 'version')
      .getMany();
  }
}