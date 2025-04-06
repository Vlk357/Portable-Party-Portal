<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Role;
use App\Enum\ModuleEnum;
use Doctrine\ORM\EntityManagerInterface;

/**
 * @extends AbstractRepository<Role>
 */
class RoleRepository extends AbstractRepository
{
    public function __construct(EntityManagerInterface $entityManager)
    {
        parent::__construct($entityManager, Role::class);
    }

    /**
     * Find roles that have any of the specified abilities by ID
     *
     * @param array<int> $abilityIds
     * @return array<Role>
     */
    public function findRolesWithAbilities(array $abilityIds): array
    {
        if (empty($abilityIds)) {
            return [];
        }

        $qb = $this->entityManager->createQueryBuilder();
        $qb->select('DISTINCT r')
            ->from('App\Entity\Role', 'r')
            ->join('r.roleAbilities', 'ra')
            ->join('ra.ability', 'a')
            ->where($qb->expr()->in('a.id', ':abilityIds'))
            ->setParameter('abilityIds', $abilityIds);

        /**
         * @var array<Role> $roles
         */
        $roles = $qb->getQuery()->getResult();

        return $roles;
    }
}
