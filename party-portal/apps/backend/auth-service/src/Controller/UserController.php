<?php

// Example usage in a controller
namespace App\Controller;

use App\Service\DatabaseService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class UserController extends AbstractController
{
    public function __construct(
        private readonly DatabaseService $db
    ) {
    }

    #[Route('/api/users', methods: ['GET'])]
    public function getAllUsers(): JsonResponse
    {
        try {
            $users = $this->db->getAllUsers();
            return $this->json($users);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/user/{username}', methods: ['GET'])]
    public function getUserByUsername(string $username): JsonResponse
    {
        try {
            $user = $this->db->findUserByUsername($username);
            if (!$user) {
                return $this->json(['error' => 'User not found'], 404);
            }

            $roles = $this->db->getUserRoles($user['id']);
            $user['roles'] = $roles;

            return $this->json($user);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }
}
