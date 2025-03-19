<?php

namespace App\Entity;

use App\Enum\ActionEnum;
use App\Enum\ModuleEnum;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Validator\Constraints as Assert;
use App\Service\PasswordService;
use App\Enum\UserStatus;
use App\Exception\ValidationException;
use App\Validator\Constraints\ComplexPassword;
use Symfony\Component\Validator\Context\ExecutionContextInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[ORM\Entity]
#[ORM\Table(name: 'users')]
class User implements UserInterface, PasswordAuthenticatedUserInterface, \JsonSerializable
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(length: 100, unique: true)]
    #[Assert\NotBlank(message: 'Username cannot be empty')]
    #[Assert\Length(
        min: 1,
        max: 100,
        minMessage: 'Username must be at least {{ limit }} characters long',
        maxMessage: 'Username cannot be longer than {{ limit }} characters'
    )]
    private string $username;

    #[ORM\Column(name: 'password_hash', length: 60)]
    #[Assert\NotBlank(groups: ['password_validation'])]
    #[Assert\Length(
        min: 8,
        max: 72, // BCrypt maximum
        minMessage: 'Password must be at least {{ limit }} characters long',
        maxMessage: 'Password cannot be longer than {{ limit }} characters',
        groups: ['password_validation']
    )]
    #[Assert\Callback([self::class, 'validatePasswordComplexity'], groups: ['password_validation'])]
    private string $password;

    #[ORM\Column(type: 'string', enumType: UserStatus::class)]
    private UserStatus $status = UserStatus::PENDING_ACTIVATION;

    #[ORM\Column(
        name: 'created_at',
        type: 'datetime_immutable',
        insertable: false,
        updatable: false,
        options: ['default' => 'CURRENT_TIMESTAMP']
    )]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, UserRole> */
    #[ORM\OneToMany(targetEntity: UserRole::class, mappedBy: 'user', cascade: ['persist', 'remove'])]
    private Collection $userRoles;

    /** @var Collection<int, UserAbility> */
    #[ORM\OneToMany(targetEntity: UserAbility::class, mappedBy: 'user', cascade: ['persist', 'remove'])]
    private Collection $userAbilities;

    /**
     * @param string $username
     * @param string $password
     * @param \App\Enum\UserStatus $status
     * @param array<Role> $roles
     * @param array<Ability> $abilities
     */
    public function __construct(
        string $username,
        string $password,
        UserStatus $status = UserStatus::PENDING_ACTIVATION,
        $roles = [],
        $abilities = []
    ) {
        $this->setUsername($username);
        $this->setPassword($password);
        $this->setStatus($status);
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
     * Returns all user's abilities as permission strings for Symfony security
     * @return array<string>
     */
    public function getRoles(): array
    {
        return array_map(
            fn(Ability $ability): string => $ability->toPermissionString(),
            $this->getAllAbilities()
        );
    }

    /**
     * Returns actual Role entities assigned to user
     * @return array<Role>
     */
    public function getEntityRoles(): array
    {
        return $this->userRoles->map(
            fn(UserRole $userRole): Role => $userRole->getRole()
        )->toArray();
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
        foreach ($this->getEntityRoles() as $role) {
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
            ->exists(fn(int $index, UserAbility $userAbility): bool => $userAbility->getAbility() === $ability);

        if ($hasDirectAbility) {
            return true;
        }

        // Check role abilities
        foreach ($this->getEntityRoles() as $role) {
            if ($role->hasAbility($ability)) {
                return true;
            }
        }

        return false;
    }

    /**
     * For voter/authorization checks
     */
    public function hasAbilityByAttributes(
        string $module,
        string $resource,
        string $action,
        ?string $constraint = null
    ): bool {
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
        $userAbility = $this->userAbilities->filter(
            fn(UserAbility $userAbility, int $index) => $userAbility->getAbility() === $ability
        )->first();
        if ($userAbility) {
            $this->userAbilities->removeElement($userAbility);
        }
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

    public function getUsername(): string
    {
        return $this->username;
    }

    public function setUsername(string $username): self
    {
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
            $userRole = $this->userRoles->filter(
                fn(UserRole $userRole, int $index): bool => $userRole->getRole() === $role
            )->first();
            if ($userRole) {
                $this->userRoles->removeElement($userRole);
            }
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
     *     username: string,
     *     status: 'ACTIVE'|'LOCKED'|'PENDING_ACTIVATION'|'SUSPENDED',
     *     created_at: non-falsy-string,
     *     roles: array<array{name: string, description: string|null}>,
     *     abilities: array<array{
     *         module: 'AUTH'|'CHAT'|'GALLERY'|'VIDEO',
     *         resource: string,
     *         action: 'CREATE'|'DELETE'|'MANAGE'|'READ'|'UPDATE',
     *         resource_constraint: string|null,
     *         description: string|null
     *     }>
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
                $this->getEntityRoles()
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

    /**
     * @param array{
     *   id: int|null,
     *  username: string,
     * password: string,
     * status: 'ACTIVE'|'LOCKED'|'PENDING_ACTIVATION'|'SUSPENDED',
     * created_at: non-falsy-string,
     * roles: array<array{name: string, description: string|null}>,
     * abilities: array<array{
     *     module: 'AUTH'|'CHAT'|'GALLERY'|'VIDEO',
     *     resource: string,
     *     action: 'CREATE'|'DELETE'|'MANAGE'|'READ'|'UPDATE',
     *     resource_constraint: string|null,
     *     description: string|null
     * }> } $data
     * @return void
     */
    public function __unserialize(array $data): void
    {
        $this->id = $data['id'];
        $this->username = $data['username'];
        $this->password = $data['password'];
        $this->status = UserStatus::from($data['status']);
        $this->createdAt = new \DateTimeImmutable($data['created_at']);
        $this->userRoles = new ArrayCollection();
        foreach ($data['roles'] as $roleData) {
            $role = new Role($roleData['name'], $roleData['description']);
            $this->addRole($role);
        }
        $this->userAbilities = new ArrayCollection();
        foreach ($data['abilities'] as $abilityData) {
            $ability = new Ability(
                ModuleEnum::from($abilityData['module']),
                $abilityData['resource'],
                ActionEnum::from($abilityData['action']),
                $abilityData['resource_constraint'],
                $abilityData['description']
            );
            $this->addAbility($ability);
        }
    }
}
