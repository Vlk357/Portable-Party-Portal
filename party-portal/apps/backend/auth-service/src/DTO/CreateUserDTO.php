<?php

namespace App\DTO;

use Symfony\Component\Validator\Constraints as Assert;

class CreateUserDTO implements \JsonSerializable
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Length(min: 3)]
        public readonly string $username,

        #[Assert\NotBlank]
        #[Assert\Length(min: 8)]
        #[Assert\Callback([self::class, 'validatePassword'])]
        public readonly string $password,
    ) {}

    public static function validatePassword($password, \Symfony\Component\Validator\Context\ExecutionContextInterface $context)
    {
        $categories = 0;
        if (preg_match('/[a-z]/', $password)) {
            $categories++;
        }
        if (preg_match('/[A-Z]/', $password)) {
            $categories++;
        }
        if (preg_match('/\d/', $password)) {
            $categories++;
        }
        if (preg_match('/[\W_]/', $password)) {
            $categories++;
        }

        if ($categories < 3) {
            $context->buildViolation('Password must contain at least three of the following categories: lowercase letter, uppercase letter, number, and special character.')
                ->addViolation();
        }
    }

    public static function fromJson(string $json): ?self
    {
        $data = json_decode($json, true);
        if (!$data || !isset($data['username'], $data['password'])) {
            return null;
        }
        
        return new self(
            username: $data['username'],
            password: $data['password']
        );
    }

    public function jsonSerialize(): array
    {
        return [
            'username' => $this->username,
            'password' => '***'  // Never expose password
        ];
    }
}