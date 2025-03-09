<?php

declare(strict_types=1);

namespace App\Service;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception;

class DatabaseService
{
    public function __construct(
        private readonly Connection $connection
    ) {
    }

    /**
     * @throws Exception
     */
    public function findUserByUsername(string $username): ?array
    {
        $queryBuilder = $this->connection->createQueryBuilder();

        $result = $queryBuilder
            ->select('*')
            ->from('users')
            ->where('username = :username')
            ->setParameter('username', $username)
            ->executeQuery();

        return $result->fetchAssociative() ?: null;
    }

    /**
     * @throws Exception
     */
    public function createUser(string $username, string $password, string $status = 'PENDING_ACTIVATION'): int
    {
        $queryBuilder = $this->connection->createQueryBuilder();

        $queryBuilder
            ->insert('users')
            ->values([
                'username' => ':username',
                'password' => ':password',
                'status' => ':status',
                'created_at' => ':created_at'
            ])
            ->setParameters([
                'username' => $username,
                'password' => $password,
                'status' => $status,
                'created_at' => (new \DateTimeImmutable())->format('Y-m-d H:i:s')
            ])
            ->executeQuery();

        return (int) $this->connection->lastInsertId();
    }

    /**
     * @throws Exception
     */
    public function getUserRoles(int $userId): array
    {
        $queryBuilder = $this->connection->createQueryBuilder();

        $result = $queryBuilder
            ->select('r.*')
            ->from('roles', 'r')
            ->join('r', 'user_roles', 'ur', 'ur.role_id = r.id')
            ->where('ur.user_id = :userId')
            ->setParameter('userId', $userId)
            ->executeQuery();

        return $result->fetchAllAssociative();
    }

    /**
     * @throws Exception
     */
    public function assignRole(int $userId, int $roleId): void
    {
        $queryBuilder = $this->connection->createQueryBuilder();

        $queryBuilder
            ->insert('user_roles')
            ->values([
                'user_id' => ':userId',
                'role_id' => ':roleId',
                'created_at' => ':created_at'
            ])
            ->setParameters([
                'userId' => $userId,
                'roleId' => $roleId,
                'created_at' => (new \DateTimeImmutable())->format('Y-m-d H:i:s')
            ])
            ->executeQuery();
    }

    /**
     * @throws Exception
     */
    public function getAllUsers(): array
    {
        $queryBuilder = $this->connection->createQueryBuilder();

        $result = $queryBuilder
            ->select('*')
            ->from('users')
            ->executeQuery();

        return $result->fetchAllAssociative();
    }
}
