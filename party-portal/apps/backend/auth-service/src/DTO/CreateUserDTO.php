<?php

namespace App\DTO;

use App\Enum\UserStatus;
use App\Exception\DTOValidationException;

class CreateUserDTO implements \JsonSerializable
{
    public function __construct(
        public readonly string $username,
        public readonly string $password,
        public readonly UserStatus $status = UserStatus::PENDING_ACTIVATION,
        public readonly array $roles = [],
        public readonly array $abilities = []
    ) {}

    /**
     * @throws DTOValidationException
     */
    public static function fromJson(string $json): self
    {
        try {
            $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new DTOValidationException('Invalid JSON format');
        }

        if (!is_array($data)) {
            throw new DTOValidationException('Request body must be a JSON object');
        }

        if (!isset($data['username'])) {
            throw new DTOValidationException('Username is required');
        }

        if (!isset($data['password'])) {
            throw new DTOValidationException('Password is required');
        }

        if (!is_string($data['username'])) {
            throw new DTOValidationException('Username must be string');
        }

        if (!is_string($data['password'])) {
            throw new DTOValidationException('Password must be string');
        }

        $username = trim($data['username']);
        $password = trim($data['password']);

        if (empty($username)) {
            throw new DTOValidationException('Username cannot be empty');
        }

        if (empty($password)) {
            throw new DTOValidationException('Password cannot be empty');
        }

        // Handle optional status
        $status = UserStatus::PENDING_ACTIVATION;
        if (isset($data['status'])) {
            try {
                $status = UserStatus::from($data['status']);
            } catch (\ValueError $e) {
                throw new DTOValidationException('Invalid status value: ' . $data['status']);
            }
        }

        // Handle optional arrays
        $roles = [];
        if (isset($data['roles'])) {
            if (!is_array($data['roles'])) {
                throw new DTOValidationException('Roles must be an array');
            }
            $roles = $data['roles'];
        }

        $abilities = [];
        if (isset($data['abilities'])) {
            if (!is_array($data['abilities'])) {
                throw new DTOValidationException('Abilities must be an array');
            }
            $abilities = $data['abilities'];
        }

        return new self(
            username: $username,
            password: $password,
            status: $status,
            roles: $roles,
            abilities: $abilities
        );
    }

    public function jsonSerialize(): array
    {
        return [
            'username' => $this->username,
            'status' => $this->status->value,
            'roles' => $this->roles,
            'abilities' => $this->abilities
        ];
    }
}