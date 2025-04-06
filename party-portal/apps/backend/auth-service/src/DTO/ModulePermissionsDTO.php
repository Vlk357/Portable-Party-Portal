<?php

declare(strict_types=1);

namespace App\DTO;

use App\Entity\Role;
use App\Entity\Ability;
use App\Entity\User;

class ModulePermissionsDTO implements \JsonSerializable
{
    /** @var array<int, RoleForServicesDTO> */
    private array $roles;

    /** @var array<int, AbilityForServicesDTO> */
    private array $abilities;

    /** @var array<int, UserForServicesDTO> */
    private array $users;

    /**
     * @param array<Role> $roles Array of Role entities
     * @param array<Ability> $abilities Array of Ability entities
     * @param array<User> $users Array of User entities
     */
    public function __construct(array $roles, array $abilities, array $users)
    {
        /** @var array<int, RoleForServicesDTO> $roleDtos */
        $roleDtos = [];
        foreach ($roles as $role) {
            $roleDtos[] = new RoleForServicesDTO($role);
        }
        $this->roles = $roleDtos;

        /** @var array<int, AbilityForServicesDTO> $abilityDtos */
        $abilityDtos = [];
        foreach ($abilities as $ability) {
            $abilityDtos[] = new AbilityForServicesDTO($ability);
        }
        $this->abilities = $abilityDtos;

        /** @var array<int, UserForServicesDTO> $userDtos */
        $userDtos = [];
        foreach ($users as $user) {
            $userDtos[] = new UserForServicesDTO($user);
        }
        $this->users = $userDtos;
    }

    /**
     * @return array<string, array<int, RoleForServicesDTO|AbilityForServicesDTO|UserForServicesDTO>>
     */
    public function jsonSerialize(): array
    {
        return [
            'roles' => $this->roles,
            'abilities' => $this->abilities,
            'users' => $this->users
        ];
    }
}
