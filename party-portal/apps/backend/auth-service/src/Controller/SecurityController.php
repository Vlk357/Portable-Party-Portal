<?php

namespace App\Controller;

use App\Service\JwtManager;
use App\Service\ServiceCredentialsManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use App\Entity\User;

class SecurityController extends AbstractController
{
    private JwtManager $jwtManager;
    private ServiceCredentialsManager $serviceCredentialsManager;

    public function __construct(
        JwtManager $jwtManager,
        ServiceCredentialsManager $serviceCredentialsManager
    ) {
        $this->jwtManager = $jwtManager;
        $this->serviceCredentialsManager = $serviceCredentialsManager;
    }

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

    #[Route('/api/service-token', methods: ['POST'])]
    public function getServiceToken(Request $request): JsonResponse
    {
        // Try to get credentials from request data (form or JSON)
        $content = $request->getContent();
        $data = [];
        
        if (!empty($content) && $request->headers->get('Content-Type') === 'application/json') {
            $data = json_decode($content, true);
            $serviceId = $data['service_id'] ?? null;
            $serviceSecret = $data['service_secret'] ?? null;
        } else {
            // Read from form data
            $serviceId = $request->request->get('service_id');
            $serviceSecret = $request->request->get('service_secret');
        }
    
        // Validate that both values are strings and not null
        if (!is_string($serviceId) || !is_string($serviceSecret) || empty($serviceId) || empty($serviceSecret)) {
            return $this->json(['error' => 'Missing or invalid service credentials'], 400);
        }
    
        // Check credentials
        if (!$this->serviceCredentialsManager->validateCredentials($serviceId, $serviceSecret)) {
            return $this->json(['error' => 'Invalid service credentials'], 401);
        }
    
        // Generate a long-lived JWT with service claims
        $token = $this->jwtManager->createFromService($serviceId);
    
        return $this->json(['token' => $token]);
    }
}
