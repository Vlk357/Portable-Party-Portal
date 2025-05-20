<?php

namespace App\Controller;

use App\Service\StreamingStateService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted; // Use attribute for security

#[Route('/admin/stream')]
#[IsGranted('ROLE_ADMIN')]
class AdminStreamController extends AbstractController
{
    public function __construct(private readonly StreamingStateService $streamingStateService) {}

    #[Route('/status', name: 'admin_stream_status', methods: ['GET'])]
    public function getStatus(): JsonResponse
    {
        return $this->json($this->streamingStateService->getCurrentStateForClient());
    }

    #[Route('/movies', name: 'admin_stream_movies', methods: ['GET'])]
    public function listMovies(): JsonResponse
    {
        return $this->json(['movies' => $this->streamingStateService->listAvailableMovies()]);
    }

    #[Route('/start', name: 'admin_stream_start', methods: ['POST'])]
    public function start(Request $request): JsonResponse
    {
        $data = $request->toArray();
        $manifestUrl = $data['manifestUrl'] ?? null;

        if (!$manifestUrl) {
            return $this->json(['error' => 'manifestUrl is required'], Response::HTTP_BAD_REQUEST);
        }

        // Basic validation - could add more checks here
        if (!is_string($manifestUrl) || empty($manifestUrl)) {
             return $this->json(['error' => 'Invalid manifestUrl'], Response::HTTP_BAD_REQUEST);
        }

        $this->streamingStateService->startStream($manifestUrl);
        return $this->json(['message' => 'Stream started', 'manifestUrl' => $manifestUrl]);
    }

    #[Route('/pause', name: 'admin_stream_pause', methods: ['POST'])]
    public function pause(): JsonResponse
    {
        $this->streamingStateService->pauseStream();
        return $this->json(['message' => 'Stream pause requested']);
    }

    #[Route('/resume', name: 'admin_stream_resume', methods: ['POST'])]
    public function resume(): JsonResponse
    {
        $this->streamingStateService->resumeStream();
        return $this->json(['message' => 'Stream resume requested']);
    }

    #[Route('/stop', name: 'admin_stream_stop', methods: ['POST'])]
    public function stop(): JsonResponse
    {
        $this->streamingStateService->stopStream();
        return $this->json(['message' => 'Stream stop requested']);
    }
}
