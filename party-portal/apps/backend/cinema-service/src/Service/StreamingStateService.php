<?php

namespace App\Service;

use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Component\Clock\ClockInterface;
use Symfony\Component\Finder\Finder;
use Psr\Log\LoggerInterface; // Add Logger
use DateTimeImmutable;

class StreamingStateService
{
    private const CACHE_KEY = 'streaming_state';

    public function __construct(
        private readonly HubInterface $hub,
        private readonly CacheInterface $cache, // Specifically bound pool
        private readonly ClockInterface $clock,
        private readonly string $movieDirectory, // Injected from services.yaml
        private readonly LoggerInterface $logger // Autowired Logger
    ) {}

    // Placeholder methods - Implement logic later
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
        $currentVideoTime = $state['videoPlaybackTime'];

        if ($state['playbackState'] === 'playing' && $state['stateUpdateServerTime']) {
            $now = $this->clock->now();
            $timeSinceUpdate = $now->getTimestamp() - $state['stateUpdateServerTime']->getTimestamp();
            $currentVideoTime += max(0, $timeSinceUpdate); // Ensure time doesn't go backward
        }

        return [
            'manifestUrl' => $state['manifestUrl'],
            'state' => $state['playbackState'],
            'currentVideoTime' => round($currentVideoTime, 2), // Send rounded time
        ];
    }

    public function startStream(string $manifestUrl): void
    {
        $this->logger->info("Attempting to start stream: {$manifestUrl}");
        // Basic validation: check if manifest exists relative to movieDirectory?
        // Note: $manifestUrl should likely be relative path, e.g., "movie1/manifest.m3u8"

        $newState = [
            'manifestUrl' => $manifestUrl, // Store the relative path
            'playbackState' => 'playing',
            'videoPlaybackTime' => 0.0,
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'start', ['manifestUrl' => $manifestUrl, 'videoTime' => 0.0]);
        $this->logger->info("Stream started: {$manifestUrl}");
    }

    public function pauseStream(): void
    {
        $this->logger->info("Attempting to pause stream");
        $currentState = $this->getState();
        if ($currentState['playbackState'] !== 'playing') {
             $this->logger->warning("Stream is not playing, cannot pause.");
             return; // Already paused or stopped
        }

        $currentVideoTime = $currentState['videoPlaybackTime'];
        if ($currentState['stateUpdateServerTime']) {
             $now = $this->clock->now();
             $timeSinceUpdate = $now->getTimestamp() - $currentState['stateUpdateServerTime']->getTimestamp();
             $currentVideoTime += max(0, $timeSinceUpdate);
        }

        $newState = [
            ... $currentState,
            'playbackState' => 'paused',
            'videoPlaybackTime' => $currentVideoTime,
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'pause', ['videoTime' => round($currentVideoTime, 2)]);
        $this->logger->info("Stream paused at time: " . round($currentVideoTime, 2));
    }

     public function resumeStream(): void
    {
        $this->logger->info("Attempting to resume stream");
        $currentState = $this->getState();
        if ($currentState['playbackState'] !== 'paused') {
            $this->logger->warning("Stream is not paused, cannot resume.");
            return; // Already playing or stopped
        }

        $videoTimeOnResume = $currentState['videoPlaybackTime']; // Time when it was paused

        $newState = [
            ... $currentState,
            'playbackState' => 'playing',
            // videoPlaybackTime remains the same, stateUpdateServerTime changes
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'play', ['videoTime' => round($videoTimeOnResume, 2)]);
         $this->logger->info("Stream resumed from time: " . round($videoTimeOnResume, 2));
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
            $finder->files()->in($this->movieDirectory)->name(['*.m3u8', '*.mpd']); // Look in subdirs like movie1/manifest.m3u8

            foreach ($finder as $file) {
                // Get path relative to movieDirectory, e.g., "movie1/manifest.m3u8"
                 $relativePath = str_replace($this->movieDirectory . '/', '', $file->getRealPath());
                 $movies[] = $relativePath;
            }
        } catch (\InvalidArgumentException $e) {
             $this->logger->error("Movie directory not found or invalid: {$this->movieDirectory}", ['exception' => $e]);
             return []; // Return empty array if directory is bad
        }
        sort($movies);
        return $movies;
    }

    // --- Helper Methods ---

    private function saveStateAndPublish(array $state, string $action, array $payload = []): void
    {
         // Save to cache
        $this->cache->delete(self::CACHE_KEY); // Delete first to ensure update
        $this->cache->get(self::CACHE_KEY, function (ItemInterface $item) use ($state) {
             $item->expiresAfter(null);
             return $state;
        });

        // Publish update to Mercure
        $update = new Update(
            '/stream/status', // The topic
            json_encode(['action' => $action, ...$payload]) // JSON payload
            // Optional: Make update private, add targets, set ID, type, retry
        );
        $this->hub->publish($update);
    }

     private function getDefaultState(): array
    {
        return [
            'manifestUrl' => null,
            'playbackState' => 'stopped', // stopped, playing, paused
            'videoPlaybackTime' => 0.0,
            'stateUpdateServerTime' => null, // DateTimeImmutable or null
        ];
    }
}
