import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ChatRoom } from '../entities/chat-room.entity';
import { SoftDeleteRepository } from './soft-delete.repository';
import { BaseRepository } from './base.repository';

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
      relations: ['user_history'],
    });
  }
}
