<?php

namespace App\Exception;

use Symfony\Component\Validator\ConstraintViolationListInterface;

class ValidationException extends \RuntimeException
{
    public function __construct(
        private readonly ConstraintViolationListInterface $violations,
        string $message = 'Validation failed',
        int $code = 0,
        ?\Throwable $previous = null
    ) {
        parent::__construct($message, $code, $previous);
    }

    public function getViolations(): ConstraintViolationListInterface
    {
        return $this->violations;
    }

    public function getFormattedViolations(): array
    {
        $formattedViolations = [];
        foreach ($this->violations as $violation) {
            $formattedViolations[] = [
                'property' => $violation->getPropertyPath(),
                'message' => $violation->getMessage(),
            ];
        }

        return $formattedViolations;
    }
}