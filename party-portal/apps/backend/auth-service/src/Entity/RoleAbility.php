<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'role_abilities')]
class RoleAbility
{
    #[ORM\Id]
    #[ORM\ManyToOne(targetEntity: Role::class, inversedBy: 'roleAbilities')]
    #[ORM\JoinColumn(name: 'role_id', referencedColumnName: 'id')]
    private Role $role;

    #[ORM\Id]
    #[ORM\ManyToOne(targetEntity: Ability::class, inversedBy: 'roleAbilities')]
    #[ORM\JoinColumn(name: 'ability_id', referencedColumnName: 'id')]
    private Ability $ability;

    #[ORM\Column(name: 'expires_at', type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $expiresAt;

    public function __construct(
        Role $role,
        Ability $ability,
        ?\DateTimeInterface $expiresAt = null
    ) {
        $this->role = $role;
        $this->ability = $ability;
        $this->expiresAt = $expiresAt;
    }

    public function getRole(): Role
    {
        return $this->role;
    }

    public function getAbility(): Ability
    {
        return $this->ability;
    }

    public function getExpiresAt(): ?\DateTimeInterface
    {
        return $this->expiresAt;
    }

    public function setExpiresAt(?\DateTimeInterface $expiresAt): self
    {
        $this->expiresAt = $expiresAt;
        return $this;
    }
}
