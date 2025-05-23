import {
  Repository,
  ObjectLiteral,
  FindOptionsWhere,
  DeepPartial,
} from 'typeorm';

export abstract class CompositeKeyRepository<T extends ObjectLiteral> {
  constructor(protected readonly repository: Repository<T>) {}

  abstract getKeyCondition(entity: Partial<T>): FindOptionsWhere<T>;

  async find(condition: FindOptionsWhere<T>): Promise<T[]> {
    return this.repository.findBy(condition);
  }

  async create(entity: DeepPartial<T>): Promise<T> {
    const newEntity = this.repository.create(entity);
    return this.repository.save(newEntity);
  }

  async update(
    condition: FindOptionsWhere<T>,
    entity: DeepPartial<T>,
  ): Promise<void> {
    await this.repository.update(condition, entity as any);
  }
}
