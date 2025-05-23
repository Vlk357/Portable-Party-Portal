import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Check,
  JoinColumn,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';

@Entity()
@Check('deleted_at IS NULL OR deleted_by_user_id IS NOT NULL')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  chat_room_id: number;

  @Column('text')
  content: string;

  @Column({ type: 'timestamp' })
  created_at: Date;

  @CreateDateColumn({ name: 'server_received' })
  server_received: Date;

  @Column({ nullable: true, type: 'timestamp' })
  deleted_at: Date | null;

  @Column({ nullable: true, type: 'int' }) // Add explicit type here
  deleted_by_user_id: number | null;

  @ManyToOne(() => ChatRoom)
  @JoinColumn({ name: 'chat_room_id' })
  chat_room: ChatRoom;
}
