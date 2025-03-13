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
}
