import { Injectable, Logger } from '@nestjs/common';
import { ChatRoomRepository } from '../repositories/chat-room.repository';
import { ChatRoom } from '../entities/chat-room.entity';

@Injectable()
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);

  constructor(private readonly chatRoomRepository: ChatRoomRepository) {}

  async createRoom(name: string): Promise<ChatRoom> {
    try {
      const room = await this.chatRoomRepository.create({ name });
      this.logger.log(`Created new chat room: ${room.id} - ${name}`);
      return room;
    } catch (error) {
      this.logger.error(
        `Failed to create chat room: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getActiveRooms(): Promise<ChatRoom[]> {
    try {
      return await this.chatRoomRepository.findActiveRooms();
    } catch (error) {
      this.logger.error('Failed to fetch active rooms', error.stack);
      throw error;
    }
  }

  async deleteRoom(id: number, userId: number): Promise<void> {
    try {
      const room = await this.chatRoomRepository.findById(id);

      await this.chatRoomRepository.update(id, {
        deleted_at: new Date(),
        deleted_by_user_id: userId,
      });

      this.logger.log(`Chat room ${id} deleted by user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete chat room ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
