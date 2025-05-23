import {
  Repository,
  ObjectLiteral,
  FindOptionsWhere,
  DeepPartial,
} from 'typeorm';
import { RepositoryError } from '../errors/repository.error';
import { HasId } from '../interfaces/has-id.interface';

export abstract class BaseRepository<T extends ObjectLiteral & HasId> {
  constructor(protected readonly repository: Repository<T>) {}

  protected async findOneByOrFail(where: FindOptionsWhere<T>): Promise<T> {
    try {
      const result = await this.repository.findOneBy(where);
      if (!result) {
        throw new RepositoryError('find', this.repository.metadata.name);
      }
      return result;
    } catch (error) {
      throw new RepositoryError(
        'find',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async create(data: DeepPartial<T>): Promise<T> {
    try {
      const entity = this.repository.create(data);
      return await this.repository.save(entity);
    } catch (error) {
      throw new RepositoryError(
        'create',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async update(id: number, data: DeepPartial<T>): Promise<void> {
    try {
      await this.repository.update(id, data);
    } catch (error) {
      throw new RepositoryError(
        'update',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an entity and return the updated entity
   */
  async updateAndReturn(id: number, data: DeepPartial<T>): Promise<T> {
    try {
      await this.repository.update(id, data);
      const updated = await this.findById(id);

      if (!updated) {
        throw new RepositoryError(
          'update and return',
          this.repository.metadata.name,
          new Error(`Entity with id ${id} not found after update`),
        );
      }

      return updated;
    } catch (error) {
      throw new RepositoryError(
        'update and return',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findById(id: number): Promise<T | null> {
    try {
      return await this.repository.findOneBy({ id } as FindOptionsWhere<T>);
    } catch (error) {
      throw new RepositoryError(
        'find by id',
        this.repository.metadata.name,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
