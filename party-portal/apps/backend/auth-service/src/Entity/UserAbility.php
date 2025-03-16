<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'user_abilities')]
class UserAbility
{
    #[ORM\Id]
    #[ORM\ManyToOne(targetEntity: User::class, inversedBy: 'userAbilities')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    private User $user;

    #[ORM\Id]
    #[ORM\ManyToOne(targetEntity: Ability::class, inversedBy: 'userAbilities')]
    #[ORM\JoinColumn(name: 'ability_id', referencedColumnName: 'id')]
    private Ability $ability;

    #[ORM\Column(name: 'resource_instance_id', type: 'integer', nullable: true)]
    private ?int $resourceInstanceId = null;

    #[ORM\Column(name: 'expires_at', type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $expiresAt = null;

    public function __construct(
        User $user,
        Ability $ability,
        ?int $resourceInstanceId = null,
        ?\DateTimeInterface $expiresAt = null
    ) {
        $this->user = $user;
        $this->ability = $ability;
        $this->resourceInstanceId = $resourceInstanceId;
        $this->expiresAt = $expiresAt;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getAbility(): Ability
    {
        return $this->ability;
    }

    public function getResourceInstanceId(): ?int
    {
        return $this->resourceInstanceId;
    }

    public function setResourceInstanceId(?int $resourceInstanceId): self
    {
        $this->resourceInstanceId = $resourceInstanceId;
        return $this;
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