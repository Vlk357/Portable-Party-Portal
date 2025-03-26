import { Entity, Column, ManyToOne, CreateDateColumn, PrimaryColumn } from 'typeorm';
import { Message } from './message.entity';

@Entity()
export class MessageVersion {
  @PrimaryColumn()
  message_id: number;

  @PrimaryColumn()
  version: number;

  @Column('text')
  content: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp' })
  delivered_at: Date;

  @ManyToOne(() => Message, (message) => message.versions)
  message: Message;
}