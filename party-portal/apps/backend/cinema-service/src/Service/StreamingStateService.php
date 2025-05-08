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

        return [
            'manifestUrl' => $state['manifestUrl'] ?? null,
            'playbackState' => $state['playbackState'] ?? 'stopped',
            'videoPlaybackTimeMs' => (int) ($state['videoPlaybackTimeMs'] ?? 0),
            'stateUpdateServerTime' => $state['stateUpdateServerTime'] instanceof \DateTimeImmutable
                ? (int)((float)$state['stateUpdateServerTime']->format('U.u') * 1000) // Precise milliseconds
                : null
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

        $currentVideoTimeMs = (float) $currentState['videoPlaybackTimeMs']; // Start with current time as float
        if ($currentState['stateUpdateServerTime'] instanceof \DateTimeImmutable) {
            $now = $this->clock->now();
            
            // Calculate elapsed time with microsecond precision then convert to milliseconds
            $nowPreciseSeconds = (float)$now->format('U.u');
            $lastUpdatePreciseSeconds = (float)$currentState['stateUpdateServerTime']->format('U.u');
            
            $timeSinceUpdateMs = ($nowPreciseSeconds - $lastUpdatePreciseSeconds) * 1000.0;
            
            $currentVideoTimeMs += max(0, $timeSinceUpdateMs);
            $this->logger->info(sprintf("Calculated timeSinceUpdateMs: %.3f ms. New currentVideoTimeMs before int cast: %.3f ms", $timeSinceUpdateMs, $currentVideoTimeMs));
        }

        $newState = [
            ...$currentState,
            'playbackState' => 'paused',
            'videoPlaybackTimeMs' => (int) round($currentVideoTimeMs), // Round to nearest millisecond and cast to int
            'stateUpdateServerTime' => $this->clock->now(),
        ];
        $this->saveStateAndPublish($newState, 'pause', ['videoTimeMs' => (int) round($currentVideoTimeMs)]);
        $this->logger->info("Stream paused at time: " . (int) round($currentVideoTimeMs) . "ms");
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

        // Prepare state for Mercure payload
        $mercureStatePayload = [
            'manifestUrl' => $state['manifestUrl'] ?? null,
            'playbackState' => $state['playbackState'] ?? 'stopped',
            'videoPlaybackTimeMs' => (int) ($state['videoPlaybackTimeMs'] ?? 0),
            'stateUpdateServerTime' => isset($state['stateUpdateServerTime']) && $state['stateUpdateServerTime'] instanceof \DateTimeImmutable
                ? (int)((float)$state['stateUpdateServerTime']->format('U.u') * 1000) // Precise milliseconds
                : ($state['stateUpdateServerTime'] ?? null) // Handle if already a millisecond timestamp (e.g. from older state) or null
        ];

        // Publish update to Mercure
        try {
            $update = new Update(
                '/cinema/stream/updates', // Correct topic for the frontend
                json_encode($mercureStatePayload) // Publish the new state object
            );
            $this->logger->info('Attempting to publish to Mercure hub', [
                'topic' => '/cinema/stream/updates',
                'action_for_logging' => $action, // Keep action for logging if desired
                'payload_sent' => $mercureStatePayload
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

    /**
     * Get the duration of a video file in seconds
     */
    public function getVideoDuration(string $manifestPath): ?float
    {
        try {
            $fullPath = $this->movieDirectory . '/' . $manifestPath;

            if (!file_exists($fullPath)) {
                $this->logger->error("Manifest file not found: {$fullPath}");
                return null;
            }

            $extension = pathinfo($fullPath, PATHINFO_EXTENSION);

            if ($extension === 'mpd') {
                return $this->parseMpdDuration($fullPath);
            } elseif ($extension === 'm3u8') {
                return $this->parseM3u8Duration($fullPath);
            }

            $this->logger->error("Unsupported manifest format: {$extension}");
            return null;
        } catch (\Exception $e) {
            $this->logger->error("Error getting video duration: " . $e->getMessage(), [
                'exception' => $e,
                'manifestPath' => $manifestPath
            ]);
            return null;
        }
    }

    private function parseMpdDuration(string $mpdPath): ?float
    {
        $xml = simplexml_load_file($mpdPath);
        if (!$xml) {
            $this->logger->error("Failed to parse MPD file as XML");
            return null;
        }

        // Check for mediaPresentationDuration attribute
        if (isset($xml['mediaPresentationDuration'])) {
            $durationString = (string) $xml['mediaPresentationDuration'];
            return $this->parseIsoDuration($durationString);
        }

        // Check for Period duration
        if (isset($xml->Period[0]['duration'])) {
            $durationString = (string) $xml->Period[0]['duration'];
            return $this->parseIsoDuration($durationString);
        }

        // Check for adaptation sets and calculate based on segments
        $duration = 0;
        foreach ($xml->xpath('//SegmentTemplate[@duration]') as $segment) {
            $segmentDuration = (int) $segment['duration'];
            $timescale = isset($segment['timescale']) ? (int) $segment['timescale'] : 1;

            if ($segmentDuration > 0) {
                // Get segment count from SegmentTimeline if available
                $segmentCount = 1;
                $segmentTimeline = $segment->SegmentTimeline;
                if ($segmentTimeline) {
                    $segmentCount = count($segmentTimeline->S);
                }

                $duration = max($duration, ($segmentDuration * $segmentCount) / $timescale);
            }
        }

        return $duration > 0 ? $duration : null;
    }

    private function parseM3u8Duration(string $m3u8Path): ?float
    {
        $content = file_get_contents($m3u8Path);
        if ($content === false) {
            $this->logger->error("Failed to read M3U8 file");
            return null;
        }

        // Check for EXT-X-DURATION tag
        if (preg_match('/#EXT-X-DURATION:(\d+(\.\d+)?)/', $content, $matches)) {
            return (float) $matches[1];
        }

        // Sum up individual segment durations
        $totalDuration = 0;
        preg_match_all('/#EXTINF:(\d+(\.\d+)?)/', $content, $matches);

        if (isset($matches[1]) && is_array($matches[1])) {
            foreach ($matches[1] as $duration) {
                $totalDuration += (float) $duration;
            }
            return $totalDuration;
        }

        return null;
    }

    /**
     * Parse ISO 8601 duration format (e.g., PT1H30M15.5S)
     */
    private function parseIsoDuration(string $isoDuration): float
    {
        // Remove the "P" prefix
        $duration = substr($isoDuration, 1);

        // Initialize duration parts
        $days = 0;
        $hours = 0;
        $minutes = 0;
        $seconds = 0;

        // Extract "T" part for time
        $timePart = $duration;
        if (strpos($duration, 'T') !== false) {
            list($datePart, $timePart) = explode('T', $duration);

            // Parse date part (days)
            if (preg_match('/(\d+)D/', $datePart, $matches)) {
                $days = (int) $matches[1];
            }
        } else {
            $datePart = $duration;
            $timePart = '';

            // Parse date part (days)
            if (preg_match('/(\d+)D/', $datePart, $matches)) {
                $days = (int) $matches[1];
            }
        }

        // Parse hours
        if (preg_match('/(\d+)H/', $timePart, $matches)) {
            $hours = (int) $matches[1];
        }

        // Parse minutes
        if (preg_match('/(\d+)M/', $timePart, $matches)) {
            $minutes = (int) $matches[1];
        }

        // Parse seconds (possibly with decimal)
        if (preg_match('/(\d+(\.\d+)?)S/', $timePart, $matches)) {
            $seconds = (float) $matches[1];
        }

        // Calculate total seconds
        return $days * 86400 + $hours * 3600 + $minutes * 60 + $seconds;
    }
}
