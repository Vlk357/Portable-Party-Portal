<?php

namespace App\Repository;

use App\Exception\EntityNotFoundException;
use App\Exception\PersistenceException;

/**
 * @template T of object
 */
interface RepositoryInterface
{
    /**
     * @param T $entity
     * @return T The persisted entity
     * @throws PersistenceException When entity cannot be saved
     */
    public function save(object $entity, bool $flush = true): object;

    /**
     * @param T $entity
     * @return T The deleted entity
     * @throws EntityNotFoundException When entity doesn't exist
     * @throws PersistenceException When entity cannot be deleted
     */
    public function delete(object $entity, bool $flush = true): object;

    /**
     * @param int $id
     * @return T
     * @throws EntityNotFoundException When entity doesn't exist
     */
    public function find(int $id): object;

    /**
     * @return T|null Returns null when entity doesn't exist
     */
    public function findOneOrNull(int $id): ?object;

    /**
     * @return array<T>
     */
    public function findAll(): array;

    /**
     * @param T $entity
     * @return T The updated entity
     * @throws EntityNotFoundException When entity doesn't exist
     * @throws PersistenceException When entity cannot be updated
     */
    public function update(object $entity, bool $flush = true): object;
}
