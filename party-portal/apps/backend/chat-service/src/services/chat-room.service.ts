import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChatRoomRepository } from '../repositories/chat-room.repository';
import { ChatRoom } from '../entities/chat-room.entity';
import { ChatRoomUserHistory } from 'src/entities/chat-room-user-history.entity';
import { ChatRoomUserHistoryRepository } from '../repositories/chat-room-user-history.repository';
import { ServiceError } from 'src/errors/service.error';

@Injectable()
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);

  constructor(
    private readonly chatRoomRepository: ChatRoomRepository,
    private readonly userHistoryRepository: ChatRoomUserHistoryRepository,
  ) {}

  private handleError(operation: string, error: unknown): never {
    const serviceError =
      error instanceof Error
        ? new ServiceError(`Failed to ${operation}`, operation, error)
        : new ServiceError(`Failed to ${operation}: Unknown error`, operation);

    this.logger.error(serviceError.message, serviceError.cause?.stack);
    throw serviceError;
  }
  async createRoom(name: string): Promise<ChatRoom> {
    try {
      const room = await this.chatRoomRepository.create({ name });
      this.logger.log(`Created new chat room: ${room.id} - ${name}`);
      return room;
    } catch (error) {
      this.handleError('create chat room', error);
    }
  }

  async getActiveRooms(): Promise<ChatRoom[]> {
    try {
      return await this.chatRoomRepository.findActiveRooms();
    } catch (error) {
      this.handleError('get active rooms', error);
    }
  }

  async deleteRoom(id: number, userId: number): Promise<void> {
    try {
      const room = await this.chatRoomRepository.findById(id);

      if (!room || room.deleted_at) {
        throw new NotFoundException(`Chat room ${id} not found`);
      }
      await this.chatRoomRepository.update(id, {
        deleted_at: new Date(),
        deleted_by_user_id: userId,
      });

      this.logger.log(`Chat room ${id} deleted by user ${userId}`);
    } catch (error) {
      this.handleError('delete chat room', error);
    }
  }

  async joinRoom(
    roomId: number,
    userId: number,
    displayName: string,
  ): Promise<ChatRoomUserHistory> {
    try {
      const room = await this.chatRoomRepository.findById(roomId);
      if (!room) {
        throw new NotFoundException(`Chat room ${roomId} not found`);
      }

      // Check if user is already in room
      const activeHistory =
        await this.userHistoryRepository.findActiveUserInRoom(roomId, userId);

      if (activeHistory) {
        // Update display name if it changed
        if (activeHistory.display_name !== displayName) {
          await this.userHistoryRepository.update(activeHistory.id, {
            display_name: displayName,
          });
        }
        return activeHistory;
      }

      // Create new history entry
      const history = await this.userHistoryRepository.create({
        chat_room_id: roomId,
        user_id: userId,
        display_name: displayName,
        joined_at: new Date(),
      });

      this.logger.log(`User ${userId} joined room ${roomId}`);
      return history;
    } catch (error) {
      this.handleError('join chat room', error);
    }
  }

  async leaveRoom(roomId: number, userId: number): Promise<void> {
    try {
      const activeHistory =
        await this.userHistoryRepository.findActiveUserInRoom(roomId, userId);

      if (activeHistory) {
        await this.userHistoryRepository.update(activeHistory.id, {
          left_at: new Date(),
          left_by_user_id: userId,
        });
      }

      this.logger.log(`User ${userId} left room ${roomId}`);
    } catch (error) {
      this.handleError('leave chat room', error);
    }
  }

  async getActiveUsersInRoom(roomId: number): Promise<ChatRoomUserHistory[]> {
    try {
      return await this.userHistoryRepository.findActiveUsersInRoom(roomId);
    } catch (error) {
      this.handleError('get active users in room', error);
    }
  }

  async getRoomsForUser(userId: number): Promise<ChatRoom[]> {
    try {
      return await this.chatRoomRepository.findRoomsForUser(userId);
    } catch (error) {
      this.handleError('get rooms for user', error);
    }
  }
}
