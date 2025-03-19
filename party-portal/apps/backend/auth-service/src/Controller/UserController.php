<?php

// Example usage in a controller
namespace App\Controller;

use App\Exception\DTOValidationException;
use App\Exception\ValidationException;
use App\Service\DatabaseService;
use App\Entity\Role;
use App\Entity\User;
use App\Enum\UserStatus;
use App\DTO\CreateUserDTO;
use App\DTO\LoginDTO;
use App\Service\UserService;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;

class UserController extends AbstractController
{
    public function __construct(
        private readonly DatabaseService $db,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly JWTTokenManagerInterface $jwtManager,
        private readonly UserService $userService
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

    #[Route('/api/user/{id}', methods: ['GET'])]
    public function getUserById(int $id): JsonResponse
    {
        $user = $this->db->findUserById($id);
        if (!$user) {
            return $this->json(['error' => 'User not found'], 404);
        }

        // Check if user can read any user or only themselves
        if (
            !$this->isGranted('AUTH:USER:READ') &&
            !$this->isGranted('AUTH:USER:READ:OWN', $user)
        ) {
            throw $this->createAccessDeniedException();
        }

        return $this->json($user);
    }

    #[Route('/api/user', methods: ['POST'])]
    public function createUser(Request $request): JsonResponse
    {
        try {
            $dto = CreateUserDTO::fromJson($request->getContent());

            $user = $this->userService->createUser(
                username: $dto->username,
                password: $dto->password,
                status: $dto->status,
                roles: $dto->roles,
                abilities: $dto->abilities
            );

            return $this->json($user, 201);
        } catch (DTOValidationException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (ValidationException $e) {
            return $this->json([
                'error' => 'Validation failed',
                'violations' => $e->getFormattedViolations()
            ], 400);
        } catch (\Exception $e) {
            return $this->json(['error' => 'Internal server error'], 500);
        }
    }

    #[Route('/api/login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        try {
            $dto = LoginDTO::fromJson($request->getContent());
            if (!$dto) {
                return $this->json(['error' => 'Invalid input'], 400);
            }

            // Find user
            $user = $this->db->findUserByUsername($dto->username);
            if (!$user) {
                return $this->json(['error' => 'Invalid credentials'], 401);
            }

            // Verify password
            if (!$this->passwordHasher->isPasswordValid($user, $dto->password)) {
                return $this->json(['error' => 'Invalid credentials'], 401);
            }

            // Generate token
            $token = $this->jwtManager->create($user);

            return $this->json([
                'token' => $token,
                'user' => $user
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => 'Internal server error', 'exception' => $e->getMessage()], 500);
        }
    }
}
