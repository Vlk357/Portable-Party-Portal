import { Entity, Column, ManyToOne, CreateDateColumn, PrimaryColumn, JoinColumn } from 'typeorm';
import { Message } from './message.entity';

@Entity()
export class MessageVersion {
  @PrimaryColumn()
  message_id: number;

  @PrimaryColumn()
  version: number;

  @Column('text')
  content: string;

  @Column({ type: 'timestamp' })
  created_at: Date;
  
  @CreateDateColumn()
  server_received: Date;

  @ManyToOne(() => Message, (message) => message.versions)
  @JoinColumn({ name: 'message_id', referencedColumnName: 'id' })
  message: Message;
}