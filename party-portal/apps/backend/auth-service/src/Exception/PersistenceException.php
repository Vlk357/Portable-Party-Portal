<?php

namespace App\Exception;

class PersistenceException extends \RuntimeException
{
    public static function createSaveError(string $entityClass, ?\Throwable $previous = null): self
    {
        return new self(
            sprintf('Failed to save entity of type %s', $entityClass),
            0,
            $previous
        );
    }

    public static function createUpdateError(string $entityClass, ?\Throwable $previous = null): self
    {
        return new self(
            sprintf('Failed to update entity of type %s', $entityClass),
            0,
            $previous
        );
    }

    public static function createDeleteError(string $entityClass, ?\Throwable $previous = null): self
    {
        return new self(
            sprintf('Failed to delete entity of type %s', $entityClass),
            0,
            $previous
        );
    }
}