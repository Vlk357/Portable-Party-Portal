import { ObjectLiteral, IsNull, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from './base.repository';
import { SoftDeletable } from '../interfaces/soft-deletable.interface';

export abstract class SoftDeleteRepository<
  T extends ObjectLiteral & SoftDeletable,
> extends BaseRepository<T> {
  constructor(repository: Repository<T>) {
    super(repository);
  }

  async softDelete(id: number): Promise<void> {
    await this.repository.update(
      { id } as FindOptionsWhere<T>,
      {
        deleted_at: new Date(),
      } as Partial<T>,
    );
  }

  async findAllActive(): Promise<T[]> {
    return this.repository.findBy({
      deleted_at: IsNull(),
    } as FindOptionsWhere<T>);
  }

  async restore(id: number): Promise<void> {
    await this.repository.update(
      { id } as FindOptionsWhere<T>,
      {
        deleted_at: null,
      } as Partial<T>,
    );
  }

  protected async findOneActiveByOrFail(
    where: FindOptionsWhere<T>,
  ): Promise<T> {
    const entity = await this.repository.findOne({
      where: {
        ...where,
        deleted_at: IsNull(),
      } as FindOptionsWhere<T>,
    });

    if (!entity) {
      throw this.createEntityNotFoundError();
    }

    return entity;
  }

  private createEntityNotFoundError(): Error {
    return new Error(`${this.repository.metadata.name} not found`);
  }
}
