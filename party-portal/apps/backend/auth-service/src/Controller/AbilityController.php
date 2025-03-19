<?php

namespace App\Controller;

use App\DTO\UpdateAbilityDTO;
use App\Entity\Ability;
use App\Service\DatabaseService;
use App\DTO\CreateAbilityDTO;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use OpenApi\Annotations as OA;

class AbilityController extends AbstractController
{
    public function __construct(
        private readonly DatabaseService $db
    ) {
    }

    #[Route('/api/ability', methods: ['GET'])]
    public function getAllAbilities(): JsonResponse
    {
        try {
            // Check if user has permission to list abilities
            if (!$this->isGranted('AUTH:ABILITY:READ')) {
                throw $this->createAccessDeniedException();
            }

            $abilities = $this->db->getAllAbilities();
            return $this->json($abilities);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/ability', methods: ['POST'])]
    public function createAbility(Request $request): JsonResponse
    {
        try {
            if (!$this->isGranted('AUTH:ABILITY:CREATE')) {
                throw $this->createAccessDeniedException();
            }

            $data = json_decode(
                $request->getContent(),
                true,
                512,
                JSON_THROW_ON_ERROR
            );


            if (!is_array($data)) {
                throw new \InvalidArgumentException('Invalid JSON format');
            }

            /**
             * @var array{
             *   module?: string,
             *  resource?: string,
             * action?: string,
             * resourceConstraint?: string,
             * description?: string
             * } $validatedData
             */
            $validatedData = array_filter(
                $data,
                fn($key) => in_array($key, ['module', 'resource', 'action', 'resourceConstraint', 'description'], true),
                ARRAY_FILTER_USE_KEY
            );

            $abilityDTO = CreateAbilityDTO::fromArray($validatedData);
            $ability = new Ability(
                $abilityDTO->module,
                $abilityDTO->resource,
                $abilityDTO->action,
                $abilityDTO->resourceConstraint,
                $abilityDTO->description
            );

            $this->db->createAbility($ability);
            return $this->json($ability, 201);
        } catch (\JsonException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/ability/{id}', methods: ['GET'])]
    public function getAbility(int $id): JsonResponse
    {
        try {
            if (!$this->isGranted('AUTH:ABILITY:READ')) {
                throw $this->createAccessDeniedException();
            }

            $ability = $this->db->findAbilityById($id);
            if (!$ability) {
                return $this->json(['error' => 'Ability not found'], 404);
            }

            return $this->json($ability);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/ability/{id}', methods: ['PUT'])]
    public function updateAbility(int $id, Request $request): JsonResponse
    {
        try {
            if (!$this->isGranted('AUTH:ABILITY:UPDATE')) {
                throw $this->createAccessDeniedException();
            }

            $ability = $this->db->findAbilityById($id);
            if (!$ability) {
                return $this->json(['error' => 'Ability not found'], 404);
            }

            $data = json_decode(
                $request->getContent(),
                true,
                512,
                JSON_THROW_ON_ERROR
            );


            if (!is_array($data)) {
                throw new \InvalidArgumentException('Invalid JSON format');
            }

            /** @var array{
             *     module?: 'AUTH'|'CHAT'|'GALLERY'|'VIDEO',
             *     resource?: string,
             *     action?: 'CREATE'|'DELETE'|'MANAGE'|'READ'|'UPDATE',
             *     resourceConstraint?: string,
             *     description?: string
             * } $validatedData
             */
            $validatedData = array_filter(
                $data,
                fn($key) => in_array($key, ['module', 'resource', 'action', 'resourceConstraint', 'description'], true),
                ARRAY_FILTER_USE_KEY
            );

            $abilityDTO = UpdateAbilityDTO::fromArray($validatedData);

            if ($abilityDTO->module) {
                $ability->setModule($abilityDTO->module);
            }
            if ($abilityDTO->resource) {
                $ability->setResource($abilityDTO->resource);
            }
            if ($abilityDTO->action) {
                $ability->setAction($abilityDTO->action);
            }
            if ($abilityDTO->resourceConstraint) {
                $ability->setResourceConstraint($abilityDTO->resourceConstraint);
            }
            if ($abilityDTO->description) {
                $ability->setDescription($abilityDTO->description);
            }

            $this->db->updateAbility($ability);
            return $this->json($ability);
        } catch (\JsonException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/ability/{id}', methods: ['DELETE'])]
    public function deleteAbility(int $id): JsonResponse
    {
        try {
            if (!$this->isGranted('AUTH:ABILITY:DELETE')) {
                throw $this->createAccessDeniedException();
            }

            $ability = $this->db->findAbilityById($id);
            if (!$ability) {
                return $this->json(['error' => 'Ability not found'], 404);
            }

            $this->db->deleteAbility($ability);
            return $this->json(null, 204);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/ability/search', methods: ['GET'])]
    public function searchAbilities(Request $request): JsonResponse
    {
        try {
            if (!$this->isGranted('AUTH:ABILITY:READ')) {
                throw $this->createAccessDeniedException();
            }

            $module = $request->query->get('module');
            $resource = $request->query->get('resource');
            $action = $request->query->get('action');

            $abilities = $this->db->findAbilitiesByFilters(
                is_string($module) ? $module : null,
                is_string($resource) ? $resource : null,
                is_string($action) ? $action : null
            );
            return $this->json($abilities);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }
}