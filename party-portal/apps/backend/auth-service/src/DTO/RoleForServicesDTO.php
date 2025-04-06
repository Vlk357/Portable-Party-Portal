<?php

declare(strict_types=1);

namespace App\DTO;

use App\Entity\Role;
use App\Entity\RoleAbility;
use Doctrine\Common\Collections\Collection;

class RoleForServicesDTO implements \JsonSerializable
{
    private int $id;
    private string $name;
    private ?string $description;
    private string $createdAt;

    /** @var array<int, AbilityForServicesDTO> */
    private array $abilities;

    public function __construct(Role $role)
    {
        $this->id = $role->getId() ?? 0;
        $this->name = $role->getName();
        $this->description = $role->getDescription();

        // Fix for createdAt handling
        $createdAt = $role->getCreatedAt();
        $this->createdAt = $createdAt->format('c');

        // Map abilities without circular references
        /** @var Collection<int, RoleAbility> $roleAbilities */
        $roleAbilities = $role->getRoleAbilities();

        /** @var array<int, AbilityForServicesDTO> $abilities */
        $abilities = [];
        foreach ($roleAbilities as $roleAbility) {
            $abilities[] = new AbilityForServicesDTO($roleAbility->getAbility());
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
            'name' => $this->name,
            'description' => $this->description,
            'created_at' => $this->createdAt,
            'abilities' => $this->abilities
        ];
    }
}
