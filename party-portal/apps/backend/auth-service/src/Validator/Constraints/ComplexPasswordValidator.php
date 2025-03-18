<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

class ComplexPasswordValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$value || !is_string($value)) {
            return;
        }

        $categories = 0;
        if (preg_match('/[a-z]/', $value))
            $categories++;
        if (preg_match('/[A-Z]/', $value))
            $categories++;
        if (preg_match('/\d]/', $value))
            $categories++;
        if (preg_match('/[^a-zA-Z\d]/', $value))
            $categories++;

        if ($categories < 3) {
            $this->context->buildViolation($constraint->message)
                ->addViolation();
        }
    }
}