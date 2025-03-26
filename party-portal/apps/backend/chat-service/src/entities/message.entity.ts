import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, Check } from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomUserHistory } from './chat-room-user-history.entity';
import { MessageVersion } from './message-version.entity';
import { MessageReply } from './message-reply.entity';

@Entity()
@Check('thread_parent_id IS NULL OR show_in_main IS NOT NULL')
@Check('deleted_at IS NULL OR deleted_by_user_id IS NOT NULL')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chat_room_user_id: number;

  @Column()
  chat_room_id: number;

  @Column({ nullable: true })
  thread_parent_id: number | null;

  @Column({ nullable: true })
  show_in_main: boolean | null;

  @Column({ nullable: true, type: 'timestamp' })
  deleted_at: Date | null;

  @Column({ nullable: true })
  deleted_by_user_id: number | null;

  @ManyToOne(() => ChatRoom, (chatRoom) => chatRoom.messages)
  chat_room: ChatRoom;

  @ManyToOne(() => ChatRoomUserHistory, (user) => user.messages)
  chat_room_user: ChatRoomUserHistory;

  @OneToMany(() => MessageVersion, (version) => version.message)
  versions: MessageVersion[];

  @OneToMany(() => MessageReply, (reply) => reply.replying_message)
  replies_sent: MessageReply[];

  @OneToMany(() => MessageReply, (reply) => reply.referenced_message)
  replies_received: MessageReply[];
}