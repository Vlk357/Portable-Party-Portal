<?php

// Example usage in a controller
namespace App\Controller;

use App\Exception\DTOValidationException;
use App\Exception\EntityNotFoundException;
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
// use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
// use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;

#[Route('/api/user')]
/**
 * UserController handles user-related actions such as creating users,
 * retrieving user information, and managing user permissions.
 */
class UserController extends AbstractController
{
    public function __construct(
        private readonly DatabaseService $db,
        // private readonly UserPasswordHasherInterface $passwordHasher,
        // private readonly JWTTokenManagerInterface $jwtManager,
        private readonly UserService $userService
    ) {
    }

    #[Route('', methods: ['GET'])]
    public function getAllUsers(): JsonResponse
    {
        try {
            $users = $this->db->getAllUsers();
            return $this->json($users); // Will automatically use jsonSerialize()
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/{id<\d+>}', methods: ['GET'])]
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

    #[Route('/self', name: 'api_user_self', methods: ['GET'])]
    public function getUserSelf(): JsonResponse
    {
        $user = $this->getUser();

        if (!$user) {
            throw $this->createAccessDeniedException('No authenticated user found');
        }

        return $this->json($user);
    }

    #[Route('', methods: ['POST'])]
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

    #[Route('/user/{userId<\d+>}/ability', methods: ['POST'])]
    public function addUserAbility(int $userId, Request $request): JsonResponse
    {
        $this->denyAccessUnlessGranted('AUTH:ABILITY:ASSIGN');

        try {
            $requestData = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

            if (
                !is_array($requestData) ||
                !array_key_exists('ability_id', $requestData) ||
                !is_int($requestData['ability_id'])
            ) {
                return $this->json(['error' => 'Valid ability ID not provided'], 400);
            }

            $abilityId = $requestData['ability_id'];

            $this->userService->addUserAbility($userId, $abilityId);
        } catch (\JsonException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (EntityNotFoundException $e) {
            return $this->json(['error' => $e->getMessage()], 404);
        } catch (\Exception $e) {
            return $this->json(['error' => 'Internal server error'], 500);
        }

        return $this->json(['status' => 'success']);
    }

    #[Route('/user/{userId<\d+>}/ability', methods: ['GET'])]
    public function getUserAbilities(int $userId): JsonResponse
    {
        // TODO: Check if user can read any user or only themselves, handle correctly OWN definition
        $this->denyAccessUnlessGranted('AUTH:USER:READ:OWN');

        $abilities = $this->userService->getUserAbilities($userId);
        return $this->json($abilities);
    }

    #[Route('/user/{userId<\d+>}/ability', methods: ['PUT'])]
    public function updateUserAbility(int $userId, Request $request): JsonResponse
    {
        $this->denyAccessUnlessGranted('AUTH:ABILITY:ASSIGN');

        $requestData = json_decode($request->getContent(), true);

        // Explicit type checking
        if (
            !is_array($requestData) ||
            !array_key_exists('ability_id', $requestData) ||
            !is_int($requestData['ability_id'])
        ) {
            return $this->json(['error' => 'Valid ability ID not provided'], 400);
        }

        $abilityId = $requestData['ability_id'];
        $this->userService->updateUserAbility($userId, $abilityId);

        return $this->json(['status' => 'success']);
    }

    #[Route('/user/{userId<\d+>}/ability/{abilityId<\d+>}', methods: ['DELETE'])]
    public function removeUserAbility(int $userId, int $abilityId): JsonResponse
    {
        $this->denyAccessUnlessGranted('AUTH:ABILITY:ASSIGN');

        try {
            $this->userService->removeUserAbility($userId, $abilityId);
        } catch (EntityNotFoundException $e) {
            return $this->json(['error' => $e->getMessage()], 404);
        } catch (\Exception $e) {
            return $this->json(['error' => 'Internal server error'], 500);
        }
        return $this->json(['status' => 'success']);
    }
}
