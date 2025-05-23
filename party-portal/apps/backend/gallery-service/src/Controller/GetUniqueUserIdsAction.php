<?php

namespace App\Controller;

use App\Repository\GalleryItemRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Annotation\Route; // Import Route

#[AsController]
class GetUniqueUserIdsAction extends AbstractController
{
    public function __construct(private GalleryItemRepository $galleryItemRepository) {}

    // It's often better to define the route directly on the action for custom operations
    // if not using API Platform's resource operation definition for this specific case.
    // However, to keep it aligned with API Platform style, we'll define it as a custom operation on the resource.
    public function __invoke(): JsonResponse
    {
        $userIds = $this->galleryItemRepository->findUniqueUserIds();
        return $this->json($userIds);
    }
}