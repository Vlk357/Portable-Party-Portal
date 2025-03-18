<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;

#[\Attribute]
class ComplexPassword extends Constraint
{
    public string $message = 'Password must contain characters of at least three of following categories: lowercase letters, uppercase letters, numbers, special characters';
}