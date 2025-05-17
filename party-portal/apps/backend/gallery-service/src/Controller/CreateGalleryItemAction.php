<?php

namespace App\Controller;

use App\Entity\GalleryItem;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse; // <-- Add this
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Serializer\SerializerInterface; // <-- Add this

#[AsController]
class CreateGalleryItemAction extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private ValidatorInterface $validator,
        private string $galleryUploadsDirectory,
        private string $galleryBaseUrl,      // <-- Add this back
        private SerializerInterface $serializer, // <-- Add this
        private LoggerInterface $logger
    ) {
    }

    public function __invoke(Request $request): JsonResponse // <-- Change return type
    {
        $this->logger->info('CreateGalleryItemAction invoked.');

        $uploadedFile = $request->files->get('file');
        $user = $this->getUser();

        if (!$user instanceof UserInterface) {
            $this->logger->warning('User not authenticated or not UserInterface.');
            throw $this->createAccessDeniedException('User not authenticated.');
        }
        $this->logger->info('User authenticated: ' . $user->getUserIdentifier());


        if (!$uploadedFile instanceof UploadedFile) {
            $this->logger->error('No file uploaded or invalid file data.');
            throw new BadRequestHttpException('"file" is required');
        }
        $this->logger->info('File uploaded: ' . $uploadedFile->getClientOriginalName());


        $galleryItem = new GalleryItem();
        $galleryItem->file = $uploadedFile; 

        $errors = $this->validator->validate($galleryItem, null, ['gallery:write']);
        if (count($errors) > 0) {
            $errorMessages = [];
            foreach ($errors as $error) {
                $errorMessages[] = $error->getPropertyPath() . ': ' . $error->getMessage();
            }
            $this->logger->error('Validation failed for GalleryItem.', ['errors' => $errorMessages]);
            throw new BadRequestHttpException(implode(', ', $errorMessages));
        }
        $this->logger->info('GalleryItem validated successfully.');


        $originalFilename = pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME);
        $safeFilename = transliterator_transliterate('Any-Latin; Latin-ASCII; [^A-Za-z0-9_.-] remove; Lower()', $originalFilename);
        $newFilename = $safeFilename . '-' . uniqid() . '.' . $uploadedFile->guessExtension();

        try {
            $uploadedFile->move($this->galleryUploadsDirectory, $newFilename);
            $this->logger->info('File moved successfully to: ' . $this->galleryUploadsDirectory . '/' . $newFilename);
        } catch (\Exception $e) {
            $this->logger->error('Failed to move uploaded file.', ['exception' => $e->getMessage()]);
            throw new \RuntimeException('Failed to save uploaded file: ' . $e->getMessage(), 500, $e);
        }

        $galleryItem->setUserId($user->getUserIdentifier());
        $galleryItem->setOriginalFilename($uploadedFile->getClientOriginalName());
        $galleryItem->setStoredFilename($newFilename);
        
        $actualMimeType = mime_content_type($this->galleryUploadsDirectory . '/' . $newFilename);
        $galleryItem->setMimeType($actualMimeType ?: $uploadedFile->getClientMimeType());
        
        $this->entityManager->persist($galleryItem);
        $this->entityManager->flush();
        $this->logger->info('GalleryItem persisted with ID: ' . $galleryItem->getId());

        // Manually set the galleryBaseUrl on the entity before normalization for the response
        // This ensures getPublicUrl() works correctly when serialized.
        $galleryItem->setGalleryBaseUrl($this->galleryBaseUrl);

        // Normalize the entity to an array, respecting serialization groups.
        // Use 'jsonld' context if your frontend expects it, or 'json' for a simpler array.
        // The 'gallery:read' group should match what API Platform uses for GET responses.
        $normalizedData = $this->serializer->normalize($galleryItem, 'jsonld', ['groups' => 'gallery:read']);
        
        $this->logger->info('GalleryItem normalized for JSON response.', ['normalized_data_keys' => array_keys($normalizedData)]);

        return new JsonResponse($normalizedData, JsonResponse::HTTP_CREATED);
    }
}