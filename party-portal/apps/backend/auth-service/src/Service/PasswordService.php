<?php

namespace App\Service;

use App\Entity\User;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class PasswordService
{
    private static ?self $instance = null;
    private UserPasswordHasherInterface $hasher;

    private function __construct(UserPasswordHasherInterface $hasher) 
    {
        $this->hasher = $hasher;
    }

    public static function initialize(UserPasswordHasherInterface $hasher): void
    {
        if (self::$instance === null) {
            self::$instance = new self($hasher);
        }
    }

    public static function hashPassword(User $user, string $plainPassword): string
    {
        if (self::$instance === null) {
            throw new \RuntimeException('PasswordService must be initialized first');
        }

        return self::$instance->hasher->hashPassword($user, $plainPassword);
    }
}