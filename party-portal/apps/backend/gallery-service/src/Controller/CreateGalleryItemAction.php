<?php

namespace App\Controller;

use App\Entity\GalleryItem;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\String\Slugger\SluggerInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse; // Add this
use Symfony\Component\HttpFoundation\Response; // Add this

#[AsController]
class CreateGalleryItemAction extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private SluggerInterface $slugger,
        private ValidatorInterface $validator,
        private string $galleryUploadsDirectory, // Injected from services.yaml
        private string $galleryBaseUrl,          // Injected from services.yaml
        private LoggerInterface $logger
    ) {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $uploadedFile = $request->files->get('file');

        if (!$uploadedFile) {
            throw new BadRequestHttpException('"file" is required in multipart/form-data.');
        }
        if (!$uploadedFile instanceof UploadedFile) {
            throw new BadRequestHttpException('"file" must be a valid uploaded file.');
        }

        $user = $this->getUser();
        if (!$user instanceof UserInterface) {
            // This should be caught by the firewall, but good to double-check
            $this->logger->warning('CreateGalleryItemAction invoked without authenticated user.');
            throw $this->createAccessDeniedException('User not authenticated to upload files.');
        }

        $galleryItem = new GalleryItem();
        $galleryItem->file = $uploadedFile; // Assign for validation

        // Validate the UploadedFile using constraints on the GalleryItem::$file property
        $violations = $this->validator->validateProperty($galleryItem, 'file', ['gallery:write']);
        if (count($violations) > 0) {
            $errorMessages = [];
            foreach ($violations as $violation) {
                $errorMessages[] = $violation->getMessage();
            }
            throw new BadRequestHttpException(implode("\n", $errorMessages));
        }

        // Get MIME type and extension BEFORE moving the file
        $actualMimeType = $uploadedFile->getMimeType(); // This uses MimeTypeGuesser
        $actualExtension = $uploadedFile->guessExtension(); // Guess extension based on MIME type or client info

        if (!$actualExtension) {
            // Fallback or handle error if extension cannot be guessed
            // For example, from client original name, but be cautious
            $actualExtension = $uploadedFile->getClientOriginalExtension();
            if (!$actualExtension) {
                // If still no extension, you might want to throw an error or default
                $this->logger->warning(sprintf('Could not determine extension for uploaded file "%s".', $uploadedFile->getClientOriginalName()));
                // Consider throwing an error or using a default extension if appropriate
                // For now, let's try to proceed if possible, or throw:
                // throw new BadRequestHttpException('Could not determine file extension.');
                // As a last resort, try to get it from the original filename, though less reliable
                $actualExtension = pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_EXTENSION);
            }
        }


        $originalFilename = pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME);
        $safeFilename = $this->slugger->slug($originalFilename);
        // Ensure a unique filename to prevent overwrites
        $newFilename = $safeFilename . '-' . uniqid() . '.' . $actualExtension;


        try {
            $uploadedFile->move(
                $this->galleryUploadsDirectory,
                $newFilename
            );
            $this->logger->info(sprintf('File "%s" uploaded as "%s" by user "%s".', $uploadedFile->getClientOriginalName(), $newFilename, $user->getUserIdentifier()));
        } catch (\Exception $e) {
            $this->logger->error(sprintf('Failed to move uploaded file "%s": %s', $uploadedFile->getClientOriginalName(), $e->getMessage()));
            // It's better to throw a more specific exception or rethrow with context
            throw new \RuntimeException(sprintf('Failed to save uploaded file: %s', $e->getMessage()), 0, $e);
        }

        $galleryItem->setUserId($user->getUserIdentifier());
        $galleryItem->setOriginalFilename($uploadedFile->getClientOriginalName());
        $galleryItem->setStoredFilename($newFilename);
        $galleryItem->setMimeType($actualMimeType ?? $uploadedFile->getClientMimeType()); // Use the determined MIME type
        $galleryItem->setGalleryBaseUrl($this->galleryBaseUrl); // Set base URL for getPublicUrl()

        $this->entityManager->persist($galleryItem);
        $this->entityManager->flush();

        // return $galleryItem; // Original line

        // Temporary: Manually create a JsonResponse
        return $this->json($galleryItem, Response::HTTP_CREATED, [], ['groups' => 'gallery:read']);
    }
}