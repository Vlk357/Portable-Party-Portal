import { Entity, Column, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import { Message } from './message.entity';
import { ChatRoomUserHistory } from './chat-room-user-history.entity';

@Entity()
export class MessageDeliveryStatus {
  @PrimaryColumn()
  message_id: number;

  @PrimaryColumn()
  chat_room_user_id: number;

  @Column({ nullable: true, type: 'timestamp' })
  delivered_to_device_at: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  seen_at: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  read_receipt_at: Date | null;

  @ManyToOne(() => Message, message => message.delivery_status)
  @JoinColumn({ name: 'message_id' })
  message: Message;

  @ManyToOne(() => ChatRoomUserHistory)
  @JoinColumn({ name: 'chat_room_user_id' })
  chat_room_user: ChatRoomUserHistory;
}