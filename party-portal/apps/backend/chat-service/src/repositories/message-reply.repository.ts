import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageReply } from '../entities/message-reply.entity';

@Injectable()
export class MessageReplyRepository {
  constructor(
    @InjectRepository(MessageReply)
    private repository: Repository<MessageReply>
  ) {}

  async create(data: Pick<MessageReply, 'replying_message_id' | 'referenced_message_id'>): Promise<MessageReply> {
    const reply = this.repository.create(data);
    return this.repository.save(reply);
  }

  async findRepliesForMessage(messageId: number): Promise<MessageReply[]> {
    return this.repository
      .createQueryBuilder('reply')
      .where('reply.replying_message_id = :messageId', { messageId })
      .leftJoinAndSelect('reply.referenced_message', 'referenced')
      .leftJoinAndSelect('referenced.versions', 'version')
      .getMany();
  }

  async findReferencesToMessage(messageId: number): Promise<MessageReply[]> {
    return this.repository
      .createQueryBuilder('reply')
      .where('reply.referenced_message_id = :messageId', { messageId })
      .leftJoinAndSelect('reply.replying_message', 'replying')
      .leftJoinAndSelect('replying.versions', 'version')
      .getMany();
  }
}