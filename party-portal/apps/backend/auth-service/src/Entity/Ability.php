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

    public function __construct(
        ModuleEnum $module,
        string $resource,
        ActionEnum $action,
        ?string $resourceConstraint = null,
        ?string $description = null
    ) {
        $this->module = $module;
        $this->resource = $resource;
        $this->action = $action;
        $this->resourceConstraint = $resourceConstraint;
        $this->description = $description;
        $this->userAbilities = new ArrayCollection();
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
}
