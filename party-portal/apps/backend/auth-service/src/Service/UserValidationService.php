<?php

namespace App\Service;

use App\Entity\User;
use App\Exception\ValidationException;
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Symfony\Component\Validator\Constraints\GroupSequence;

class UserValidationService
{
    public function __construct(
        private readonly ValidatorInterface $validator
    ) {
    }

    /**
     * @param array<string|GroupSequence>|string|GroupSequence|null $groups
     */
    public function validateUser(User $user, string|array|GroupSequence|null $groups = null): void
    {
        $violations = $this->validator->validate($user, null, $groups);
        if (count($violations) > 0) {
            throw new ValidationException($violations);
        }
    }

    /**
     * @param array<string|GroupSequence>|string|GroupSequence|null $groups
     */
    public function validateProperty(
        User $user,
        string $propertyName,
        string|array|GroupSequence|null $groups = null
    ): void {
        $violations = $this->validator->validateProperty($user, $propertyName, $groups);
        if (count($violations) > 0) {
            throw new ValidationException($violations);
        }
    }
}
