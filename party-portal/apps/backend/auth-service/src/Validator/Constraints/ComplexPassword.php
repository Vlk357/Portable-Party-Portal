<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;

#[\Attribute]
class ComplexPassword extends Constraint
{
    public string $message = 'Password must contain at least three of: lowercase letters, uppercase letters, numbers, special characters';

    public function validatedBy(): string
    {
        return ComplexPasswordValidator::class;
    }
}