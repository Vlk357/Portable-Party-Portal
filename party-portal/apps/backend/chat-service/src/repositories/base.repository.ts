import { Repository, FindOptionsWhere, ObjectLiteral, DeepPartial } from 'typeorm';

export abstract class BaseRepository<T extends ObjectLiteral> {
  constructor(protected readonly repository: Repository<T>) {}

  async findById(id: number): Promise<T | null> {
    return this.repository.findOneBy({ 
      id: id as any 
    } as FindOptionsWhere<T>);
  }

  async findAll(): Promise<T[]> {
    return this.repository.find();
  }

  async create(entity: DeepPartial<T>): Promise<T> {
    const newEntity = this.repository.create(entity);
    return this.repository.save(newEntity);
  }

  async update(id: number, entity: DeepPartial<T>): Promise<T | null> {
    await this.repository.update(id, entity as any);
    return this.findById(id);
  }
}