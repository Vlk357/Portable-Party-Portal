import { Entity, PrimaryColumn, ManyToOne } from 'typeorm';
import { Message } from './message.entity';

@Entity()
export class MessageReply {
  @PrimaryColumn()
  replying_message_id: number;

  @PrimaryColumn()
  referenced_message_id: number;

  @ManyToOne(() => Message, (message) => message.replies_sent)
  replying_message: Message;

  @ManyToOne(() => Message, (message) => message.replies_received)
  referenced_message: Message;
}