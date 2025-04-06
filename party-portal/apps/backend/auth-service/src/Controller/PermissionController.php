<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Ability;
use App\Entity\Role;
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
        $this->denyAccessUnlessGranted('AUTH:ABILITY:READ');
        $this->denyAccessUnlessGranted('AUTH:ROLE:READ');
        $this->denyAccessUnlessGranted('AUTH:USER:READ');

        $moduleAbilities = $this->permissionService->getAbilitiesByModule($module);

        $abilityIds = array_map(fn(Ability $ability) => $ability->getId(), $moduleAbilities);
        $abilityIds = array_filter($abilityIds, fn($id) => $id !== null);

        $roles = $this->permissionService->getRolesByAbilities($abilityIds);

        $roleIds = array_map(fn(Role $role) => $role->getId(), $roles);
        $roleIds = array_filter($roleIds, fn($id) => $id !== null);

        return $this->json([
            'roles' => $roles,
            'abilities' => $moduleAbilities,
            'users' => $this->permissionService->getUsersByAbilitiesAndRoles($abilityIds, $roleIds),
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
