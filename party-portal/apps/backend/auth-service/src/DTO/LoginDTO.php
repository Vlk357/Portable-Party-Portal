<?php

declare(strict_types=1);

namespace App\DTO;

use Symfony\Component\Validator\Constraints as Assert;

class LoginDTO implements \JsonSerializable
{
    public function __construct(
        #[Assert\NotBlank]
        public readonly string $username,
        #[Assert\NotBlank]
        public readonly string $password
    ) {
    }

    public static function fromJson(string $json): ?self
    {
        try {
            /** @var mixed $data */
            $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

            if (!is_array($data)) {
                return null;
            }

            // Type guard for required fields
            if (!isset($data['username'], $data['password'])) {
                return null;
            }

            // Type guard for string values
            if (!is_string($data['username']) || !is_string($data['password'])) {
                return null;
            }

            return new self(
                username: $data['username'],
                password: $data['password']
            );
        } catch (\JsonException) {
            return null;
        }
    }

    /**
     * @return array{username: string}
     */
    public function jsonSerialize(): array
    {
        return [
            'username' => $this->username
        ];
    }
}
