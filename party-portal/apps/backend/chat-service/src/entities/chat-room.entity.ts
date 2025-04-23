import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { ChatRoomUser } from './chat-room-user.entity';
import { Message } from './message.entity';

@Entity()
export class ChatRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: false, type: 'int' })
  created_by_user_id: number;

  @Column({ nullable: true, type: 'timestamp' })
  deleted_at: Date | null;

  @Column({ nullable: true, type: 'int' })
  deleted_by_user_id: number | null;

  @OneToMany(() => ChatRoomUser, (history) => history.chat_room)
  chat_room_users: ChatRoomUser[];

  @OneToMany(() => Message, (message) => message.chat_room)
  messages: Message[];
}
