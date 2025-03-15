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

    /**
     * @return array<string>
     */
    public function getUserRoles(User $user): array
    {
        // Roles are already loaded by Doctrine if the fetch policy is EAGER
        // If LAZY, they'll be loaded when accessed
        return $user->getRoles();
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

    public function saveUser(User $user): void
    {
        $username = $user->getUsername();
        if ($username === null) {
            throw new \InvalidArgumentException('Username cannot be null');
        }

        // Check uniqueness before persist
        if ($this->findUserByUsername($username)) {
            throw new \RuntimeException('Username already exists');
        }

        $this->entityManager->persist($user);
        $this->entityManager->flush();
        // Entity is now managed by Doctrine, ID is automatically set
    }

    public function getAllAbilities(): array
    {
        return $this->entityManager->getRepository(Ability::class)->findAll();
    }
    
    public function findAbilityById(int $id): ?Ability
    {
        return $this->entityManager->getRepository(Ability::class)->find($id);
    }
    
    public function saveAbility(Ability $ability): Ability
    {
        $this->entityManager->persist($ability);
        $this->entityManager->flush();
        return $ability;
    }
    
    public function deleteAbility(Ability $ability): void
    {
        $this->entityManager->remove($ability);
        $this->entityManager->flush();
    }
    
    public function findAbilitiesByFilters(?string $module = null, ?string $resource = null, ?string $action = null): array
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
    
        return $qb->getQuery()->getResult();
    }
}
