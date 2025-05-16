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
    ) {}

    public function __invoke(Request $request): GalleryItem
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

        $originalFilename = pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME);
        $safeFilename = $this->slugger->slug($originalFilename);
        // Ensure a unique filename to prevent overwrites
        $newFilename = $safeFilename.'-'.uniqid().'.'.$uploadedFile->guessExtension();

        try {
            $uploadedFile->move(
                $this->galleryUploadsDirectory,
                $newFilename
            );
            $this->logger->info(sprintf('File "%s" uploaded as "%s" by user "%s".', $uploadedFile->getClientOriginalName(), $newFilename, $user->getUserIdentifier()));
        } catch (\Exception $e) {
            $this->logger->error(sprintf('Failed to move uploaded file "%s": %s', $uploadedFile->getClientOriginalName(), $e->getMessage()));
            throw new \RuntimeException('Failed to save uploaded file.');
        }

        $galleryItem->setUserId($user->getUserIdentifier());
        $galleryItem->setOriginalFilename($uploadedFile->getClientOriginalName());
        $galleryItem->setStoredFilename($newFilename);
        $galleryItem->setMimeType($uploadedFile->getMimeType() ?? $uploadedFile->getClientMimeType());
        $galleryItem->setGalleryBaseUrl($this->galleryBaseUrl); // Set base URL for getPublicUrl()

        $this->entityManager->persist($galleryItem);
        $this->entityManager->flush();

        return $galleryItem;
    }
}