<?php

namespace App\DTO;

use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;

class CreateAbilityDTO
{
    public function __construct(
        public readonly ModuleEnum $module,
        public readonly string $resource,
        public readonly ActionEnum $action,
        public readonly ?string $resourceConstraint = null,
        public readonly ?string $description = null
    ) {}

    /**
     * @param array{
     *   module?: string,
     *  resource?: string,
     * action?: string,
     * resourceConstraint?: string,
     * description?: string
     * } $data
     * @throws \InvalidArgumentException
     * @return CreateAbilityDTO
     */
    public static function fromArray(?array $data): self
    {
        if (!$data) {
            throw new \InvalidArgumentException('Data array cannot be null');
        }

        if (!isset($data['module'], $data['resource'], $data['action'])) {
            throw new \InvalidArgumentException('Required fields missing: module, resource, action');
        }

        try {
            return new self(
                ModuleEnum::tryFrom($data['module']) ?? throw new \InvalidArgumentException('Invalid module'),
                $data['resource'],
                ActionEnum::tryFrom($data['action']) ?? throw new \InvalidArgumentException('Invalid action'),
                $data['resourceConstraint'] ?? null,
                $data['description'] ?? null
            );
        } catch (\ValueError $e) {
            throw new \InvalidArgumentException($e->getMessage());
        }
    }
}
