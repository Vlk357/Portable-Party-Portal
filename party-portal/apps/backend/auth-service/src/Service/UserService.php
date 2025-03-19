<?php

namespace App\Service;

use App\Entity\User;
use App\Enum\UserStatus;
use App\Exception\ValidationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Validator\ConstraintViolation;
use Symfony\Component\Validator\ConstraintViolationList;

class UserService
{
    public function __construct(
        private readonly UserValidationService $validator,
        private readonly EntityManagerInterface $entityManager
    ) {
    }

    /**
     * Creates a new user and validates it
     * @param string $username
     * @param string $password
     * @param \App\Enum\UserStatus $status
     * @param array<\App\Entity\Role> $roles
     * @param array<\App\Entity\Ability> $abilities
     * 
     * @throws \App\Exception\ValidationException
     * 
     * @return User
     */
    public function createUser(
        string $username,
        string $password,
        UserStatus $status = UserStatus::PENDING_ACTIVATION,
        array $roles = [],
        array $abilities = []
    ): User {
        // Check username uniqueness before creating user
        $existingUser = $this->entityManager
            ->getRepository(User::class)
            ->findOneBy(['username' => $username]);
            
            if ($existingUser) {
                $violations = new ConstraintViolationList([
                    new ConstraintViolation(
                        'Username is already taken',
                        'Username is already taken',
                        [],
                        null,
                        'username',
                        $username
                    )
                ]);
                throw new ValidationException($violations);
            }
    
        $user = new User($username, $password, $status, $roles, $abilities);
        $this->validator->validateUser($user, ['Default', 'password_validation']);
        
        $this->entityManager->persist($user);
        $this->entityManager->flush();
        
        return $user;
    }

    public function updateUsername(User $user, string $username): void
    {
        $user->setUsername($username);
        $this->validator->validateProperty($user, 'username');

        $this->entityManager->flush();
    }
}