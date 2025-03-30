<?php

namespace App\Repository;

use App\Entity\UserAbility;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;

class UserAbilityRepository extends AbstractRepository
{
    public function __construct(EntityManagerInterface $entityManager)
    {
        parent::__construct($entityManager, UserAbility::class);
    }

    public function findByUserAndAbility(int $userId, int $abilityId): ?UserAbility
    {
        return $this->entityManager
            ->getRepository(UserAbility::class)
            ->findOneBy(['user' => $userId, 'ability' => $abilityId]);
    }
}