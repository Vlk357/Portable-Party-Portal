<?php

namespace App\DTO;

class CreateUserDTO implements \JsonSerializable
{
    public function __construct(
        public readonly string $username,
        public readonly string $password,
    ) {}

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

            // Basic sanitization
            $username = trim($data['username']);
            $password = trim($data['password']);

            // Ensure non-empty after trimming
            if (empty($username) || empty($password)) {
                return null;
            }

            return new self($username, $password);
        } catch (\JsonException) {
            return null;
        }
    }

    public function jsonSerialize(): array
    {
        return [
            'username' => $this->username
        ];
    }
}