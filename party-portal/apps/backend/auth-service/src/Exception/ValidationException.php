<?php

namespace App\Exception;

use Symfony\Component\Validator\ConstraintViolationListInterface;
use Symfony\Component\Validator\ConstraintViolationList;
use Symfony\Component\Validator\ConstraintViolation;

class ValidationException extends \RuntimeException
{
    private readonly ConstraintViolationListInterface $violations;
    
    public function __construct(
        ConstraintViolationListInterface|string $violations,
        string $message = 'Validation failed',
        int $code = 0,
        ?\Throwable $previous = null
    ) {
        if (is_string($violations)) {
            $violation = new ConstraintViolation(
                $violations,
                $violations,
                [],
                null,
                'username',
                null
            );
            $this->violations = new ConstraintViolationList([$violation]);
        } else {
            $this->violations = $violations;
        }

        parent::__construct($message, $code, $previous);
    }

    public function getViolations(): ConstraintViolationListInterface
    {
        return $this->violations;
    }
}