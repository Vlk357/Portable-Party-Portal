<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\PermissionService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/permissions')]
class PermissionController extends AbstractController
{
    public function __construct(
        private readonly PermissionService $permissionService
    ) {
    }

    #[Route('/{module}', methods: ['GET'])]
    public function getModulePermissions(string $module): JsonResponse
    {
        $this->denyAccessUnlessGranted('AUTH:PERMISSIONS:READ');

        return $this->json([
            'roles' => $this->permissionService->getRolesByModule($module),
            'abilities' => $this->permissionService->getAbilitiesByModule($module),
            'users' => $this->permissionService->getUsersByModule($module),
        ]);
    }

    #[Route('', methods: ['GET'])]
    public function helloController(): JsonResponse
    {
        return $this->json([
            'message' => 'Hello from PermissionController!',
        ]);
    }
}
