<?php

namespace App\Repository;

use App\Entity\UserAbility;
use App\Exception\EntityNotFoundException;
use App\Exception\PersistenceException;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;

class UserAbilityRepository
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager
    ) {
    }

    /**
     * @param UserAbility $userAbility
     * @return UserAbility
     * @throws \App\Exception\PersistenceException
     */
    public function save(UserAbility $userAbility, bool $flush = true): UserAbility
    {
        try {
            $this->entityManager->persist($userAbility);
            if ($flush) {
                $this->entityManager->flush();
            }
            return $userAbility;
        } catch (\Throwable $e) {
            throw PersistenceException::createSaveError(UserAbility::class, $e);
        }
    }

    /**
     * @throws EntityNotFoundException
     */
    public function findByCompositeKey(int $userId, int $abilityId): UserAbility
    {
        $entity = $this->entityManager->find(
            UserAbility::class,
            ['user' => $userId, 'ability' => $abilityId]
        );

        if (!$entity instanceof UserAbility) {
            throw EntityNotFoundException::create(
                UserAbility::class,
                null
            );
        }

        return $entity;
    }
}
