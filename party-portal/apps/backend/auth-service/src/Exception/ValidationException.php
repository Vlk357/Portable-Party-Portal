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

    /**
     * Returns an array of formatted violations
     * 
     * @return list<array{property: string, message: string|\Stringable}>
     */
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