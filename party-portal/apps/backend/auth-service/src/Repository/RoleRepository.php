<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Role;
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
     * @return array<Role>
     */
    public function findByModule(string $module): array
    {
        return $this->entityManager
            ->getRepository(Role::class)
            ->findBy(['module' => $module]);
    }
}
