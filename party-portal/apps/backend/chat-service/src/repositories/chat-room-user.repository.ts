import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoomUser } from '../entities/chat-room-user.entity';

@Injectable()
export class ChatRoomUserRepository {
  constructor(
    @InjectRepository(ChatRoomUser)
    private repository: Repository<ChatRoomUser>,
  ) {}

  async create(data: Partial<ChatRoomUser>): Promise<ChatRoomUser> {
    const roomUser = this.repository.create(data);
    return this.repository.save(roomUser);
  }

  async delete(roomId: number, userId: number): Promise<void> {
    await this.repository.delete({
      chat_room_id: roomId,
      user_id: userId,
    });
  }

  async findUserInRoom(
    roomId: number,
    userId: number,
  ): Promise<ChatRoomUser | null> {
    return this.repository.findOne({
      where: {
        chat_room_id: roomId,
        user_id: userId,
      },
    });
  }

  async findUsersInRoom(roomId: number): Promise<ChatRoomUser[]> {
    return this.repository.find({
      where: { chat_room_id: roomId },
      order: { id: 'ASC' },
    });
  }

  async findRoomsForUser(userId: number): Promise<ChatRoomUser[]> {
    return this.repository.find({
      where: { user_id: userId },
      relations: ['chat_room'],
    });
  }

  async isUserInRoom(roomId: number, userId: number): Promise<boolean> {
    const count = await this.repository.count({
      where: {
        chat_room_id: roomId,
        user_id: userId,
      },
    });
    return count > 0;
  }
}
