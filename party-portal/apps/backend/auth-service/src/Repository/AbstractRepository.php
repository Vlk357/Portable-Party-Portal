<?php

namespace App\Repository;

use App\Exception\EntityNotFoundException;
use App\Exception\PersistenceException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * @template T of \App\Entity\EntityInterface
 * @implements RepositoryInterface<T>
 */
abstract class AbstractRepository implements RepositoryInterface
{
    protected EntityManagerInterface $entityManager;

    /** @var class-string<T> */
    protected string $entityClass;

    /**
     * @param EntityManagerInterface $entityManager
     * @param class-string<T> $entityClass
     */
    public function __construct(EntityManagerInterface $entityManager, string $entityClass)
    {
        $this->entityManager = $entityManager;
        $this->entityClass = $entityClass;
    }

    /**
     * @param T $entity
     * @return T
     * @throws PersistenceException
     */
    public function save(object $entity, bool $flush = true): object
    {
        try {
            $this->entityManager->persist($entity);
            if ($flush) {
                $this->entityManager->flush();
            }
            return $entity;
        } catch (\Throwable $e) {
            throw PersistenceException::createSaveError($this->entityClass, $e);
        }
    }
    /**
     * @param T $entity
     * @return T
     * @throws EntityNotFoundException
     * @throws PersistenceException
     */
    public function delete(object $entity, bool $flush = true): object
    {
        try {
            if (!$this->entityManager->contains($entity)) {
                throw EntityNotFoundException::create($this->entityClass, $entity->getId());
            }

            $deletedEntity = clone $entity;
            $this->entityManager->remove($entity);

            if ($flush) {
                $this->entityManager->flush();
            }

            return $deletedEntity;
        } catch (EntityNotFoundException $e) {
            throw $e;
        } catch (\Throwable $e) {
            throw PersistenceException::createDeleteError($this->entityClass, $e);
        }
    }

    /**
     * @return T
     * @throws EntityNotFoundException
     */
    public function find(int $id): object
    {
        $entity = $this->entityManager->find($this->entityClass, $id);
        if ($entity === null) {
            throw EntityNotFoundException::create($this->entityClass, $id);
        }
        return $entity;
    }

    /**
     * @return T|null
     */
    public function findOneOrNull(int $id): object|null
    {
        return $this->entityManager->find($this->entityClass, $id);
    }

    /**
     * @return array<T>
     */
    public function findAll(): array
    {
        return $this->entityManager->getRepository($this->entityClass)->findAll();
    }

    /**
     * @param T $entity
     * @return T
     * @throws EntityNotFoundException
     * @throws PersistenceException
     */
    public function update(object $entity, bool $flush = true): object
    {
        try {
            if (!$this->entityManager->contains($entity)) {
                // Find existing entity to ensure it exists
                $existingEntity = $this->entityManager->find($this->entityClass, $entity->getId());
                if ($existingEntity === null) {
                    throw EntityNotFoundException::create($this->entityClass, $entity->getId());
                }

                // Update existing entity with new values
                $this->entityManager->getUnitOfWork()->recomputeSingleEntityChangeSet(
                    $this->entityManager->getClassMetadata($this->entityClass),
                    $entity
                );
            }

            if ($flush) {
                $this->entityManager->flush();
            }

            return $entity;
        } catch (EntityNotFoundException $e) {
            throw $e;
        } catch (\Throwable $e) {
            throw PersistenceException::createUpdateError($this->entityClass, $e);
        }
    }
}
