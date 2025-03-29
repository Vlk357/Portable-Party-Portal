import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoomUserHistory } from '../entities/chat-room-user-history.entity';

@Injectable()
export class ChatRoomUserHistoryRepository {
  constructor(
    @InjectRepository(ChatRoomUserHistory)
    private repository: Repository<ChatRoomUserHistory>,
  ) {}

  async create(
    data: Partial<ChatRoomUserHistory>,
  ): Promise<ChatRoomUserHistory> {
    const history = this.repository.create(data);
    return this.repository.save(history);
  }

  async update(id: number, data: Partial<ChatRoomUserHistory>): Promise<void> {
    await this.repository.update(id, data);
  }

  async findActiveUserInRoom(
    roomId: number,
    userId: number,
  ): Promise<ChatRoomUserHistory | null> {
    return this.repository
      .createQueryBuilder('history')
      .where('history.chat_room_id = :roomId', { roomId })
      .andWhere('history.user_id = :userId', { userId })
      .andWhere('history.left_at IS NULL')
      .getOne();
  }

  async findActiveUsersInRoom(roomId: number): Promise<ChatRoomUserHistory[]> {
    return this.repository
      .createQueryBuilder('history')
      .where('history.chat_room_id = :roomId', { roomId })
      .andWhere('history.left_at IS NULL')
      .orderBy('history.joined_at', 'ASC')
      .getMany();
  }
}
