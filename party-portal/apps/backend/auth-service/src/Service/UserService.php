<?php

namespace App\Service;

use App\Entity\User;
use App\Enum\UserStatus;
use App\Exception\ValidationException;
use App\Repository\AbilityRepository;
use App\Repository\UserAbilityRepository;
use App\Repository\UserRepository;
use Symfony\Component\Validator\ConstraintViolation;
use Symfony\Component\Validator\ConstraintViolationList;

class UserService
{
    public function __construct(
        private readonly UserValidationService $validator,
        private readonly UserRepository $userRepository,
        private readonly AbilityRepository $abilityRepository,
        private readonly UserAbilityRepository $userAbilityRepository
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
        if ($this->userRepository->findByUsername($username)) {
            throw new ValidationException(new ConstraintViolationList([
                new ConstraintViolation(
                    'Username is already taken',
                    'Username is already taken',
                    [],
                    null,
                    'username',
                    $username
                )
            ]));
        }

        $user = new User($username, $password, $status, $roles, $abilities);
        $this->validator->validateUser($user, ['Default', 'password_validation']);

        return $this->userRepository->save($user);
    }

    /**
     * @param \App\Entity\User $user
     * @param string $username
     * @return User
     */
    public function updateUsername(User $user, string $username): User
    {
        $user->setUsername($username);
        $this->validator->validateProperty($user, 'username');

        return $this->userRepository->update($user);
    }

    public function addUserAbility(int $userId, int $abilityId): void
    {
        $user = $this->userRepository->find($userId);
        if (!$user) {
            throw new \InvalidArgumentException('User not found');
        }

        $ability = $this->abilityRepository->find($abilityId);
        if (!$ability) {
            throw new \InvalidArgumentException('Ability not found');
        }

        $user->addAbility($ability);
        $this->userRepository->save($user);
    }

    public function getUserAbilities(int $userId): array
    {
        $user = $this->userRepository->find($userId);
        if (!$user) {
            throw new \InvalidArgumentException('User not found');
        }

        return $user->getDirectAbilities();
    }

    public function updateUserAbility(int $userId, int $abilityId): void
    {
        $userAbility = $this->userAbilityRepository->findByUserAndAbility($userId, $abilityId);
        if (!$userAbility) {
            throw new \InvalidArgumentException('User ability not found');
        }
        $userAbility->setExpiresAt(new \DateTimeImmutable());
        $this->userAbilityRepository->save($userAbility);
    }

    public function removeUserAbility(int $userId, int $abilityId): void
    {
        $user = $this->userRepository->find($userId);
        if (!$user) {
            throw new \InvalidArgumentException('User not found');
        }

        $ability = $this->abilityRepository->find($abilityId);
        if (!$ability) {
            throw new \InvalidArgumentException('Ability not found');
        }

        $user->removeAbility($ability);
        $this->userRepository->save($user);
    }
}
