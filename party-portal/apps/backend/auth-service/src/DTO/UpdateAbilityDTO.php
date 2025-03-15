<?php

namespace App\DTO;

use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;

class UpdateAbilityDTO
{
    public function __construct(
        public readonly ?ModuleEnum $module = null,
        public readonly ?string $resource = null,
        public readonly ?ActionEnum $action = null,
        public readonly ?string $resourceConstraint = null,
        public readonly ?string $description = null
    ) {}

    public static function fromArray(?array $data): self
    {
        if (!$data) {
            return new self();
        }

        return new self(
            isset($data['module']) ? ModuleEnum::tryFrom($data['module']) : null,
            $data['resource'] ?? null,
            isset($data['action']) ? ActionEnum::tryFrom($data['action']) : null,
            $data['resourceConstraint'] ?? null,
            $data['description'] ?? null
        );
    }

    public function hasChanges(): bool
    {
        return $this->module !== null
            || $this->resource !== null
            || $this->action !== null
            || $this->resourceConstraint !== null
            || $this->description !== null;
    }
}