<?php

namespace App\Controller;

use App\Entity\GalleryItem;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Security\Core\User\UserInterface; // For type hinting $this->getUser()
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Psr\Log\LoggerInterface;


#[AsController]
class CreateGalleryItemAction extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private ValidatorInterface $validator,
        private string $galleryUploadsDirectory, // Keep this
        // private string $galleryBaseUrl,      // REMOVE THIS LINE
        private LoggerInterface $logger
    ) {
    }

    public function __invoke(Request $request): GalleryItem
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
        $galleryItem->file = $uploadedFile; // Assign for validation

        // Validate the GalleryItem entity (including the file assertions)
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


        // Generate a unique filename
        $originalFilename = pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME);
        // Sanitize filename (optional, but good practice)
        $safeFilename = transliterator_transliterate('Any-Latin; Latin-ASCII; [^A-Za-z0-9_.-] remove; Lower()', $originalFilename);
        $newFilename = $safeFilename . '-' . uniqid() . '.' . $uploadedFile->guessExtension();

        // Move the file to the target directory
        try {
            $uploadedFile->move($this->galleryUploadsDirectory, $newFilename);
            $this->logger->info('File moved successfully to: ' . $this->galleryUploadsDirectory . '/' . $newFilename);
        } catch (\Exception $e) {
            $this->logger->error('Failed to move uploaded file.', ['exception' => $e->getMessage()]);
            // Consider throwing a more specific exception or handling it
            throw new \RuntimeException('Failed to save uploaded file: ' . $e->getMessage(), 500, $e);
        }

        // Populate the entity
        $galleryItem->setUserId($user->getUserIdentifier());
        $galleryItem->setOriginalFilename($uploadedFile->getClientOriginalName());
        $galleryItem->setStoredFilename($newFilename);
        
        $actualMimeType = mime_content_type($this->galleryUploadsDirectory . '/' . $newFilename);
        $galleryItem->setMimeType($actualMimeType ?: $uploadedFile->getClientMimeType());
        
        // $galleryItem->setGalleryBaseUrl($this->galleryBaseUrl); // This line should already be removed/commented

        $this->entityManager->persist($galleryItem);
        $this->entityManager->flush();
        $this->logger->info('GalleryItem persisted with ID: ' . $galleryItem->getId());

        return $galleryItem; // API Platform will handle serialization
    }
}