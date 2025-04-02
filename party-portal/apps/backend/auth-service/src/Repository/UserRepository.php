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
}
