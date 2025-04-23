import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  Check,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';

@Entity()
@Unique(['chat_room_id', 'user_id', 'joined_at'])
@Check('left_at IS NULL OR left_by_user_id IS NOT NULL')
export class ChatRoomUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chat_room_id: number;

  @Column()
  user_id: number;

  @ManyToOne(() => ChatRoom, (chatRoom) => chatRoom.chat_room_users)
  chat_room: ChatRoom;
}
