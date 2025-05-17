<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\OpenApi\Model;
use App\Controller\CreateGalleryItemAction;
use App\Repository\GalleryItemRepository;
use Doctrine\DBAL\Types\Types; // <--- ADD THIS LINE
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\HttpFoundation\File\File;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: GalleryItemRepository::class)]
#[ORM\Table(name: "gallery_items")]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    operations: [
        new GetCollection(
            normalizationContext: ['groups' => ['gallery:read']],
            paginationItemsPerPage: 9
        ),
        new Post(
            controller: CreateGalleryItemAction::class,
            denormalizationContext: ['groups' => ['gallery:write']],
            normalizationContext: ['groups' => ['gallery:read']],
            deserialize: false, // Controller handles multipart/form-data
            description: 'Upload an image or video file.',
            openapi: new Model\Operation( // Instantiate Model\Operation
                summary: 'Upload a new gallery item.', // Set summary here
                requestBody: new Model\RequestBody( // Instantiate Model\RequestBody
                    content: new \ArrayObject([ // Content is an ArrayObject mapping media types to schemas
                        'multipart/form-data' => [
                            'schema' => [
                                'type' => 'object',
                                'properties' => [
                                    'file' => [
                                        'type' => 'string',
                                        'format' => 'binary',
                                        'description' => 'The file to upload.'
                                    ],
                                    // 'description' => ['type' => 'string', 'description' => 'Optional description.']
                                ]
                            ]
                        ]
                    ])
                )
            )
        )
    ],
    order: ['uploadedAt' => 'DESC'],
    normalizationContext: ['groups' => ['gallery:read']],
    denormalizationContext: ['groups' => ['gallery:write']]
)]
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
}