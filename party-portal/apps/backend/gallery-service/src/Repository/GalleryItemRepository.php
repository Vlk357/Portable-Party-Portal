<?php

namespace App\Repository;

use App\Entity\GalleryItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<GalleryItem>
 */
class GalleryItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, GalleryItem::class);
    }

    /**
     * @return string[] Returns an array of unique user IDs
     */
    public function findUniqueUserIds(): array
    {
        $qb = $this->createQueryBuilder('gi');
        $qb->select('DISTINCT gi.userId')
           ->orderBy('gi.userId', 'ASC');

        $result = $qb->getQuery()->getResult();

        // The result might be an array of arrays, e.g., [['userId' => 'user1'], ['userId' => 'user2']]
        // We need a flat array of strings.
        return array_map(function($row) {
            return $row['userId'];
        }, $result);
    }
}
