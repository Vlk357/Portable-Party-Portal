import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChatRoomRepository } from '../repositories/chat-room.repository';
import { ChatRoom } from '../entities/chat-room.entity';
import { ChatRoomUserRepository } from '../repositories/chat-room-user.repository';
import { ServiceError } from 'src/errors/service.error';

@Injectable()
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);

  constructor(
    private readonly chatRoomRepository: ChatRoomRepository,
    private readonly chatRoomUserRepository: ChatRoomUserRepository,
  ) {}

  private handleError(operation: string, error: unknown): never {
    const serviceError =
      error instanceof Error
        ? new ServiceError(`Failed to ${operation}`, operation, error)
        : new ServiceError(`Failed to ${operation}: Unknown error`, operation);

    this.logger.error(serviceError.message, serviceError.cause?.stack);
    throw serviceError;
  }
  async createRoom(chatRoomData: {
    name: string;
    description?: string;
    createdByUserId: number;
  }): Promise<ChatRoom> {
    try {
      const room = await this.chatRoomRepository.create({
        name: chatRoomData.name,
        description: chatRoomData.description,
        created_by_user_id: chatRoomData.createdByUserId,
      });
      this.logger.log(`Created new chat room: ${room.id} - ${room.name}`);
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

  async addUserToRoom(roomId: number, userId: number): Promise<void> {
    const existing = await this.chatRoomUserRepository.findUserInRoom(
      roomId,
      userId,
    );
    if (!existing) {
      await this.chatRoomUserRepository.create({
        chat_room_id: roomId,
        user_id: userId,
      });
    }
  }

  async removeUserFromRoom(roomId: number, userId: number): Promise<void> {
    await this.chatRoomUserRepository.delete(roomId, userId);
  }

  async getUsersInRoom(roomId: number): Promise<number[]> {
    const roomUsers = await this.chatRoomUserRepository.findUsersInRoom(roomId);
    return roomUsers.map((u) => u.user_id);
  }

  async getRoomsForUser(userId: number): Promise<ChatRoom[]> {
    try {
      return await this.chatRoomRepository.findRoomsForUser(userId);
    } catch (error) {
      this.handleError('get rooms for user', error);
    }
  }

  async ensureGeneralChatExists(chatServiceId: number): Promise<number> {
    const GENERAL_CHAT_NAME = process.env.GENERAL_CHAT_NAME
      ? `${process.env.GENERAL_CHAT_NAME}`
      : 'General';

    try {
      // Find rooms created by the chat service
      const existingRooms =
        await this.chatRoomRepository.findUserCreatedRooms(chatServiceId);

      // Filter to find general chat(s)
      const generalChats = existingRooms.filter(
        (room) => room.created_by_user_id === chatServiceId,
      );

      if (generalChats.length === 0) {
        // Create general chat if it doesn't exist
        this.logger.log('Creating general chat room');

        const generalRoom = await this.createRoom({
          name: GENERAL_CHAT_NAME,
          description: 'Chat room for all users',
          createdByUserId: chatServiceId,
        });

        this.logger.log(`General chat room created with ID: ${generalRoom.id}`);
        return generalRoom.id;

        // Create permissions for this room would go here
        // This would be implemented in the PermissionClientService
      } else if (generalChats.length === 1) {
        // One general chat exists, which is the expected case
        this.logger.log(`General chat exists with ID: ${generalChats[0].id}`);
        return generalChats[0].id;
      } else {
        // Multiple general chats exist, which is an error state
        const ids = generalChats.map((room) => room.id).join(', ');
        this.logger.error(
          `Multiple general chat rooms detected with IDs: ${ids}`,
        );
        // Keep the system running, but notify admins
        // You could add a notification service here
      }
    } catch (error) {
      this.logger.error('Failed to ensure general chat exists', error);
      throw error;
    }
    throw Error('General chat existence was not ensured');
  }
}
