<?php

// Example usage in a controller
namespace App\Controller;

use App\Service\DatabaseService;
use App\Entity\Role;
use App\Entity\User;
use App\Enum\UserStatus;
use App\DTO\CreateUserDTO;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\Validator\Validator\ValidatorInterface;

class UserController extends AbstractController
{
    public function __construct(
        private readonly DatabaseService $db,
        private readonly ValidatorInterface $validator
    ) {
    }

    #[Route('/api/users', methods: ['GET'])]
    public function getAllUsers(): JsonResponse
    {
        try {
            $users = $this->db->getAllUsers();
            return $this->json($users); // Will automatically use jsonSerialize()
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/user/{username}', methods: ['GET'])]
    public function getUserByUsername(string $username): JsonResponse
    {
        $user = $this->db->findUserByUsername($username);
        if (!$user) {
            return $this->json(['error' => 'User not found'], 404);
        }

        // Roles are already managed by Doctrine
        return $this->json($user);
    }

    #[Route('/api/user', methods: ['POST'])]
    public function createUser(Request $request): JsonResponse
    {
        try {
            $dto = CreateUserDTO::fromJson($request->getContent());
            if (!$dto) {
                return $this->json(['error' => 'Invalid input'], 400);
            }

            // Validate DTO
            $violations = $this->validator->validate($dto);
            if (count($violations) > 0) {
                return $this->json(['errors' => $violations], 400);
            }

            $user = User::create($dto);
            $this->db->saveUser($user);

            return $this->json($user, 201);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], 409);
        } catch (\Exception $e) {
            return $this->json(['error' => 'Internal server error'], 500);
        }
    }
}
