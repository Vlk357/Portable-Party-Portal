import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Assuming shaka types are globally available via your types/index.ts setup

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number;
}

const VideoPlayer: React.FC = () => {
  // const videoRef = useRef<HTMLVideoElement>(null); // OLD
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    // This callback is called when the ref is attached or detached
    if (node) {
      // Ref is attached to a DOM element
      console.log('VideoRef Callback: Node attached:', node);
      setVideoElement(node);
    } else {
      // Ref is detached (e.g., component unmounts)
      console.log('VideoRef Callback: Node detached.');
      // Potentially clean up things related to the old video element if necessary
    }
  }, []); // Empty dependency array means this callback itself doesn't change

  const playerRef = useRef<shaka.Player | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [isVideoVertical, setIsVideoVertical] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const navigate = useNavigate();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [shakaPlayerInstance, setShakaPlayerInstance] = useState<shaka.Player | null>(null);

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
    console.log('VideoPlayer: Main data fetching useEffect runs');

    const MERCURE_STREAM_UPDATES_TOPIC = '/cinema/stream/updates';

    const setupMercureListener = (currentManifestUrl: string) => {
      if (eventSource) {
        console.log('Mercure: Closing existing EventSource.');
        eventSource.close();
      }
      const mercureUrl = new URL(
        '/.well-known/mercure',
        window.location.origin
      );
      mercureUrl.searchParams.append('topic', MERCURE_STREAM_UPDATES_TOPIC);
      console.log(
        'Mercure: Setting up new EventSource for URL:',
        mercureUrl.toString()
      );

      eventSource = new EventSource(mercureUrl.toString());

      eventSource.onopen = () => {
        console.log('Mercure: Connection opened.');
      };

      eventSource.onmessage = (event) => {
        console.log('Mercure: Message received:', event.data);
        try {
          const update = JSON.parse(event.data) as Partial<
            Pick<StreamState, 'playbackState' | 'videoPlaybackTimeMs'>
          >;
          setStreamState((prevState) => {
            if (
              !prevState ||
              !prevState.manifestUrl ||
              !currentManifestUrl || 
              prevState.manifestUrl !== currentManifestUrl
            ) {
              console.log(
                'Mercure: State update skipped. PrevManifest:', prevState?.manifestUrl, 'CurrentManifest:', currentManifestUrl
              );
              return prevState;
            }
            console.log('Mercure: Applying state update:', update);
            return {
              ...prevState,
              ...(update.playbackState && {
                playbackState: update.playbackState,
              }),
              ...(typeof update.videoPlaybackTimeMs === 'number' && {
                videoPlaybackTimeMs: update.videoPlaybackTimeMs,
              }),
            };
          });
        } catch (e) {
          console.error('Mercure: Error parsing message:', e);
        }
      };

      eventSource.onerror = (error) => {
        console.error('Mercure: EventSource failed:', error);
      };
    };

    const fetchStreamInfo = async () => {
      console.log('FetchStreamInfo: Attempting to fetch /cinema/api/stream/info');
      try {
        const response = await fetch('/cinema/api/stream/info');
        console.log('FetchStreamInfo: Response status:', response.status);
        if (response.ok) {
          const data: StreamState = await response.json();
          console.log('FetchStreamInfo: Data received:', data);
          
          setStreamState(prevStreamState => {
            if (data.manifestUrl && data.manifestUrl !== prevStreamState?.manifestUrl) {
                 console.log('FetchStreamInfo: New or changed manifest, setting up Mercure for:', data.manifestUrl);
                 setupMercureListener(data.manifestUrl);
            } else if (!data.manifestUrl && prevStreamState?.manifestUrl) {
                 console.log('FetchStreamInfo: Manifest removed, closing Mercure.');
                 eventSource?.close();
            }
            return data;
          });

          if (data.manifestUrl) {
            if (pollingIntervalId) {
              console.log('FetchStreamInfo: Active stream found, clearing polling interval.');
              clearInterval(pollingIntervalId);
              pollingIntervalId = undefined;
            }
          } else {
            console.log('FetchStreamInfo: No active stream, ensuring polling is active.');
            if (eventSource) {
              console.log('FetchStreamInfo: Closing Mercure listener due to no active stream (from fetch).');
              eventSource.close();
            }
            if (!pollingIntervalId) {
              console.log('FetchStreamInfo: Starting polling interval.');
              pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
            }
          }
        } else {
          console.error('FetchStreamInfo: Error fetching stream state: Response not OK', response.status);
          if (!pollingIntervalId) {
            pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
          }
        }
      } catch (error) {
        console.error('FetchStreamInfo: Error fetching stream state:', error);
        if (!pollingIntervalId) {
          pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
        }
      }
    };

    fetchStreamInfo();

    return () => {
      console.log('VideoPlayer: Cleaning up main data fetching useEffect.');
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      eventSource?.close();
    };
  }, []);

  // Initialize Shaka Player when videoElement (from callback ref) is available
  useEffect(() => {
    console.log('ShakaInit Effect: Fired. videoElement (state):', videoElement, 'shakaPlayerInstance (state):', shakaPlayerInstance);

    if (videoElement && !shakaPlayerInstance) {
      console.log('ShakaInit: videoElement available and NO shakaPlayerInstance (state). Initializing...');
      if (window.shaka && window.shaka.Player.isBrowserSupported()) {
        console.log('ShakaInit: Browser supports Shaka Player. Creating new instance...');
        const player = new window.shaka.Player(videoElement); // Use videoElement from state
        
        player.addEventListener('error', (event: shaka.extern.ErrorEvent) => {
          console.error('Shaka Player Error Event:', event.detail);
          setIsPlayerReady(false);
        });

        playerRef.current = player; // Keep the direct ref updated if needed elsewhere
        setShakaPlayerInstance(player); // This will trigger LoadManifest
        console.log('ShakaInit: Player instance CREATED and SET to state. playerRef.current:', playerRef.current);
      } else {
        console.warn('ShakaInit: Shaka Player not available or not supported.');
      }
    } else if (!videoElement) {
        console.log('ShakaInit: videoElement (state) is null. Waiting for it to be set by callback ref.');
    } else if (shakaPlayerInstance) {
        console.log('ShakaInit: shakaPlayerInstance (state) already exists. No re-initialization needed.');
    }

    return () => {
      console.log('ShakaInit Effect: Cleanup. playerRef.current:', playerRef.current);
      if (playerRef.current) {
        console.log('ShakaInit Cleanup: Destroying Shaka Player instance from playerRef.current...');
        playerRef.current.destroy().then(() => {
          console.log('ShakaInit Cleanup: Shaka Player (from playerRef) destroyed successfully.');
        }).catch((e: Error) => console.error('ShakaInit Cleanup: Error destroying Shaka player (from playerRef):', e));
        playerRef.current = null;
      }
      setShakaPlayerInstance(null); // Crucial: ensure state is cleared
      setIsPlayerReady(false);
      console.log('ShakaInit Effect: Cleanup finished. shakaPlayerInstance (state) set to null.');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoElement]); // KEY CHANGE: Depend on videoElement state

  // Load manifest
  useEffect(() => {
    console.log('LoadManifest Effect: Fired. manifestUrl:', streamState?.manifestUrl, 'shakaPlayerInstance:', shakaPlayerInstance, 'videoElement (state):', videoElement);

    setIsPlayerReady(false);

    if (!streamState?.manifestUrl) {
      console.log('LoadManifest: Skipping - no manifestUrl.');
      if (shakaPlayerInstance) {
        console.log('LoadManifest: Unloading current Shaka content due to no manifestUrl.');
        shakaPlayerInstance.unload().catch(e => console.error("Error unloading shaka player", e));
      }
      return;
    }

    if (!videoElement) { // Check videoElement from state
      console.log('LoadManifest: Skipping - no videoElement (from state). This is unexpected if manifestUrl is present and ShakaInit ran.');
      return;
    }

    if (shakaPlayerInstance) {
      console.log('LoadManifest: Using Shaka Player to load manifest:', streamState.manifestUrl);
      const manifestToLoad = `/movies/${streamState.manifestUrl}`;
      shakaPlayerInstance.load(manifestToLoad)
        .then(() => {
          console.log('LoadManifest: Shaka Player loaded manifest successfully:', manifestToLoad);
          setIsPlayerReady(true);
        })
        .catch((error: shaka.extern.Error) => {
          console.error('LoadManifest: Shaka Player error loading manifest. Error Code:', error.code, 'Details:', error.detail || error);
          setIsPlayerReady(false);
        });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) { // Use videoElement from state
      console.warn('LoadManifest: shakaPlayerInstance is NULL. Attempting NATIVE HLS playback for:', streamState.manifestUrl);
      const manifestToLoad = `/movies/${streamState.manifestUrl}`;
      if (videoElement.src !== manifestToLoad) {
        videoElement.src = manifestToLoad;
        videoElement.onloadeddata = () => {
          console.log('LoadManifest: Native HLS video onloadeddata for', manifestToLoad);
          setIsPlayerReady(true);
        };
        videoElement.onerror = (e) => {
          console.error('LoadManifest: Native HLS video error.', 'Video Element Error:', videoElement?.error, 'Event:', e);
          setIsPlayerReady(false);
        };
        videoElement.load();
      } else {
        setIsPlayerReady(true); // Already loaded
      }
    } else {
      console.log('LoadManifest: No suitable player. shakaPlayerInstance is NULL, and native HLS not supported or videoElement missing.');
    }
  }, [streamState?.manifestUrl, shakaPlayerInstance, videoElement]); // Add videoElement to dependencies

  // Handle playback state (play/pause)
  useEffect(() => {
    console.log('PlaybackEffect: Fired. manifestUrl:', streamState?.manifestUrl, 'PlaybackState:', streamState?.playbackState, 'IsPlayerReady:', isPlayerReady);
    if (!videoElement || !streamState?.manifestUrl || !isPlayerReady) { // Use videoElement from state
      console.log('PlaybackEffect: Skipping - conditions not met.');
      return;
    }

    // const videoEl = videoElement; // Already have videoElement
    if (streamState.playbackState === 'playing') {
      console.log('PlaybackEffect: Attempting to play...');
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('PlaybackEffect: Play command successful.');
        }).catch(error => {
          if (error.name !== 'AbortError') {
            console.error('PlaybackEffect: Error playing video:', error.name, error.message, error);
          } else {
            console.warn('PlaybackEffect: Play command aborted (likely by another action).');
          }
        });
      }
    } else { 
      console.log('PlaybackEffect: Attempting to pause.');
      videoElement.pause();
      console.log('PlaybackEffect: Pause command issued.');
    }
  }, [streamState?.playbackState, streamState?.manifestUrl, isPlayerReady, videoElement]); // Add videoElement

  // Handle seeking
  useEffect(() => {
    console.log('SeekEffect: Fired. manifestUrl:', streamState?.manifestUrl, 'TimeMs:', streamState?.videoPlaybackTimeMs, 'IsPlayerReady:', isPlayerReady);
    if (!videoElement || !streamState?.manifestUrl || typeof streamState.videoPlaybackTimeMs !== 'number' || streamState.videoPlaybackTimeMs < 0 || !isPlayerReady) { // Use videoElement
      console.log('SeekEffect: Skipping - conditions not met.');
      return;
    }

    const targetTime = streamState.videoPlaybackTimeMs / 1000;
    
    let canSeek = false;
    let currentSeekableString = "not available";

    if (shakaPlayerInstance) {
        const seekRange = shakaPlayerInstance.seekRange();
        currentSeekableString = `Shaka Range: [${seekRange.start?.toFixed(3)}, ${seekRange.end?.toFixed(3)}]`;
        if (targetTime >= seekRange.start && targetTime <= seekRange.end) {
            canSeek = true;
        }
    } else if (videoElement.seekable && videoElement.seekable.length > 0) { // Native
        currentSeekableString = `Native Ranges: `;
        for (let i = 0; i < videoElement.seekable.length; i++) {
            currentSeekableString += `[${videoElement.seekable.start(i).toFixed(3)}, ${videoElement.seekable.end(i).toFixed(3)}] `;
            if (targetTime >= videoElement.seekable.start(i) && targetTime <= videoElement.seekable.end(i)) {
                canSeek = true;
            }
        }
    }
    
    console.log(`SeekEffect: Target time: ${targetTime.toFixed(3)}s. Current video time: ${videoElement.currentTime.toFixed(3)}s. Seekable: ${currentSeekableString}`);

    if (canSeek && Math.abs(videoElement.currentTime - targetTime) > 1.5) {
      console.log(`SeekEffect: Seeking to ${targetTime.toFixed(3)}.`);
      videoElement.currentTime = targetTime;
    } else if (canSeek) {
      console.log(`SeekEffect: Target time ${targetTime.toFixed(3)}s is close enough or already there. No seek needed.`);
    } else {
      console.log(`SeekEffect: Cannot seek to ${targetTime.toFixed(3)}s (outside seekable range or range not available).`);
    }
  }, [streamState?.videoPlaybackTimeMs, streamState?.manifestUrl, isPlayerReady, shakaPlayerInstance, videoElement]); // Add videoElement

  const requestOrientationLock = useCallback(() => {
    if (!videoElement) return; // Use videoElement
    try {
      if (
        window.screen.orientation &&
        typeof window.screen.orientation.lock === 'function'
      ) {
        const lockOrientation = isVideoVertical ? 'portrait' : 'landscape';
        window.screen.orientation.lock(lockOrientation).catch((e: Error) => {
          console.warn(`Failed to lock to ${lockOrientation}:`, e.message);
        });
      }
    } catch (error) {
      console.error('Error locking orientation:', error);
    }
  }, [isVideoVertical, videoElement]); // Add videoElement

  const handleMetadataLoaded = () => {
    if (videoElement) { // Use videoElement
      console.log(
        'Video metadata loaded: Width=', videoElement.videoWidth,
        'Height=', videoElement.videoHeight,
        'Duration=', videoElement.duration
      );
      const { videoWidth, videoHeight } = videoElement;
      const currentIsVideoVertical = videoHeight > videoWidth;
      setIsVideoVertical(currentIsVideoVertical);
      if (isFullScreen) {
        requestOrientationLock(); // requestOrientationLock now depends on videoElement
      }
    }
  };

  const toggleFullScreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentlyFullScreen = !!document.fullscreenElement;
      setIsFullScreen(currentlyFullScreen);
      if (
        currentlyFullScreen &&
        videoElement &&
        videoElement.videoWidth > 0
      ) {
        requestOrientationLock();
      } else if (
        !currentlyFullScreen &&
        window.screen.orientation &&
        typeof window.screen.orientation.unlock === 'function'
      ) {
        window.screen.orientation.unlock();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [requestOrientationLock, videoElement]); // Added videoElement here

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
          {streamState === null
            ? 'Loading stream information...'
            : 'No active stream available.'}
        </div>
      </div>
    );
  }

  const playerContainerClasses = `relative w-full h-screen bg-black overflow-hidden ${
    isFullScreen ? 'fixed inset-0 z-[9999]' : ''
  }`;
  const videoElementClasses = `w-full h-full object-contain ${
    isVideoVertical ? 'max-w-full max-h-full' : ''
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
        ref={videoRef} // Use the callback ref here
        className={videoElementClasses}
        onLoadedMetadata={handleMetadataLoaded}
        playsInline
        autoPlay={false} // Explicitly set autoPlay to false, Shaka will handle play
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

          <div
            className="text-white text-lg font-bold truncate px-2"
            title={streamState.manifestUrl
              .split('/')
              .pop()
              ?.replace(/\.(mpd|m3u8)$/i, '')
              .replace(/_/g, ' ')}
          >
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
