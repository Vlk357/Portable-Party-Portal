import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Assuming shaka types are globally available via your types/index.ts setup
// No need for:
// declare global {
//   interface Window {
//     shaka: any; 
//   }
// }

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number; // Included if API sends it, though not directly used by player logic yet
}

const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<shaka.Player | null>(null); // Use shaka.Player type
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [isVideoVertical, setIsVideoVertical] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const navigate = useNavigate();

  // Control visibility timer
  useEffect(() => {
    let hideTimeout: number;
    if (isControlsVisible && streamState?.playbackState === 'playing') {
      hideTimeout = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, 3000);
    }
    return () => {
      clearTimeout(hideTimeout);
    };
  }, [isControlsVisible, streamState?.playbackState]);

  // Fetch initial stream state and set up Mercure listener
  useEffect(() => {
    let pollingIntervalId: number | undefined;
    let eventSource: EventSource | undefined;

    const MERCURE_STREAM_UPDATES_TOPIC = '/cinema/stream/updates'; // Adjust topic as per your backend

    const setupMercureListener = (currentManifestUrl: string) => {
      if (eventSource) {
        eventSource.close();
      }
      const mercureUrl = new URL('/.well-known/mercure', window.location.origin);
      mercureUrl.searchParams.append('topic', MERCURE_STREAM_UPDATES_TOPIC);
      // Example for a dynamic topic based on manifest, if needed:
      // mercureUrl.searchParams.append('topic', `/cinema/stream/${encodeURIComponent(currentManifestUrl)}/status`);

      eventSource = new EventSource(mercureUrl.toString());

      eventSource.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data) as Partial<Pick<StreamState, 'playbackState' | 'videoPlaybackTimeMs'>>;
          setStreamState(prevState => {
            if (!prevState || prevState.manifestUrl !== currentManifestUrl) {
              return prevState; // Update only if manifest matches
            }
            return {
              ...prevState,
              ...(update.playbackState && { playbackState: update.playbackState }),
              ...(typeof update.videoPlaybackTimeMs === 'number' && { videoPlaybackTimeMs: update.videoPlaybackTimeMs }),
            };
          });
        } catch (e) {
          console.error('Error parsing Mercure message:', e);
        }
      };

      eventSource.onerror = (error) => {
        console.error('Mercure EventSource failed:', error);
        eventSource?.close();
        // Optional: Implement reconnection strategy or fallback to polling
      };
    };

    const fetchStreamInfo = async () => {
      try {
        const response = await fetch('/cinema/api/stream/info');
        if (response.ok) {
          const data: StreamState = await response.json();
          setStreamState(data);
          if (data.manifestUrl) {
            if (pollingIntervalId) {
              clearInterval(pollingIntervalId);
              pollingIntervalId = undefined;
            }
            setupMercureListener(data.manifestUrl);
          } else {
            // No active stream, start or continue polling
            if (eventSource) eventSource.close(); // Close active Mercure if stream disappeared
            if (!pollingIntervalId) {
              pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
            }
          }
        } else {
          console.error('Error fetching stream state: Response not OK', response.status);
          if (!pollingIntervalId) {
            pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
          }
        }
      } catch (error) {
        console.error('Error fetching stream state:', error);
        if (!pollingIntervalId) {
          pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
        }
      }
    };

    fetchStreamInfo(); // Initial fetch

    return () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      eventSource?.close();
    };
  }, []); // Runs once on mount to initiate fetching/polling and Mercure

  // Initialize and destroy Shaka Player
  useEffect(() => {
    if (!videoRef.current) return;
    const videoElement = videoRef.current;

    if (window.shaka && window.shaka.Player.isBrowserSupported()) {
      playerRef.current = new window.shaka.Player(videoElement);
      playerRef.current.addEventListener('error', (event: shaka.extern.ErrorEvent) => {
        console.error('Shaka Player Error Event:', event.detail);
      });
      // console.log('Shaka Player initialized');
    } else {
      console.warn('Shaka Player not available or not supported. Using basic HTML5 video.');
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy().then(() => {
          // console.log('Shaka Player destroyed');
        }).catch((e: Error) => console.error('Error destroying Shaka player:', e));
        playerRef.current = null;
      } else if (videoElement) {
        videoElement.src = '';
        videoElement.load();
      }
    };
  }, []);

  // Load manifest when streamState.manifestUrl changes
  useEffect(() => {
    if (!streamState?.manifestUrl || !videoRef.current) return;

    const manifestToLoad = `/movies/${streamState.manifestUrl}`;

    if (playerRef.current) {
      playerRef.current.load(manifestToLoad)
        .then(() => {
          // console.log('Shaka: Manifest loaded successfully:', manifestToLoad);
        })
        .catch((error: shaka.extern.Error) => {
          console.error('Shaka: Error loading video manifest:', error.detail || error);
        });
    } else if (videoRef.current) {
      if (videoRef.current.src !== manifestToLoad) {
        videoRef.current.src = manifestToLoad;
        videoRef.current.load();
      }
    }
  }, [streamState?.manifestUrl]);

  // Handle playback state (play/pause)
  useEffect(() => {
    if (!videoRef.current || !streamState || !streamState.manifestUrl) return;

    const videoElement = videoRef.current;
    // Ensure manifest is loaded for the current stream before attempting play/pause
    const currentManifestSuffix = streamState.manifestUrl;
    const isManifestLoaded = playerRef.current 
      ? playerRef.current.getManifestUri()?.endsWith(currentManifestSuffix) 
      : videoElement.currentSrc?.endsWith(currentManifestSuffix);

    if (isManifestLoaded) {
      if (streamState.playbackState === 'playing') {
        videoElement.play().catch(error => {
          if (error.name !== 'AbortError') {
            console.error('Error playing video:', error);
          }
        });
      } else {
        videoElement.pause();
      }
    }
  }, [streamState]); // Depends on the whole streamState object

  // Handle seeking
  useEffect(() => {
    if (!videoRef.current || !streamState || !streamState.manifestUrl || streamState.videoPlaybackTimeMs < 0) return; // Allow 0
    
    const videoElement = videoRef.current;
    const currentManifestSuffix = streamState.manifestUrl;
    const isManifestLoaded = playerRef.current 
      ? playerRef.current.getManifestUri()?.endsWith(currentManifestSuffix)
      : videoElement.currentSrc?.endsWith(currentManifestSuffix);

    if (isManifestLoaded) {
      const targetTime = streamState.videoPlaybackTimeMs / 1000;
      if (Math.abs(videoElement.currentTime - targetTime) > 1.5) { 
        videoElement.currentTime = targetTime;
      }
    }
  }, [streamState]); // Depends on the whole streamState object

  const requestOrientationLock = useCallback(() => {
    if (!videoRef.current) return; // Guard against null ref
    // isVideoVertical state is used directly from the outer scope
    try {
      if (
        window.screen.orientation &&
        typeof window.screen.orientation.lock === 'function'
      ) {
        const lockOrientation = isVideoVertical ? 'portrait' : 'landscape';
        window.screen.orientation.lock(lockOrientation).catch((e: Error) => {
          console.warn(`Failed to lock to ${lockOrientation}:`, e.message); // Warn instead of log
        });
      }
    } catch (error) {
      console.error('Error locking orientation:', error);
    }
  }, [isVideoVertical]); // Dependency on isVideoVertical

  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      const currentIsVideoVertical = videoHeight > videoWidth;
      setIsVideoVertical(currentIsVideoVertical);
      if (isFullScreen) {
        // Call requestOrientationLock directly, it uses the latest isVideoVertical due to useCallback's closure
         requestOrientationLock();
      }
    }
  };
  
  const toggleFullScreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current
        .requestFullscreen()
        .then(() => {
          // setIsFullScreen(true); // Handled by fullscreenchange event
          // requestOrientationLock(); // Called by fullscreenchange event listener if metadata loaded
        })
        .catch((err) => {
          console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
      document.exitFullscreen(); // setIsFullScreen(false) handled by event
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentlyFullScreen = !!document.fullscreenElement;
      setIsFullScreen(currentlyFullScreen);
      if (currentlyFullScreen && videoRef.current && videoRef.current.videoWidth > 0) {
         requestOrientationLock();
      } else if (!currentlyFullScreen && window.screen.orientation && typeof window.screen.orientation.unlock === 'function') {
         window.screen.orientation.unlock();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [requestOrientationLock]); // Now depends on the memoized requestOrientationLock

  const handleUserInteraction = () => {
    setIsControlsVisible(true);
  };

  const handleBack = () => {
    navigate(-1);
  };

  if (!streamState || !streamState.manifestUrl) {
    return (
      <div className="w-full h-screen flex justify-center items-center bg-black text-white">
        <div className="text-2xl p-5 text-center">
          {streamState === null ? 'Loading stream information...' : 'No active stream available.'}
        </div>
      </div>
    );
  }

  const playerContainerClasses = `relative w-full h-screen bg-black overflow-hidden ${
    isFullScreen ? 'fixed inset-0 z-[9999]' : ''
  }`;
  const videoElementClasses = `w-full h-full object-contain ${
    isVideoVertical ? 'max-w-full max-h-full' : '' // This logic might need review for vertical videos in fullscreen
  }`;
  const controlsClasses = `absolute inset-0 flex flex-col justify-between p-4 bg-gradient-to-b from-[rgba(0,0,0,0.7)] from-0% via-transparent via-20% to-transparent to-80% to-[rgba(0,0,0,0.7)] to-100% transition-opacity duration-300 ease-in-out ${
    isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
  }`;
  const buttonClasses =
    'bg-black/50 rounded-full w-10 h-10 flex justify-center items-center text-white cursor-pointer p-0';

  return (
    <div
      ref={playerContainerRef}
      className={playerContainerClasses}
      onClick={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      <video
        ref={videoRef}
        className={videoElementClasses}
        onLoadedMetadata={handleMetadataLoaded}
        playsInline
      />

      <div className={controlsClasses}>
        <div className="flex justify-between items-center w-full">
          <button
            className={buttonClasses}
            onClick={handleBack}
            aria-label="Back to app"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>

          <div className="text-white text-lg font-bold truncate px-2" title={streamState.manifestUrl
              .split('/')
              .pop()
              ?.replace(/\.(mpd|m3u8)$/i, '')
              .replace(/_/g, ' ')}>
            {streamState.manifestUrl
              .split('/')
              .pop()
              ?.replace(/\.(mpd|m3u8)$/i, '')
              .replace(/_/g, ' ')}
          </div>

          <button
            className={buttonClasses}
            onClick={toggleFullScreen}
            aria-label={isFullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              {isFullScreen ? (
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              ) : (
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              )}
            </svg>
          </button>
        </div>
        <div></div> {/* Placeholder for bottom controls */}
      </div>
    </div>
  );
};

export default VideoPlayer;
