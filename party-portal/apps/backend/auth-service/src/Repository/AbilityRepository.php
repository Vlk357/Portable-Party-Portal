<?php

namespace App\Repository;

use App\Entity\Ability;
use Doctrine\ORM\EntityManagerInterface;

/**
 * @extends AbstractRepository<Ability>
 */
class AbilityRepository extends AbstractRepository
{
    public function __construct(EntityManagerInterface $entityManager)
    {
        parent::__construct($entityManager, Ability::class);
    }


    /**
     * @return array<Ability>
     */
    public function findByModule(string $module): array
    {
        return $this->entityManager
            ->getRepository(Ability::class)
            ->findBy(['module' => $module]);
    }
}
