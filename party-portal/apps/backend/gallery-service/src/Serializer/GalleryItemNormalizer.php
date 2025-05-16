<?php

namespace App\Serializer;

use App\Entity\GalleryItem;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;
use Symfony\Component\Serializer\SerializerAwareInterface;
use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Component\Serializer\Normalizer\AbstractObjectNormalizer; // Import this

class GalleryItemNormalizer implements NormalizerInterface, SerializerAwareInterface // Implement SerializerAwareInterface
{
    private LoggerInterface $logger;
    private NormalizerInterface $decorated;
    private string $galleryBaseUrl;
    private ?SerializerInterface $serializer = null; // Add this property

    public function __construct(
        NormalizerInterface $decorated, // Keep this as $decorated
        #[Autowire('%env(APP_GALLERY_BASE_URL)%')] string $galleryBaseUrl,
        LoggerInterface $logger
    ) {
        $this->decorated = $decorated;
        $this->galleryBaseUrl = $galleryBaseUrl;
        $this->logger = $logger;
        $this->logger->info('GalleryItemNormalizer initialized. Decorating: ' . get_class($this->decorated) . '. Base URL: ' . $this->galleryBaseUrl);
    }

    // Implement setSerializer from SerializerAwareInterface
    public function setSerializer(SerializerInterface $serializer): void
    {
        $this->logger->info('GalleryItemNormalizer::setSerializer called.');
        $this->serializer = $serializer;

        // If the decorated normalizer is also SerializerAwareInterface (most are, like ObjectNormalizer),
        // pass the serializer to it.
        if ($this->decorated instanceof SerializerAwareInterface) {
            $this->logger->info('Passing serializer to decorated normalizer: ' . get_class($this->decorated));
            $this->decorated->setSerializer($serializer);
        }
    }

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

        // Ensure the decorated normalizer has the serializer if it needs it and hasn't received it yet
        // This is a fallback, setSerializer should ideally be called by Symfony DI
        if ($this->decorated instanceof SerializerAwareInterface && $this->serializer && method_exists($this->decorated, 'setSerializer')) {
             // Check if it already has a serializer or if our serializer is different
             // This logic can get complex; usually DI handles this via setSerializer.
             // For now, we rely on the setSerializer method being called by DI.
        }


        return $this->decorated->normalize($object, $format, $context);
    }

    public function supportsNormalization(mixed $data, ?string $format = null, array $context = []): bool
    {
        $isGalleryItem = $data instanceof GalleryItem;
        // It's crucial that the decorated normalizer also supports the data type.
        $decoratedSupports = $this->decorated->supportsNormalization($data, $format, $context);
        
        $this->logger->info('GalleryItemNormalizer::supportsNormalization called.', [
            'data_class' => is_object($data) ? get_class($data) : gettype($data),
            'format' => $format,
            'is_gallery_item' => $isGalleryItem,
            'decorated_supports' => $decoratedSupports,
            'will_support' => $isGalleryItem && $decoratedSupports
        ]);
        
        return $isGalleryItem && $decoratedSupports;
    }

    public function getSupportedTypes(?string $format): array
    {
        $types = $this->decorated->getSupportedTypes($format);
        $this->logger->info('GalleryItemNormalizer::getSupportedTypes called.', [
            'format' => $format,
            'decorated_types' => $types
        ]);
        $types[GalleryItem::class] = true; 
        return $types;
    }
}