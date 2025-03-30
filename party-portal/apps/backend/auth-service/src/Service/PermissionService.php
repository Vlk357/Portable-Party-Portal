<?php

namespace App\Service;

use App\Entity\Ability;
use App\Entity\Role;
use App\Entity\User;
use App\Repository\AbilityRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;

class PermissionService
{
    public function __construct(
        private readonly AbilityRepository $abilityRepository,
        private readonly RoleRepository $roleRepository,
        private readonly UserRepository $userRepository
    ) {}

    /**
     * @return array<Role>
     */
    public function getRolesByModule(string $module): array
    {
        return $this->roleRepository->findByModule($module);
    }

    /**
     * @return array<Ability>
     */
    public function getAbilitiesByModule(string $module): array
    {
        return $this->abilityRepository->findByModule($module);
    }

    /**
     * @return array<array{id: int, username: string, abilities: array<Ability>, roles: array<Role>}>
     */
    public function getUsersByModule(string $module): array
    {
        return $this->userRepository->findUsersWithPermissionsByModule($module);
    }

    public function addUserAbility(int $userId, Ability $ability): void
    {
        $user = $this->userRepository->find($userId);
        if (!$user) {
            throw new \InvalidArgumentException('User not found');
        }

        $user->addAbility($ability);
        $this->userRepository->save($user);
    }

    public function removeUserAbility(int $userId, int $abilityId): void
    {
        $user = $this->userRepository->find($userId);
        if (!$user) {
            throw new \InvalidArgumentException('User not found');
        }

        $ability = $this->abilityRepository->find($abilityId);
        if (!$ability) {
            throw new \InvalidArgumentException('Ability not found');
        }

        $user->removeAbility($ability);
        $this->userRepository->save($user);
    }
}