<?php

// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/backend/auth-service/src/Controller/SecurityController.php

namespace App\Controller;

use App\Service\ServiceCredentialsManager;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use App\Entity\User;
use App\Repository\UserRepository;
use Lexik\Bundle\JWTAuthenticationBundle\Encoder\JWTEncoderInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Exception\JWTDecodeFailureException;
use Psr\Log\LoggerInterface;

class SecurityController extends AbstractController
{
    #[Route('/api/login', name: 'app_login', methods: ['POST'])]
    public function login(#[CurrentUser] ?User $user): JsonResponse
    {
        throw new \LogicException('This method should not be reached! - SecurityController::login()');
    }

    #[Route('/api/logout', name: 'app_logout', methods: ['POST'])]
    public function logout(): void
    {
        // This method can be empty - it will be intercepted by the logout key on your firewall
        throw new \LogicException('This method should not be reached! - SecurityController::logout()');
    }

    #[Route('/api/token/refresh', name: 'token_refresh', methods: ['POST'])]
    public function refresh(): void
    {
        throw new \LogicException('This method should not be reached! - SecurityController::refresh()');
    }

    #[Route('/api/token/validate', name: 'validate_token', methods: ['POST'])]
    public function validateToken(
        Request $request,
        JWTEncoderInterface $jwtEncoder,
        UserRepository $userRepository,
        LoggerInterface $logger
    ): JsonResponse {
        // Get the token from request
        $content = json_decode($request->getContent(), true);

        // Type-safe check for token
        if (!is_array($content) || !isset($content['token']) || !is_string($content['token']) || empty($content['token'])) {
            $logger->warning('Token validation failed: Token not provided or invalid format');
            return $this->json([
                'valid' => false,
                'message' => 'Token not provided or invalid format'
            ], 400);
        }

        $token = $content['token'];

        try {
            // Decode and validate the token
            $decodedToken = $jwtEncoder->decode($token);

            // Get user info with type-safe checks
            if (!isset($decodedToken['username']) || !is_string($decodedToken['username']) || empty($decodedToken['username'])) {
                $logger->warning('Token validation failed: Username missing or invalid in token');
                return $this->json([
                    'valid' => false,
                    'message' => 'Invalid token format: username missing or invalid'
                ], 400);
            }

            $username = $decodedToken['username'];

            // Find the user (optional but useful for getting the correct ID)
            $user = $userRepository->findByUsername($username);

            if (!$user) {
                $logger->warning('Token validation failed: User not found', ['username' => $username]);
                return $this->json([
                    'valid' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Extract expiration time with type safety
            $exp = null;
            if (isset($decodedToken['exp'])) {
                // First check if it's a numeric value that can be safely cast
                if (is_numeric($decodedToken['exp'])) {
                    $exp = (int)$decodedToken['exp'];
                } else {
                    $logger->warning('Token validation: Expiration value is not numeric', [
                        'exp_type' => gettype($decodedToken['exp'])
                    ]);
                    // Continue processing anyway, keeping exp as null
                }
            }
            $logger->info('Token validation successful', [
                'userId' => $user->getId(),
                'username' => $username
            ]);

            // Return validation result with user info
            return $this->json([
                'valid' => true,
                'userId' => $user->getId(),
                'username' => $username,
                'exp' => $exp,
                // 'roles' => $decodedToken['roles'] ?? []
            ]);
        } catch (JWTDecodeFailureException $e) {
            // Handle different failure reasons
            $reason = $e->getReason();

            if ($reason === JWTDecodeFailureException::EXPIRED_TOKEN) {
                $logger->info('Token validation failed: Expired token');
                return $this->json([
                    'valid' => false,
                    'message' => 'Expired token'
                ], 401);
            }

            $logger->warning('Token validation failed: Invalid token', [
                'reason' => $reason,
                'message' => $e->getMessage()
            ]);

            return $this->json([
                'valid' => false,
                'message' => 'Invalid token'
            ], 401);
        } catch (\Exception $e) {
            // Detailed logging for unexpected errors
            $logger->error('Token validation failed with unexpected error', [
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return $this->json([
                'valid' => false,
                'message' => 'Error validating token: ' . $e->getMessage()
            ], 500);
        }
    }
}
