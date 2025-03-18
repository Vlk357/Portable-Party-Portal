<?php

namespace App\Service;

use App\Entity\User;
use App\Exception\ValidationException;
use Symfony\Component\Validator\Validator\ValidatorInterface;

class UserValidationService
{
    public function __construct(
        private readonly ValidatorInterface $validator
    ) {}

    public function validateUser(User $user, ?array $groups = null): void
    {
        $violations = $this->validator->validate($user, null, $groups);
        if (count($violations) > 0) {
            throw new ValidationException($violations);
        }
    }

    public function validateProperty(User $user, string $propertyName, ?array $groups = null): void
    {
        $violations = $this->validator->validateProperty($user, $propertyName, $groups);
        if (count($violations) > 0) {
            throw new ValidationException($violations);
        }
    }
}