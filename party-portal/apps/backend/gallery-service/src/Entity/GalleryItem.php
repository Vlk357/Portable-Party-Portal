<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Get; // <-- Add this
use ApiPlatform\OpenApi\Model;
use App\Controller\CreateGalleryItemAction;
use App\Controller\GetUniqueUserIdsAction;
use App\Repository\GalleryItemRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\HttpFoundation\File\File;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter; // <-- Add this
use ApiPlatform\Doctrine\Orm\Filter\DateFilter;   // <-- Add this
use ApiPlatform\Metadata\ApiFilter;

#[ORM\Entity(repositoryClass: GalleryItemRepository::class)]
#[ORM\Table(name: "gallery_items")]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    operations: [
        new GetCollection( // This is the standard collection endpoint
            normalizationContext: ['groups' => ['gallery:read']],
            paginationItemsPerPage: 9
        ),
        new Get( // Custom operation for unique user IDs, changed from GetCollection
            uriTemplate: '/gallery_items/user_ids',
            controller: GetUniqueUserIdsAction::class,
            // No provider needed as the controller fetches and returns data directly.
            // read: false, // With a custom controller and Get (not GetCollection), 'read' might not be necessary or could behave differently. Let's test without it first.
            // deserialize: false, // Typically for POST/PUT, not strictly needed for GET but harmless.
            // validate: false, // No validation needed.
            paginationEnabled: false, // Explicitly disable pagination
            openapi: new Model\Operation( // Define OpenAPI schema for the response
                summary: 'Retrieves the list of unique user IDs that have uploaded gallery items.',
                responses: [
                    '200' => [
                        'description' => 'Array of unique user IDs.',
                        'content' => [
                            'application/json' => [
                                'schema' => [
                                    'type' => 'array',
                                    'items' => ['type' => 'string'],
                                ],
                                'example' => ['user1', 'user2', 'Kanafasek123']
                            ]
                        ]
                    ]
                ]
            ),
            name: 'get_unique_user_ids'
        ),
        new Post(
            controller: CreateGalleryItemAction::class,
            denormalizationContext: ['groups' => ['gallery:write']],
            normalizationContext: ['groups' => ['gallery:read']],
            deserialize: false,
            description: 'Upload an image or video file.',
            openapi: new Model\Operation(
                summary: 'Upload a new gallery item.',
                requestBody: new Model\RequestBody(
                    content: new \ArrayObject([
                        'multipart/form-data' => [
                            'schema' => [
                                'type' => 'object',
                                'properties' => [
                                    'file' => [
                                        'type' => 'string',
                                        'format' => 'binary',
                                        'description' => 'The file to upload.'
                                    ],
                                ]
                            ]
                        ]
                    ])
                )
            )
        )
    ],
    order: ['takenAt' => 'DESC', 'id' => 'DESC'],
    normalizationContext: ['groups' => ['gallery:read']],
    denormalizationContext: ['groups' => ['gallery:write']]
)]
#[ApiFilter(OrderFilter::class, properties: [
    'id',
    'userId',
    'originalFilename',
    'mimeType',
    'uploadedAt',
    'takenAt'
])]
#[ApiFilter(SearchFilter::class, properties: [ // Filter by exact match
    'userId' => 'exact',
    'mimeType' => 'exact'
])]
#[ApiFilter(DateFilter::class, properties: [
    'uploadedAt' => DateFilter::EXCLUDE_NULL, // Allows 'uploadedAt[before]', 'uploadedAt[strictly_before]', 'uploadedAt[after]', 'uploadedAt[strictly_after]'
    'takenAt' => DateFilter::EXCLUDE_NULL     // Same for takenAt
])]
class GalleryItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['gallery:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    #[Groups(['gallery:read'])]
    private ?string $userId = null; // User identifier from JWT

    #[ORM\Column(length: 255)]
    #[Groups(['gallery:read'])]
    private ?string $originalFilename = null;

    #[ORM\Column(length: 255)]
    private ?string $storedFilename = null;

    #[ORM\Column(length: 255)]
    #[Groups(['gallery:read'])]
    private ?string $mimeType = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    #[Groups(['gallery:read'])]
    private ?\DateTimeImmutable $uploadedAt = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    #[Groups(['gallery:read'])]
    private ?\DateTimeImmutable $takenAt = null;

    // This is a virtual property for the uploaded file, not persisted directly by Doctrine.
    // Used by the controller/form for validation.
    #[Assert\NotNull(groups: ['gallery:write'])]
    #[Assert\File(
        maxSize: "100G",
        mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/quicktime",
            "video/webm"
        ],
        groups: ['gallery:write']
    )]
    public ?File $file = null; // This property is used by the CreateGalleryItemAction

    // This will be injected from services.yaml via the controller or a listener
    #[Groups(['gallery:read'])]
    public ?string $galleryBaseUrl = null;

    public function __construct()
    {
        $this->uploadedAt = new \DateTimeImmutable();
    }

    /**
     * @return array<string, mixed>
     */
    public function __serialize(): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'originalFilename' => $this->originalFilename,
            'storedFilename' => $this->storedFilename,
            'mimeType' => $this->mimeType,
            'uploadedAt' => $this->uploadedAt?->format(\DateTimeInterface::ATOM),
            'takenAt' => $this->takenAt?->format(\DateTimeInterface::ATOM),
            // Note: 'file' and 'galleryBaseUrl' are typically not part of the core entity state for serialization
            // unless specifically required for your unserialization logic.
        ];
    }

    /**
     * @param array<string, mixed> $data
     */
    public function __unserialize(array $data): void
    {
        $this->id = (isset($data['id']) && is_int($data['id'])) ? $data['id'] : null;
        $this->userId = isset($data['userId']) && is_string($data['userId']) ? $data['userId'] : null;
        $this->originalFilename = isset($data['originalFilename']) && is_string($data['originalFilename']) ? $data['originalFilename'] : null;
        $this->storedFilename = isset($data['storedFilename']) && is_string($data['storedFilename']) ? $data['storedFilename'] : null;
        $this->mimeType = isset($data['mimeType']) && is_string($data['mimeType']) ? $data['mimeType'] : null;

        // Handle uploadedAt
        if (array_key_exists('uploadedAt', $data)) {
            if (is_string($data['uploadedAt'])) {
                $parsedUploadedAt = \DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $data['uploadedAt']);
                if ($parsedUploadedAt instanceof \DateTimeImmutable) {
                    $this->uploadedAt = $parsedUploadedAt;
                } else { // Parsing failed (createFromFormat returned false)
                    $this->uploadedAt = new \DateTimeImmutable(); // Fallback for failed parse
                }
            } else { // Value for 'uploadedAt' is present but not a string (e.g. null, int, array)
                $this->uploadedAt = null; // Or new \DateTimeImmutable() if that's the desired fallback for invalid type
            }
        } else { // 'uploadedAt' key not in $data, use default
            $this->uploadedAt = new \DateTimeImmutable();
        }

        // Handle takenAt
        if (array_key_exists('takenAt', $data)) {
            if (is_string($data['takenAt'])) {
                $parsedTakenAt = \DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $data['takenAt']);
                if ($parsedTakenAt instanceof \DateTimeImmutable) {
                    $this->takenAt = $parsedTakenAt;
                } else { // Parsing failed (createFromFormat returned false)
                    $this->takenAt = null; // Fallback to null for failed parse
                }
            } else { // Value for 'takenAt' is present but not a string
                $this->takenAt = null;
            }
        } else { // 'takenAt' key not in $data
            $this->takenAt = null;
        }
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUserId(): ?string
    {
        return $this->userId;
    }

    public function setUserId(string $userId): static
    {
        $this->userId = $userId;
        return $this;
    }

    public function getOriginalFilename(): ?string
    {
        return $this->originalFilename;
    }

    public function setOriginalFilename(string $originalFilename): static
    {
        $this->originalFilename = $originalFilename;
        return $this;
    }

    public function getStoredFilename(): ?string
    {
        return $this->storedFilename;
    }

    public function setStoredFilename(string $storedFilename): static
    {
        $this->storedFilename = $storedFilename;
        return $this;
    }

    public function getMimeType(): ?string
    {
        return $this->mimeType;
    }

    public function setMimeType(?string $mimeType): static
    {
        $this->mimeType = $mimeType;
        return $this;
    }

    public function getUploadedAt(): ?\DateTimeImmutable
    {
        return $this->uploadedAt;
    }

    #[ORM\PrePersist]
    public function setUploadedAtValue(): void
    {
        $this->uploadedAt = new \DateTimeImmutable();
    }

    public function setGalleryBaseUrl(string $galleryBaseUrl): void
    {
        $this->galleryBaseUrl = $galleryBaseUrl;
    }

    #[Groups(['gallery:read'])]
    public function getPublicUrl(): ?string
    {
        if ($this->storedFilename && $this->galleryBaseUrl) {
            return rtrim($this->galleryBaseUrl, '/') . '/' . $this->storedFilename;
        }
        return null;
    }

    public function getTakenAt(): ?\DateTimeImmutable
    {
        return $this->takenAt;
    }

    public function setTakenAt(?\DateTimeImmutable $takenAt): static
    {
        $this->takenAt = $takenAt;
        return $this;
    }
}
