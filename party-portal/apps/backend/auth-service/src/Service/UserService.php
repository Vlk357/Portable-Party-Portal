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
use function PHPUnit\Framework\returnArgument;

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

        $ability = $this->abilityRepository->find($abilityId);

        $user->addAbility($ability);
        $this->userRepository->save($user);
    }

    /**
     * @param int $userId
     * @throws \InvalidArgumentException
     * @return \App\Entity\Ability[]
     */
    public function getUserAbilities(int $userId): array
    {
        $user = $this->userRepository->find($userId);

        return $user->getDirectAbilities();
    }

    public function updateUserAbility(int $userId, int $abilityId): void
    {
        $userAbility = $this->userAbilityRepository->findByCompositeKey($userId, $abilityId);
        $userAbility->setExpiresAt(new \DateTimeImmutable());
        $this->userAbilityRepository->save($userAbility);
    }

    public function removeUserAbility(int $userId, int $abilityId): void
    {
        $user = $this->userRepository->find($userId);
        $ability = $this->abilityRepository->find($abilityId);

        $user->removeAbility($ability);
        $this->userRepository->save($user);
    }

    /**
     * @return array<int, array{id: int, username: string}>
     */
    public function findUserList(): array {
        return $this->userRepository->findUserList();
    }
}
