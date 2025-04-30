import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ChatRoom } from '../entities/chat-room.entity';
import { SoftDeleteRepository } from './soft-delete.repository';
@Injectable()
export class ChatRoomRepository extends SoftDeleteRepository<ChatRoom> {
  constructor(
    @InjectRepository(ChatRoom)
    private chatRoomRepository: Repository<ChatRoom>,
  ) {
    super(chatRoomRepository);
  }

  async findActiveRooms(): Promise<ChatRoom[]> {
    return this.chatRoomRepository.find({
      where: {
        deleted_at: IsNull(),
      },
      relations: ['chat_room_users'],
    });
  }

  async findRoomsForUser(userId: number): Promise<ChatRoom[]> {
    return this.repository
      .createQueryBuilder('room')
      .innerJoin('room.chat_room_users', 'chat_room_user')
      .where('chat_room_user.user_id = :userId', { userId })
      .andWhere('room.deleted_at IS NULL')
      .getMany();
  }

  async findUserCreatedRooms(userId: number): Promise<ChatRoom[]> {
    return this.repository
      .createQueryBuilder('room')
      .where('created_by_user_id = :userId', { userId })
      .andWhere('deleted_at IS NULL')
      .getMany();
  }
}
