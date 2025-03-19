<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class ComplexPasswordValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof ComplexPassword) {
            throw new UnexpectedTypeException($constraint, ComplexPassword::class);
        }

        if (null === $value || '' === $value) {
            return;
        }

        if (!is_string($value)) {
            throw new UnexpectedTypeException($value, 'string');
        }

        $categories = 0;
        if (preg_match('/[a-z]/', $value)) {
            $categories++;
        }
        if (preg_match('/[A-Z]/', $value)) {
            $categories++;
        }
        if (preg_match('/\d/', $value)) {  // Fixed the regex
            $categories++;
        }
        if (preg_match('/[^a-zA-Z\d]/', $value)) {
            $categories++;
        }

        if ($categories < 3) {
            $this->context->buildViolation($constraint->message)
                ->setCode('PASSWORD_TOO_SIMPLE')
                ->addViolation();
        }
    }
}