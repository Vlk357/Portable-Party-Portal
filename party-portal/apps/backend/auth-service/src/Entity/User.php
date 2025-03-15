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

    #[ORM\Column(name: 'created_at')]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, Role> */
    #[ORM\ManyToMany(targetEntity: Role::class, inversedBy: 'users')]
    #[ORM\JoinTable(name: 'user_roles')]
    private Collection $roles;

    /** @var Collection<int, Ability> */
    #[ORM\ManyToMany(targetEntity: Ability::class, inversedBy: 'users')]
    #[ORM\JoinTable(name: 'user_abilities')]
    private Collection $abilities;

    public function __construct(
        ?string $username = null,
        ?string $password = null,
        UserStatus $status = UserStatus::PENDING_ACTIVATION
    ) {
        $this->username = $username;
        if (is_string($password)) {
            $this->setPassword($password);
        }
        $this->status = $status;
        $this->createdAt = new \DateTimeImmutable();
        $this->roles = new ArrayCollection();
        $this->abilities = new ArrayCollection();
    }

    public static function create(CreateUserDTO $dto): self
    {
        $user = new self();
        $user->setUsername($dto->username);
        $user->setPassword($dto->password);
        $user->status = UserStatus::PENDING_ACTIVATION;
        $user->createdAt = new \DateTimeImmutable();
        return $user;
    }

    /**
     * @param array{
     *     id: int,
     *     username: string,
     *     password_hash: string,
     *     status: string,
     *     created_at: string
     * } $userData
     * @param array<array{name: string, description: ?string}> $roles
     */
    public static function fromDatabase(array $userData, array $roles = []): self
    {
        $user = new self();
        $user->id = (int) $userData['id'];
        $user->username = $userData['username'];
        $user->password = $userData['password_hash'];
        $user->status = UserStatus::from($userData['status']);
        $user->createdAt = new \DateTimeImmutable($userData['created_at']);

        foreach ($roles as $roleData) {
            $role = new Role();
            $role->setName($roleData['name']);
            $role->setDescription($roleData['description']);
            $user->addRole($role);
        }

        return $user;
    }

    public function getUserIdentifier(): string
    {
        return $this->username ?: throw new \RuntimeException('Username cannot be empty');
    }

    /**
     * @return array<string>
     */
    public function getRoles(): array
    {
        return $this->roles
            ->map(fn(Role $role): string => $role->getName() ?: '')
            ->toArray();
    }

    /**
     * @return array<Ability>
     */
    public function getAbilities(): array
    {
        $allAbilities = [];

        // Get abilities from roles
        foreach ($this->roles as $role) {
            foreach ($role->getAbilities() as $ability) {
                $allAbilities[] = $ability;
            }
        }

        // Add direct abilities
        foreach ($this->abilities as $ability) {
            $allAbilities[] = $ability;
        }

        return array_unique($allAbilities, SORT_REGULAR);
    }

    public function hasAbility(string $module, string $resource, string $action, ?string $constraint = null): bool
    {
        foreach ($this->getAbilities() as $ability) {
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
        if (!$this->abilities->contains($ability)) {
            $this->abilities->add($ability);
        }
        return $this;
    }

    public function removeAbility(Ability $ability): self
    {
        $this->abilities->removeElement($ability);
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
        if (!$this->roles->contains($role)) {
            $this->roles->add($role);
            $role->addUser($this);
        }

        return $this;
    }

    public function removeRole(Role $role): static
    {
        if ($this->roles->removeElement($role)) {
            $role->removeUser($this);
        }

        return $this;
    }

    public function hasRole(Role $role): bool
    {
        return $this->roles->contains($role);
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
                    'name' => $role->getName() ?? '',
                    'description' => $role->getDescription()
                ],
                $this->roles->toArray()
            )
        ];
    }
}
