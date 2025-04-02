import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  Unique,
  Check,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { Message } from './message.entity';

@Entity()
@Unique(['chat_room_id', 'user_id', 'joined_at'])
@Check('left_at IS NULL OR left_by_user_id IS NOT NULL')
export class ChatRoomUserHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chat_room_id: number;

  @Column()
  user_id: number;

  @CreateDateColumn()
  joined_at: Date;

  @Column({ length: 255 })
  display_name: string;

  @Column({ nullable: true, type: 'timestamp' })
  left_at: Date | null;

  @Column({ nullable: true, type: 'int' })
  left_by_user_id: number | null;

  @ManyToOne(() => ChatRoom, (chatRoom) => chatRoom.user_history)
  chat_room: ChatRoom;

  @OneToMany(() => Message, (message) => message.chat_room_user)
  messages: Message[];
}
