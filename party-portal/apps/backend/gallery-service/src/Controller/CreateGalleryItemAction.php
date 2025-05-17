<?php

namespace App\Controller;

use App\Entity\GalleryItem;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;

// <-- CHANGED

#[AsController]
class CreateGalleryItemAction extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private ValidatorInterface $validator,
        private string $galleryUploadsDirectory,
        private string $galleryBaseUrl,
        private NormalizerInterface $normalizer, // <-- CHANGED type to NormalizerInterface
        private LoggerInterface $logger
    ) {
    }

    public function __invoke(Request $request): JsonResponse
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
            // Re-throw as a more generic runtime exception if you don't want to expose specifics
            throw new \RuntimeException('Failed to save uploaded file.', 0, $e);
        }

        $filePath = $this->galleryUploadsDirectory . '/' . $newFilename;

        $actualMimeType = mime_content_type($filePath);
        if ($actualMimeType === false) {
            $this->logger->warning('mime_content_type failed for: ' . $filePath . '. Falling back to client MIME type.');
            $actualMimeType = $uploadedFile->getClientMimeType();
        }

        $takenAt = null;
        $fileMimeType = (string) ($actualMimeType ?: $uploadedFile->getClientMimeType());

        if ($fileMimeType && (str_starts_with($fileMimeType, 'image/jpeg') || str_starts_with($fileMimeType, 'image/tiff'))) {
            if (function_exists('exif_read_data')) {
                $this->logger->info('Attempting to read EXIF data from: ' . $filePath);
                // Do not suppress errors. Handle the return value.
                // exif_read_data can return false and emit E_WARNING on failure.
                // We'll rely on Symfony's error handling to potentially convert warnings to exceptions,
                // or we'll check the return value.
                $exifData = exif_read_data($filePath);

                if ($exifData === false) {
                    $this->logger->warning('exif_read_data returned false or failed for file (it might not be a supported image or contain no EXIF data): ' . $filePath);
                } else {
                    $dateTimeOriginalStr = isset($exifData['DateTimeOriginal']) && is_string($exifData['DateTimeOriginal']) ? $exifData['DateTimeOriginal'] : null;
                    $dateTimeStr = isset($exifData['DateTime']) && is_string($exifData['DateTime']) ? $exifData['DateTime'] : null;

                    if ($dateTimeOriginalStr) {
                        try {
                            $takenAt = new \DateTimeImmutable($dateTimeOriginalStr);
                            $this->logger->info('EXIF DateTimeOriginal found: ' . $dateTimeOriginalStr);
                        } catch (\Exception $e) {
                            $this->logger->warning('Could not parse EXIF DateTimeOriginal: ' . $dateTimeOriginalStr, ['exception' => $e->getMessage()]);
                        }
                    } elseif ($dateTimeStr) {
                        try {
                            $takenAt = new \DateTimeImmutable($dateTimeStr);
                            $this->logger->info('EXIF DateTime found: ' . $dateTimeStr);
                        } catch (\Exception $e) {
                            $this->logger->warning('Could not parse EXIF DateTime: ' . $dateTimeStr, ['exception' => $e->getMessage()]);
                        }
                    } else {
                        $this->logger->info('No suitable DateTimeOriginal or DateTime EXIF tag found or they were not strings.');
                    }
                }
            } else {
                $this->logger->warning('exif_read_data function does not exist. Cannot read EXIF for images.');
            }
        } elseif ($fileMimeType && str_starts_with($fileMimeType, 'video/')) {
            $this->logger->info('Attempting to extract video creation time using ffprobe for: ' . $filePath);
            $escapedFilePath = escapeshellarg($filePath);
            $command = "ffprobe -v quiet -print_format json -show_entries format_tags=creation_time {$escapedFilePath}";
            $this->logger->info("Executing ffprobe command: {$command}");

            $output = shell_exec($command);

            if ($output === null || $output === false) {
                $this->logger->error('shell_exec for ffprobe failed, command not found, or produced no initial output. Ensure ffmpeg is installed and in PATH.', ['file' => $filePath, 'output_is_null' => $output === null, 'output_is_false' => $output === false]);
            } elseif (trim($output) === '') {
                $this->logger->warning('ffprobe command executed but produced no meaningful output (empty after trim).', ['file' => $filePath]);
            } else {
                $this->logger->info('ffprobe output: ' . $output);
                $videoMeta = json_decode($output, true);

                if (json_last_error() !== JSON_ERROR_NONE) {
                    $this->logger->error('Failed to decode JSON from ffprobe output.', ['json_error' => json_last_error_msg(), 'output' => substr($output, 0, 200)]);
                } elseif (
                    is_array($videoMeta) &&
                    isset($videoMeta['format']) && is_array($videoMeta['format']) && // Check 'format' is array
                    isset($videoMeta['format']['tags']) && is_array($videoMeta['format']['tags']) && // Check 'tags' is array
                    isset($videoMeta['format']['tags']['creation_time']) &&
                    is_string($videoMeta['format']['tags']['creation_time'])
                ) {
                    $creationTimeString = $videoMeta['format']['tags']['creation_time'];
                    try {
                        $takenAt = new \DateTimeImmutable($creationTimeString);
                        $this->logger->info('Video creation_time tag found: ' . $creationTimeString);
                    } catch (\Exception $e) {
                        $this->logger->error('Error parsing video creation_time: ' . $creationTimeString, ['exception' => $e->getMessage()]);
                    }
                } else {
                    // Determine the message based on the structure of $videoMeta
                    if (!is_array($videoMeta)) {
                        $tagsAvailableMessage = 'Decoded videoMeta is not an array.';
                    } elseif (!isset($videoMeta['format']) || !is_array($videoMeta['format'])) {
                        $tagsAvailableMessage = 'videoMeta is array, but no "format" key or "format" is not an array.';
                    } elseif (!isset($videoMeta['format']['tags']) || !is_array($videoMeta['format']['tags'])) {
                        $tagsAvailableMessage = '"format" key found and is array, but no "tags" sub-array or "tags" is not an array.';
                    } else {
                        // $videoMeta['format']['tags'] is set and is an array here
                        // This is the case where creation_time was not found or not a string in the main 'if'
                        $tagsAvailableMessage = 'Available tags in format.tags: ' . implode(', ', array_keys($videoMeta['format']['tags'])) . '. "creation_time" might be missing or not a string.';
                    }

                    $this->logger->info(
                        'Video metadata issue: ' . $tagsAvailableMessage,
                        ['video_meta_structure_type' => gettype($videoMeta)]
                    );
                }
            }
        }

        if ($takenAt === null) {
            $this->logger->info('takenAt could not be determined, defaulting to uploadedAt.');
            $takenAt = $galleryItem->getUploadedAt();
        }
        $galleryItem->setTakenAt($takenAt);
        $this->logger->info('Final takenAt set to: ' . ($takenAt ? $takenAt->format('Y-m-d H:i:s P') : 'NULL'));


        $galleryItem->setUserId($user->getUserIdentifier());
        $galleryItem->setOriginalFilename($uploadedFile->getClientOriginalName());
        $galleryItem->setStoredFilename($newFilename);
        $galleryItem->setMimeType($fileMimeType);

        $this->entityManager->persist($galleryItem);
        $this->entityManager->flush();
        $this->logger->info('GalleryItem persisted with ID: ' . $galleryItem->getId());

        $galleryItem->setGalleryBaseUrl($this->galleryBaseUrl);

        $normalizedData = $this->normalizer->normalize($galleryItem, 'jsonld', ['groups' => 'gallery:read']);

        if (!is_array($normalizedData)) {
            // This case should ideally not happen if normalization is successful for an object.
            $this->logger->error('Normalization did not result in an array as expected.', ['type' => gettype($normalizedData)]);
            // Fallback or throw an error, as the client expects a JSON object.
            // For now, let's return an empty object with an error status if this unlikely event occurs.
            return new JsonResponse(['error' => 'Failed to serialize gallery item data.'], JsonResponse::HTTP_INTERNAL_SERVER_ERROR);
        }
        $this->logger->info('GalleryItem normalized for JSON response.', ['normalized_data_keys' => array_keys($normalizedData)]);


        return new JsonResponse($normalizedData, JsonResponse::HTTP_CREATED);
    }
}
