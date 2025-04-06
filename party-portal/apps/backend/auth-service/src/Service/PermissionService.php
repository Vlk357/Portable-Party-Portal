<?php

namespace App\Service;

use App\Entity\Ability;
use App\Entity\Role;
use App\Entity\User;
use App\Repository\AbilityRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use Doctrine\Common\Collections\Collection;
use Exception;

class PermissionService
{
    public function __construct(
        private readonly AbilityRepository $abilityRepository,
        private readonly RoleRepository $roleRepository,
        private readonly UserRepository $userRepository
    ) {
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

    /**
     * Get roles that have any of the provided abilities
     *
     * @param array<int> $abilityIds
     * @return array<Role>
     */
    public function getRolesByAbilities(array $abilityIds): array
    {

        // Use the RoleRepository to find roles with these abilities
        return $this->roleRepository->findRolesWithAbilities($abilityIds);
    }

    /**
     * Gets users that have any of abilities or roles by ids given filtered to only those roles and abilities
     *
     * @param array<int> $abilitiesIds
     * @param array<int> $roleIds
     * @return User[]
     */
    public function getUsersByAbilitiesAndRoles(array $abilitiesIds, array $roleIds): array
    {

        return $this->userRepository->findUsersWithAbilitiesAndRoles($abilitiesIds, $roleIds);
    }
}
