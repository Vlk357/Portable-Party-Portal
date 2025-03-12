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

    public function getAllUsers(): array
    {
        return $this->entityManager->getRepository(User::class)
            ->findAll();
    }

    public function saveUser(User $user): void
    {
        // Check uniqueness before persist
        if ($this->findUserByUsername($user->getUsername())) {
            throw new \RuntimeException('Username already exists');
        }

        $this->entityManager->persist($user);
        $this->entityManager->flush();
        // Entity is now managed by Doctrine, ID is automatically set
    }
}
