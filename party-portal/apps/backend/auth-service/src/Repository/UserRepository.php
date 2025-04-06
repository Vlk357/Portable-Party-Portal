<?php

namespace App\Repository;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * @extends AbstractRepository<User>
 */
class UserRepository extends AbstractRepository
{
    public function __construct(EntityManagerInterface $entityManager)
    {
        parent::__construct($entityManager, User::class);
    }

    public function findByUsername(string $username): ?User
    {
        return $this->entityManager
            ->getRepository(User::class)
            ->findOneBy(['username' => $username]);
    }

    /**
     * Returns users with their roles and abilities filtered by module
     * @param string $module
     * @return array<User>
     */
    public function findUsersWithPermissionsByModule(string $module): array
    {
        $qb = $this->entityManager->createQueryBuilder();

        /** @var array<User> */
        $result = $qb->select('u')
            ->addSelect('r')
            ->addSelect('da')
            ->addSelect('ra')
            ->from(User::class, 'u')
            ->leftJoin('u.userAbilities', 'ua')
            ->leftJoin('ua.ability', 'da')
            ->leftJoin('u.roles', 'r')
            ->leftJoin('r.abilities', 'ra')
            ->where($qb->expr()->orX(
                $qb->expr()->eq('da.module', ':module'),
                $qb->expr()->eq('ra.module', ':module')
            ))
            ->setParameter('module', $module)
            ->groupBy('u.id')
            ->getQuery()
            ->getResult();

        return $result;
    }

    /**
     * Find users that have only the specified abilities and roles
     * @param array<int> $abilityIds List of allowed ability IDs
     * @param array<int> $roleIds List of allowed role IDs
     * @return array<User> Users matching the criteria
     */
    public function findUsersWithAbilitiesAndRoles(array $abilityIds, array $roleIds): array
    {
        $qb = $this->entityManager->createQueryBuilder();

        /**
         * @var array<User>
         */
        $users = $qb->select('u')
            ->from(User::class, 'u')
            ->leftJoin('u.userAbilities', 'ua')
            ->leftJoin('ua.ability', 'a')
            ->leftJoin('u.userRoles', 'ur')
            ->leftJoin('ur.role', 'r')
            ->where(
                $qb->expr()->orX(
                    $qb->expr()->in('a.id', ':abilityIds'),
                    $qb->expr()->in('r.id', ':roleIds')
                )
            )
            ->andWhere('NOT EXISTS (
                SELECT 1 FROM App\Entity\UserAbility ua2
                JOIN ua2.ability a2
                WHERE ua2.user = u.id
                AND a2.id NOT IN (:abilityIds)
            )')
            ->andWhere('NOT EXISTS (
                SELECT 1 FROM App\Entity\UserRole ur2
                JOIN ur2.role r2
                WHERE ur2.user = u.id
                AND r2.id NOT IN (:roleIds)
            )')
            ->setParameter('abilityIds', $abilityIds)
            ->setParameter('roleIds', $roleIds)
            ->groupBy('u.id')
            ->getQuery()
            ->getResult();

        return $users;
    }
}
