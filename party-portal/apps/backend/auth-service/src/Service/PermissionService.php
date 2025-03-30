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
    ) {
    }

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
     * @return array<User>
     */
    public function getUsersByModule(string $module): array
    {
        return $this->userRepository->findUsersWithPermissionsByModule($module);
    }
}
