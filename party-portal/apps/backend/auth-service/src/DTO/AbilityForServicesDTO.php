<?php

declare(strict_types=1);

namespace App\DTO;

use App\Entity\Ability;

class AbilityForServicesDTO implements \JsonSerializable
{
    private int $id;
    private string $module;
    private string $resource;
    private ?string $resourceConstraint;
    private string $action;
    // private ?string $description;
    // private string $createdAt;

    public function __construct(Ability $ability)
    {
        $this->id = $ability->getId() ?? 0;
        $this->module = $ability->getModule()->value;
        $this->resource = $ability->getResource();
        $this->resourceConstraint = $ability->getResourceConstraint();
        $this->action = $ability->getAction()->value;
        // $this->description = $ability->getDescription();

        // Fix: Handle null case explicitly and don't use nullsafe operator on non-nullable type
        // $createdAt = $ability->getCreatedAt();
        // $this->createdAt = $createdAt->format('c');
    }

    /**
     * Convert ability to standardized string format: module:resource:action[:resourceConstraint]
     */
    public function abilityToString(): string
    {
        $abilityString = sprintf('%s:%s:%s', $this->module, $this->resource, $this->action);
        
        // Add resource constraint if available
        if ($this->resourceConstraint !== null && $this->resourceConstraint !== '') {
            $abilityString .= ":{$this->resourceConstraint}";
        }
        
        return $abilityString;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'ability_string' => $this->abilityToString(),
            // 'module' => $this->module,
            // 'resource' => $this->resource,
            // 'resource_constraint' => $this->resourceConstraint,
            // 'action' => $this->action,
            // 'description' => $this->description,
            // 'created_at' => $this->createdAt
        ];
    }
}
