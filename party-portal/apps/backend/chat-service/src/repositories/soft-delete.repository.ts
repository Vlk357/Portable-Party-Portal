import { ObjectLiteral, Repository, IsNull } from 'typeorm';
import { BaseRepository } from './base.repository';

export abstract class SoftDeleteRepository<T extends ObjectLiteral> extends BaseRepository<T> {
  async softDelete(id: number): Promise<void> {
    await this.repository.update(id, {
      deleted_at: new Date()
    } as any);
  }

  async findAllActive(): Promise<T[]> {
    return this.repository.findBy({
      deleted_at: IsNull()
    } as any);
  }
}