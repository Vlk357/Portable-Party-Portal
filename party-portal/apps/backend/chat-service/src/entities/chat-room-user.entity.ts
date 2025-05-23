import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  JoinColumn,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';

@Entity()
@Unique(['chat_room_id', 'user_id'])
export class ChatRoomUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chat_room_id: number;

  @Column()
  user_id: number;

  @ManyToOne(() => ChatRoom, (chatRoom) => chatRoom.chat_room_users)
  @JoinColumn({ name: 'chat_room_id' })
  chat_room: ChatRoom;
}
