import { Injectable } from '@nestjs/common';
import { ChatRoomRepository } from '../repositories/chat-room.repository';
import { ChatRoom } from '../entities/chat-room.entity';

@Injectable()
export class ChatRoomService {
  constructor(private readonly chatRoomRepository: ChatRoomRepository) {}

  async createRoom(name: string): Promise<ChatRoom> {
    return this.chatRoomRepository.create({ name });
  }

  async getActiveRooms(): Promise<ChatRoom[]> {
    return this.chatRoomRepository.findActiveRooms();
  }

  async deleteRoom(id: number, userId: number): Promise<void> {
    await this.chatRoomRepository.update(id, {
      deleted_at: new Date(),
      deleted_by_user_id: userId,
    });
  }
}