<?php

namespace App\Controller;

use App\Service\StreamingStateService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/stream')]
class ApiStreamController extends AbstractController
{
     public function __construct(private readonly StreamingStateService $streamingStateService) {}

    #[Route('/info', name: 'api_stream_info', methods: ['GET'])]
    public function getInfo(): JsonResponse
    {
        // This method calculates the current time if playing
        return $this->json($this->streamingStateService->getCurrentStateForClient());
    }
}
