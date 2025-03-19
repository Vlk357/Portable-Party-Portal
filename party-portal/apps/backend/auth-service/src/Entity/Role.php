<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'roles')]
class Role implements \JsonSerializable, EntityInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(length: 100, unique: true)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(
        name: 'created_at',
        type: 'datetime_immutable',
        insertable: false,
        updatable: false,
        options: ['default' => 'CURRENT_TIMESTAMP']
    )]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, UserRole> */
    #[ORM\OneToMany(targetEntity: UserRole::class, mappedBy: 'role', cascade: ['persist', 'remove'])]
    private Collection $userRoles;

    /** @var Collection<int, RoleAbility> */
    #[ORM\OneToMany(targetEntity: RoleAbility::class, mappedBy: 'role', cascade: ['persist', 'remove'])]
    private Collection $roleAbilities;

    /**
     * @param array<User> $users
     * @param array<Ability> $abilities
     */
    public function __construct(
        string $name,
        ?string $description = null,
        array $users = [],
        array $abilities = []
    ) {
        $this->name = $name;
        $this->description = $description;
        $this->userRoles = new ArrayCollection();
        foreach ($users as $user) {
            $this->addUser($user);
        }
        $this->roleAbilities = new ArrayCollection();
        foreach ($abilities as $ability) {
            $this->addAbility($ability);
        }
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(int $id): self
    {
        $this->id = $id;

        return $this;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;

        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): self
    {
        $this->description = $description;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;

        return $this;
    }

    /** @return array<User> */
    public function getUsers(): array
    {
        return $this->userRoles->map(fn(UserRole $userRole) => $userRole->getUser())->toArray();
    }

    public function addUser(User $user): self
    {
        if (!$this->hasUser($user)) {
            $userRole = new UserRole($user, $this);
            $this->userRoles->add($userRole);
        }
        return $this;
    }

    public function removeUser(User $user): self
    {
        if ($this->hasUser($user)) {
            $userRole = $this->userRoles->filter(fn(UserRole $userRole) => $userRole->getUser() === $user)->first();
            if ($userRole) {
                $this->userRoles->removeElement($userRole);
            }
        }
        return $this;
    }

    public function hasUser(User $user): bool
    {
        return $this->userRoles->exists(fn(int $key, UserRole $userRole) => $userRole->getUser() === $user);
    }

    public function addAbility(Ability $ability): self
    {
        if (!$this->hasAbility($ability)) {
            $roleAbility = new RoleAbility($this, $ability);
            $this->roleAbilities->add($roleAbility);
        }
        return $this;
    }

    public function removeAbility(Ability $ability): self
    {
        $roleAbility = $this->roleAbilities->filter(
            fn(RoleAbility $roleAbility) => $roleAbility->getAbility() === $ability
        )->first();
        if ($roleAbility) {
            $this->roleAbilities->removeElement($roleAbility);
        }
        return $this;
    }

    /** @return array<Ability> */
    public function getAbilities(): array
    {
        return $this->roleAbilities
            ->map(fn(RoleAbility $roleAbility) => $roleAbility->getAbility())
            ->toArray();
    }

    public function hasAbility(Ability $ability): bool
    {
        return $this->roleAbilities
            ->exists(fn(int $index, RoleAbility $roleAbility) => $roleAbility->getAbility() === $ability);
    }

    public function __toString(): string
    {
        return $this->name ?? '';
    }

    /** @return array{0: int|null, 1: string|null, 2: string|null, 3: \DateTimeImmutable} */
    public function __serialize(): array
    {
        return [
            $this->id,
            $this->name,
            $this->description,
            $this->createdAt,
        ];
    }

    /** @param array{0: int|null, 1: string, 2: string|null, 3: \DateTimeImmutable} $data */
    public function __unserialize(array $data): void
    {
        [
            $this->id,
            $this->name,
            $this->description,
            $this->createdAt,
        ] = $data;
    }

    public function jsonSerialize(): mixed
    {
        return [
            'id' => $this->getId(),
            'name' => $this->getName(),
            'description' => $this->getDescription(),
            'created_at' => $this->getCreatedAt()->format(\DateTime::ATOM),
            'users' => $this->getUsers(),
            'abilities' => array_map(
                fn(Ability $ability) => [
                    'id' => $ability->getId(),
                    'module' => $ability->getModule()->value,
                    'resource' => $ability->getResource(),
                    'resource_constraint' => $ability->getResourceConstraint(),
                    'action' => $ability->getAction()->value,
                    'description' => $ability->getDescription(),
                    'created_at' => $ability->getCreatedAt()->format(\DateTime::ATOM),
                ],
                $this->getAbilities()
            )
        ];
    }
}
