<?php

declare(strict_types=1);

namespace App\DTO;

use App\Entity\User;
use App\Entity\UserRole;
use App\Entity\UserAbility;
use Doctrine\Common\Collections\Collection;

class UserForServicesDTO implements \JsonSerializable
{
    private int $id;
    // private string $username;
    // private string $status;
    // private string $createdAt;

    /** @var array<int, array<string, mixed>> */
    private array $roles;

    /** @var array<int, array<string, mixed>> */
    private array $abilities;

    public function __construct(User $user)
    {
        $this->id = $user->getId() ?? 0;
        // $this->username = $user->getUsername();
        // $this->status = $user->getStatus()->value;

        // $createdAt = $user->getCreatedAt();
        // $this->createdAt = $createdAt->format('c');

        // Simplified role information
        /** @var Collection<int, UserRole> $userRoles */
        $userRoles = $user->getUserRoles();

        /** @var array<int, array<string, mixed>> $roles */
        $roles = [];
        foreach ($userRoles as $userRole) {
            $role = $userRole->getRole();
            $roles[] = [
                'id' => $role->getId(),
                // 'name' => $role->getName(),
            ];
        }
        $this->roles = $roles;

        // Simplified ability information
        /** @var Collection<int, UserAbility> $userAbilities */
        $userAbilities = $user->getUserAbilities();

        /** @var array<int, array<string, mixed>> $abilities */
        $abilities = [];
        foreach ($userAbilities as $userAbility) {
            $ability = $userAbility->getAbility();
            $abilities[] = [
                'id' => $ability->getId(),
                // 'module' => $ability->getModule()->value,
                // 'resource' => $ability->getResource(),
                // 'action' => $ability->getAction()->value,
            ];
        }
        $this->abilities = $abilities;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            // 'username' => $this->username,
            // 'status' => $this->status,
            // 'created_at' => $this->createdAt,
            'roles' => $this->roles,
            'abilities' => $this->abilities
        ];
    }
}
