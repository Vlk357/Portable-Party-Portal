<?php

namespace App\Entity;

use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\DBAL\Types\Types;

#[ORM\Entity]
#[ORM\Table(name: 'abilities')]
class Ability implements \JsonSerializable
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: Types::STRING, enumType: ModuleEnum::class)]
    private ModuleEnum $module;

    #[ORM\Column(length: 100)]
    private string $resource;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $resourceConstraint = null;

    #[ORM\Column(type: 'string', enumType: ActionEnum::class)]
    private ActionEnum $action;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable', insertable: false, updatable: false, options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, UserAbility> */
    #[ORM\OneToMany(targetEntity: UserAbility::class, mappedBy: 'ability', cascade: ['persist', 'remove'])]
    private Collection $userAbilities;

    /** @var Collection<int, RoleAbility> */
    #[ORM\OneToMany(targetEntity: RoleAbility::class, mappedBy: 'ability', cascade: ['persist', 'remove'])]
    private Collection $roleAbilities;

    /**
     * @param \App\Enum\ModuleEnum $module
     * @param string $resource
     * @param \App\Enum\ActionEnum $action
     * @param string|null $resourceConstraint
     * @param string|null $description
     * @param array<User> $users
     * @param array<Role> $roles
     */
    public function __construct(
        ModuleEnum $module,
        string $resource,
        ActionEnum $action,
        ?string $resourceConstraint = null,
        ?string $description = null,
        array $users = [],
        array $roles = []
    ) {
        $this->module = $module;
        $this->resource = $resource;
        $this->action = $action;
        $this->resourceConstraint = $resourceConstraint;
        $this->description = $description;
        $this->userAbilities = new ArrayCollection();
        foreach ($users as $user) {
            $this->addUser($user);
        }
        $this->roleAbilities = new ArrayCollection();
        foreach ($roles as $role) {
            $this->addRole($role);
        }
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getModule(): ModuleEnum
    {
        return $this->module;
    }

    public function setModule(ModuleEnum $module): self
    {
        $this->module = $module;
        return $this;
    }

    public function getResource(): string
    {
        return $this->resource;
    }

    public function setResource(string $resource): self
    {
        $this->resource = $resource;
        return $this;
    }

    public function getResourceConstraint(): ?string
    {
        return $this->resourceConstraint;
    }

    public function setResourceConstraint(?string $resourceConstraint): self
    {
        $this->resourceConstraint = $resourceConstraint;
        return $this;
    }

    public function getAction(): ActionEnum
    {
        return $this->action;
    }

    public function setAction(ActionEnum $action): self
    {
        $this->action = $action;
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

    /** @return array<User> */
    public function getUsers(): array
    {
        return $this->userAbilities->map(
            fn(UserAbility $userAbility) => $userAbility->getUser()
        )->toArray();
    }

    public function addUser(User $user): self
    {
        if (!$this->hasUser($user)) {
            $userAbility = new UserAbility($user, $this);
            $this->userAbilities->add($userAbility);
        }
        return $this;
    }

    public function removeUser(User $user): self
    {
        $user = $this->userAbilities->filter(
            fn(UserAbility $userAbility) => $userAbility->getUser() === $user
        )->first();
        if ($user)
            $this->userAbilities->removeElement($user);
        return $this;
    }

    public function hasUser(User $user): bool
    {
        return $this->userAbilities->exists(
            fn(int $index, UserAbility $userAbility) => $userAbility->getUser() === $user
        );
    }

    /** @return array<Role> */
    public function getRoles(): array
    {
        return $this->roleAbilities->map(
            fn(RoleAbility $roleAbility) => $roleAbility->getRole()
        )->toArray();
    }

    public function addRole(Role $role): self
    {
        if (!$this->hasRole($role)) {
            $roleAbility = new RoleAbility($role, $this);
            $this->roleAbilities->add($roleAbility);
        }
        return $this;
    }

    public function removeRole(Role $role): self
    {
        $role = $this->roleAbilities->filter(
            fn(RoleAbility $roleAbility) => $roleAbility->getRole() === $role
        )->first();
        if ($role)
            $this->roleAbilities->removeElement($role);
        return $this;
    }

    public function hasRole(Role $role): bool
    {
        return $this->roleAbilities->exists(
            fn(int $index, RoleAbility $roleAbility) => $roleAbility->getRole() === $role
        );
    }

    /**
     * @return array{
     *  action: 'CREATE'|'DELETE'|'MANAGE'|'READ'|'UPDATE',
     *  created_at: non-falsy-string,
     *  description: string|null,
     *  id: int|null,
     *  module: 'AUTH'|'CHAT'|'GALLERY'|'VIDEO',
     *  resource: string,
     *  resource_constraint: string|null,
     *  users: array<array{
     *    id: int|null,
     *   username: string
     * }>
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'module' => $this->module->value,
            'resource' => $this->resource,
            'resource_constraint' => $this->resourceConstraint,
            'action' => $this->action->value,
            'description' => $this->description,
            'created_at' => $this->createdAt->format(\DateTime::ATOM),
            'users' => array_map(
                fn(User $user): array => [
                    'id' => $user->getId(),
                    'username' => $user->getUsername()
                ],
                $this->getUsers()
            )
        ];
    }

    public function toPermissionString(): string
    {
        return sprintf(
            '%s:%s:%s%s',
            $this->module->value,
            $this->resource,
            $this->action->value,
            $this->resourceConstraint ? ':' . $this->resourceConstraint : ''
        );
    }

    // Keep toString for debug/logging purposes
    public function __toString(): string
    {
        return $this->toPermissionString();
    }

    /**
     * @param array{
     *  id: int,
     * module: string,
     * resource: string,
     * resource_constraint: ?string,
     * action: string,
     * description: ?string,
     * created_at: string
     * } $data
     * @return void
     */
    public function __unserialize(array $data)
    {
        $this->id = $data['id'];
        $this->module = ModuleEnum::from($data['module']);
        $this->resource = $data['resource'];
        $this->resourceConstraint = $data['resource_constraint'];
        $this->action = ActionEnum::from($data['action']);
        $this->description = $data['description'];
        $this->createdAt = new \DateTimeImmutable($data['created_at']);
    }
}
