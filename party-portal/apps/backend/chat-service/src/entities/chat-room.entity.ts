import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { ChatRoomUserHistory } from './chat-room-user-history.entity';
import { Message } from './message.entity';

@Entity()
export class ChatRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true, type: 'timestamp' })
  deleted_at: Date | null;

  @Column({ nullable: true, type: 'int' })
  deleted_by_user_id: number | null;

  @OneToMany(() => ChatRoomUserHistory, (history) => history.chat_room)
  user_history: ChatRoomUserHistory[];

  @OneToMany(() => Message, (message) => message.chat_room)
  messages: Message[];
}
