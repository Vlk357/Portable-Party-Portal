<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Ability;
use App\Entity\Role;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

class DatabaseService
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager
    ) {
    }

    public function findUserByUsername(string $username): ?User
    {
        return $this->entityManager->getRepository(User::class)
            ->findOneBy(['username' => $username]);
    }

    public function findUserById(int $id): ?User
    {
        return $this->entityManager->getRepository(User::class)
            ->find($id);
    }

    public function findRoleByName(string $name): ?Role
    {
        return $this->entityManager->getRepository(Role::class)
            ->findOneBy(['name' => $name]);
    }

    /**
     * @return array<User>
     */
    public function getAllUsers(): array
    {
        return $this->entityManager->getRepository(User::class)
            ->findAll();
    }

    /**
     * Returns all abilities from database
     * 
     * @return Ability[]
     */
    public function getAllAbilities(): array
    {
        return $this->entityManager->getRepository(Ability::class)->findAll();
    }

    public function findAbilityById(int $id): ?Ability
    {
        return $this->entityManager->getRepository(Ability::class)->find($id);
    }

    public function createAbility(Ability $ability): Ability
    {
        if ($ability->getId() !== null) {
            throw new \InvalidArgumentException('Cannot create ability with existing ID');
        }

        $this->entityManager->persist($ability);
        $this->entityManager->flush();
        return $ability;
    }

    public function updateAbility(Ability $ability): Ability
    {
        if ($ability->getId() === null) {
            throw new \InvalidArgumentException('Cannot update ability without ID');
        }

        // Check if entity exists and is managed
        if (!$this->entityManager->contains($ability)) {
            throw new \InvalidArgumentException('Cannot update non-managed ability');
        }

        $this->entityManager->flush();
        return $ability;
    }
    public function deleteAbility(Ability $ability): void
    {
        $this->entityManager->remove($ability);
        $this->entityManager->flush();
    }

    /**
     * Returns all abilities with given filters from database
     * @param ?string $module
     * @param ?string $resource
     * @param ?string $action
     * @param ?string $constraint
     * 
     * @return array<Ability>
     */
    public function findAbilitiesByFilters(?string $module = null, ?string $resource = null, ?string $action = null, ?string $constraint = null): array
    {
        $qb = $this->entityManager->createQueryBuilder();
        $qb->select('a')
            ->from(Ability::class, 'a');

        if ($module) {
            $qb->andWhere('a.module = :module')
                ->setParameter('module', $module);
        }
        if ($resource) {
            $qb->andWhere('a.resource = :resource')
                ->setParameter('resource', $resource);
        }
        if ($action) {
            $qb->andWhere('a.action = :action')
                ->setParameter('action', $action);
        }

        if ($constraint) {
            $qb->andWhere('a.constraint = :constraint')
                ->setParameter('constraint', $constraint);
        }

        /** @var array<Ability> $result */
        $result = $qb->getQuery()->getResult();
        return $result;
    }
}
