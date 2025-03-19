<?php

namespace App\Exception;

class EntityNotFoundException extends \RuntimeException
{
    public static function create(string $entityClass, ?int $id): self
    {
        return new self(
            sprintf('Entity of type %s with id %d not found', $entityClass, $id)
        );
    }
}