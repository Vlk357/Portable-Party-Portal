<?php

namespace App\Serializer;

use App\Entity\GalleryItem;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;
use Symfony\Component\Serializer\SerializerAwareInterface;
use Symfony\Component\Serializer\SerializerInterface;

class GalleryItemNormalizer implements NormalizerInterface, SerializerAwareInterface
{
    private LoggerInterface $logger;
    private NormalizerInterface $decorated;
    private string $galleryBaseUrl;

    public function __construct(
        NormalizerInterface $decorated,
        #[Autowire('%env(APP_GALLERY_BASE_URL)%')] string $galleryBaseUrl,
        LoggerInterface $logger
    ) {
        $this->decorated = $decorated;
        $this->galleryBaseUrl = $galleryBaseUrl;
        $this->logger = $logger;
        $this->logger->info('GalleryItemNormalizer initialized. Decorating: ' . get_class($this->decorated) . '. Base URL: ' . $this->galleryBaseUrl);
    }

    public function setSerializer(SerializerInterface $serializer): void
    {
        $this->logger->info('GalleryItemNormalizer::setSerializer called.');

        if ($this->decorated instanceof SerializerAwareInterface) {
            $this->logger->info('Passing serializer to decorated normalizer: ' . get_class($this->decorated));
            $this->decorated->setSerializer($serializer);
        }
    }

    /**
     * @param array<string, mixed> $context
     * @return array<array-key, mixed>|string|int|float|bool|\ArrayObject<array-key, mixed>|null
     */
    public function normalize(mixed $object, ?string $format = null, array $context = []): array|string|int|float|bool|\ArrayObject|null
    {
        $this->logger->info('GalleryItemNormalizer::normalize called.', [
            'object_class' => is_object($object) ? get_class($object) : gettype($object),
            'format' => $format,
            'is_gallery_item' => $object instanceof GalleryItem
        ]);

        if ($object instanceof GalleryItem) {
            $this->logger->info('Setting galleryBaseUrl on GalleryItem ID: ' . $object->getId() . ' to: ' . $this->galleryBaseUrl);
            $object->setGalleryBaseUrl($this->galleryBaseUrl);
        }

        return $this->decorated->normalize($object, $format, $context);
    }

    /**
     * @param array<string, mixed> $context
     */
    public function supportsNormalization(mixed $data, ?string $format = null, array $context = []): bool
    {
        $isGalleryItem = $data instanceof GalleryItem;
        // Check if the decorated normalizer supports it first.
        // This is crucial for the decorator pattern to work correctly.
        if (!$this->decorated->supportsNormalization($data, $format, $context)) {
            $this->logger->info('GalleryItemNormalizer::supportsNormalization - Decorated normalizer does not support, so this will not either.', [
                'data_class' => is_object($data) ? get_class($data) : gettype($data),
                'format' => $format,
            ]);
            return false;
        }

        // If decorated supports it, then this normalizer supports it if it's a GalleryItem.
        $this->logger->info('GalleryItemNormalizer::supportsNormalization called.', [
            'data_class' => is_object($data) ? get_class($data) : gettype($data),
            'format' => $format,
            'is_gallery_item' => $isGalleryItem,
            'decorated_supports' => true, // We know this from the check above
            'will_support' => $isGalleryItem // This normalizer adds specific behavior for GalleryItem
        ]);

        return $isGalleryItem; // This normalizer specifically handles GalleryItem
    }

    /**
     * @return array<class-string, bool>
     */
    public function getSupportedTypes(?string $format): array
    {
        $this->logger->info('GalleryItemNormalizer::getSupportedTypes called.', ['format' => $format]);
        // This normalizer explicitly states it can handle GalleryItem.
        // It doesn't need to merge with decorated types unless the decorated
        // normalizer has a very specific contract that needs to be upheld
        // beyond just adding support for GalleryItem.
        // For most decorator normalizers, simply stating the type it adds is sufficient.
        return [
            GalleryItem::class => true,
        ];
    }
}
