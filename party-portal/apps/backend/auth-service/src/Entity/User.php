<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use App\Service\PasswordService;
use App\Enum\UserStatus;
use App\DTO\CreateUserDTO;

#[ORM\Entity]
#[ORM\Table(name: 'users')]
class User implements UserInterface, PasswordAuthenticatedUserInterface, \JsonSerializable
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(length: 100, unique: true)]
    private ?string $username = null;

    #[ORM\Column(name: 'password_hash', length: 60)]
    private ?string $password = null;

    #[ORM\Column(type: 'string', enumType: UserStatus::class)]
    private UserStatus $status = UserStatus::PENDING_ACTIVATION;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable', insertable: false, updatable: false, options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, UserRole> */
    #[ORM\OneToMany(targetEntity: UserRole::class, mappedBy: 'user', cascade: ['persist', 'remove'])]
    private Collection $userRoles;

    /** @var Collection<int, UserAbility> */
    #[ORM\OneToMany(targetEntity: UserAbility::class, mappedBy: 'user', cascade: ['persist', 'remove'])]
    private Collection $userAbilities;

    public function __construct(
        ?string $username = null,
        ?string $password = null,
        UserStatus $status = UserStatus::PENDING_ACTIVATION,
        $roles = [],
        $abilities = []
    ) {
        $this->username = $username;
        if (is_string($password)) {
            $this->setPassword($password);
        }
        $this->status = $status;
        $this->userRoles = new ArrayCollection();
        foreach ($roles as $role) {
            $this->addRole($role);
        }
        $this->userAbilities = new ArrayCollection();
        foreach ($abilities as $ability) {
            $this->addAbility($ability);
        }
    }

    public function getUserIdentifier(): string
    {
        return $this->username ?: throw new \RuntimeException('Username cannot be empty');
    }

    /**
     * @return array<Role>
     */
    public function getRoles(): array
    {
        return $this->userRoles->map(fn(UserRole $userRole): Role => $userRole->getRole())
            ->toArray();
    }

    /**
     * Gets only directly assigned abilities (not from roles)
     * @return array<Ability>
     */
    public function getDirectAbilities(): array
    {
        return $this->userAbilities->map(
            fn(UserAbility $userAbility) => $userAbility->getAbility()
        )->toArray();
    }

    /**
     * Gets all abilities (direct + from roles)
     * @return array<Ability>
     */
    public function getAllAbilities(): array
    {
        $roleAbilities = [];
        // Get role abilities
        foreach ($this->getRoles() as $role) {
            $roleAbilities = array_merge($roleAbilities, $role->getAbilities());
        }

        // Get direct abilities
        $directAbilities = $this->userAbilities
            ->map(fn(UserAbility $userAbility) => $userAbility->getAbility())
            ->toArray();

        return array_unique(
            array_merge($roleAbilities, $directAbilities),
            SORT_REGULAR
        );
    }

    /**
     * Check if user has specific ability (direct or via role)
     */
    public function hasAbility(Ability $ability): bool
    {
        // Check direct abilities
        $hasDirectAbility = $this->userAbilities
            ->exists(fn(UserAbility $userAbility) => $userAbility->getAbility() === $ability);

        if ($hasDirectAbility) {
            return true;
        }

        // Check role abilities
        foreach ($this->getRoles() as $role) {
            if ($role->hasAbility($ability)) {
                return true;
            }
        }

        return false;
    }

    /**
     * For voter/authorization checks
     */
    public function hasAbilityByAttributes(string $module, string $resource, string $action, ?string $constraint = null): bool
    {
        foreach ($this->getAllAbilities() as $ability) {
            if (
                $ability->getModule()->value === $module
                && $ability->getResource() === $resource
                && $ability->getAction()->value === $action
                && (!$constraint || $ability->getResourceConstraint() === $constraint)
            ) {
                return true;
            }
        }
        return false;
    }

    public function addAbility(Ability $ability): self
    {
        if (!$this->hasAbility($ability)) {
            $userAbility = new UserAbility($this, $ability);
            $this->userAbilities->add($userAbility);
        }
        return $this;
    }

    public function removeAbility(Ability $ability): self
    {
        $this->userAbilities->removeElement(
            $this->userAbilities->filter(
                fn(UserAbility $userAbility) => $userAbility->getAbility() === $ability
            )->first() ?: null
        );
        return $this;
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function eraseCredentials(): void
    {
        // If you store any temporary, sensitive data on the user, clear it here
    }

    // Getters and setters
    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUsername(): ?string
    {
        return $this->username;
    }

    public function setUsername(string $username): self
    {
        if (strlen($username) < 3) {
            throw new \InvalidArgumentException('Username must be at least 3 characters long');
        }
        $this->username = $username;
        return $this;
    }

    public function setPassword(string $password): self
    {
        $this->password = PasswordService::hashPassword($this, $password);
        return $this;
    }
    public function getStatus(): UserStatus
    {
        return $this->status;
    }

    public function setStatus(UserStatus $status): self
    {
        $this->status = $status;
        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): static
    {
        $this->createdAt = $createdAt;

        return $this;
    }

    public function addRole(Role $role): static
    {
        if (!$this->hasRole($role)) {
            $userRole = new UserRole($this, $role);
            $this->userRoles->add($userRole);
        }

        return $this;
    }

    public function removeRole(Role $role): static
    {
        if ($this->hasRole($role)) {
            $userRole = $this->userRoles->filter(fn(UserRole $userRole): bool => $userRole->getRole() === $role)->first();
            $this->userRoles->removeElement($userRole);
        }

        return $this;
    }

    public function hasRole(Role $role): bool
    {
        return $this->userRoles->map(fn(UserRole $userRole): Role => $userRole->getRole())
            ->contains($role);
    }

    /**
     * @return array{
     *     id: int|null,
     *     username: string|null,
     *     status: string,
     *     created_at: string,
     *     roles: array<array{name: string, description: string|null}>
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->getId(),
            'username' => $this->getUsername(),
            'status' => $this->getStatus()->value,
            'created_at' => $this->getCreatedAt()->format(\DateTime::ATOM),
            'roles' => array_map(
                fn(Role $role): array => [
                    'name' => $role->getName(),
                    'description' => $role->getDescription()
                ],
                $this->getRoles()
            ),
            'abilities' => array_map(
                fn(Ability $ability): array => [
                    'module' => $ability->getModule()->value,
                    'resource' => $ability->getResource(),
                    'action' => $ability->getAction()->value,
                    'resource_constraint' => $ability->getResourceConstraint(),
                    'description' => $ability->getDescription()
                ],
                $this->getDirectAbilities()
            )
        ];
    }
}
