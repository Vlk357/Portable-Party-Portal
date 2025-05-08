<?php

namespace App\Service;

use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Component\Clock\ClockInterface;
use Symfony\Component\Finder\Finder;
use Psr\Log\LoggerInterface;
use DateTimeImmutable;

class StreamingStateService
{
    private const CACHE_KEY = 'streaming_state';

    public function __construct(
        private readonly HubInterface $hub,
        private readonly CacheInterface $cache,
        private readonly ClockInterface $clock,
        private readonly string $movieDirectory,
        private readonly LoggerInterface $logger
    ) {
    }

    public function getState(): array
    {
        return $this->cache->get(self::CACHE_KEY, function (ItemInterface $item) {
            $item->expiresAfter(null); // Persist indefinitely
            return $this->getDefaultState();
        });
    }

    public function getCurrentStateForClient(): array
    {
        $state = $this->getState();

        // Return the raw timestamps without any calculations
        return [
            'manifestUrl' => $state['manifestUrl'] ?? null,
            'state' => $state['playbackState'] ?? 'stopped',
            'videoPlaybackTimeMs' => (int) ($state['videoPlaybackTimeMs'] ?? 0), // Raw video time in milliseconds
            'stateUpdateServerTime' => $state['stateUpdateServerTime'] ? $state['stateUpdateServerTime']->getTimestamp() : null // Server time in milliseconds
        ];
    }

    public function startStream(string $manifestUrl): void
    {
        $this->logger->info("Attempting to start stream: {$manifestUrl}");

        $newState = [
            'manifestUrl' => $manifestUrl,
            'playbackState' => 'playing',
            'videoPlaybackTimeMs' => 0,
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'start', ['manifestUrl' => $manifestUrl, 'videoTimeMs' => 0]);
        $this->logger->info("Stream started: {$manifestUrl}");
    }

    public function pauseStream(): void
    {
        $this->logger->info("Attempting to pause stream");
        $currentState = $this->getState();
        if ($currentState['playbackState'] !== 'playing') {
            $this->logger->warning("Stream is not playing, cannot pause.");
            return;
        }

        $currentVideoTimeMs = $currentState['videoPlaybackTimeMs'];
        if ($currentState['stateUpdateServerTime']) {
            $now = $this->clock->now();
            $timeSinceUpdateMs = ($now->getTimestamp() - $currentState['stateUpdateServerTime']->getTimestamp()) * 1000;
            $currentVideoTimeMs += max(0, $timeSinceUpdateMs);
        }

        $newState = [
            ...$currentState,
            'playbackState' => 'paused',
            'videoPlaybackTimeMs' => (int) $currentVideoTimeMs,
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'pause', ['videoTimeMs' => (int) $currentVideoTimeMs]);
        $this->logger->info("Stream paused at time: " . $currentVideoTimeMs . "ms");
    }

    public function resumeStream(): void
    {
        $this->logger->info("Attempting to resume stream");
        $currentState = $this->getState();
        if ($currentState['playbackState'] !== 'paused') {
            $this->logger->warning("Stream is not paused, cannot resume.");
            return;
        }

        $videoTimeOnResumeMs = $currentState['videoPlaybackTimeMs'];

        $newState = [
            ...$currentState,
            'playbackState' => 'playing',
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'play', ['videoTimeMs' => (int) $videoTimeOnResumeMs]);
        $this->logger->info("Stream resumed from time: " . $videoTimeOnResumeMs . "ms");
    }

    public function stopStream(): void
    {
        $this->logger->info("Attempting to stop stream");
        $defaultState = $this->getDefaultState();
        $this->saveStateAndPublish($defaultState, 'stop');
        $this->logger->info("Stream stopped");
    }

    public function listAvailableMovies(): array
    {
        $finder = new Finder();
        $movies = [];
        try {
            $finder->files()->in($this->movieDirectory)->name(['*.m3u8', '*.mpd']);

            foreach ($finder as $file) {
                $relativePath = str_replace($this->movieDirectory . '/', '', $file->getRealPath());
                $movies[] = $relativePath;
            }
        } catch (\InvalidArgumentException $e) {
            $this->logger->error("Movie directory not found or invalid: {$this->movieDirectory}", ['exception' => $e]);
            return [];
        }
        sort($movies);
        return $movies;
    }

    private function saveStateAndPublish(array $state, string $action, array $payload = []): void
    {
        // Save to cache
        $this->cache->delete(self::CACHE_KEY);
        $this->cache->get(self::CACHE_KEY, function (ItemInterface $item) use ($state) {
            $item->expiresAfter(null);
            return $state;
        });

        // Publish update to Mercure
        try {
            $update = new Update(
                '/stream/status',
                json_encode(['action' => $action, ...$payload])
            );
            $this->logger->info('Attempting to publish to Mercure hub', [
                'topic' => '/stream/status',
                'action' => $action
            ]);
            $this->hub->publish($update);
            $this->logger->info('Successfully published to Mercure hub');
        } catch (\Symfony\Component\Mercure\Exception\RuntimeException $e) {
            // Specific Mercure runtime exceptions
            $this->logger->error('Mercure runtime error: ' . $e->getMessage(), [
                'exception' => $e,
                'action' => $action,
                'code' => $e->getCode(),
            ]);
        } catch (\Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface $e) {
            // Network/connection related issues
            $this->logger->error('Mercure transport error: ' . $e->getMessage(), [
                'exception' => $e,
                'action' => $action,
            ]);
        } catch (\Symfony\Contracts\HttpClient\Exception\HttpExceptionInterface $e) {
            // HTTP errors (4xx, 5xx)
            $this->logger->error('Mercure HTTP error: ' . $e->getMessage(), [
                'exception' => $e,
                'action' => $action,
                'statusCode' => $e->getResponse()->getStatusCode(),
                'responseBody' => $e->getResponse()->getContent(false),
            ]);
        } catch (\Exception $e) {
            // Generic fallback
            $this->logger->error('Failed to publish to Mercure: ' . $e->getMessage(), [
                'exception' => $e,
                'exceptionClass' => get_class($e),
                'action' => $action,
            ]);
        }
    }

    private function getDefaultState(): array
    {
        return [
            'manifestUrl' => null,
            'playbackState' => 'stopped', // stopped, playing, paused
            'videoPlaybackTimeMs' => 0,
            'stateUpdateServerTime' => null,
        ];
    }
}
