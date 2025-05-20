import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useShell } from '../../../shell/src/app/context/ShellContext';
import { HamburgerIcon } from '../../../shell/src/app/components/HamburgerIcon'; // Ensure this path is correct

// Ensure shaka types are globally available (e.g., via a types/index.d.ts or by installing @types/shaka-player)

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number; // Unix timestamp in milliseconds
}

const loadScript = (src: string, id: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      if (window.shaka?.ui) { // Check for shaka.ui specifically
        resolve();
        return;
      }
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.shaka?.ui) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(new Error(`Shaka Player UI not available after script ${id} was found.`));
        }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = src; script.id = id; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });
};

// --- HamburgerButtonFactory is NO LONGER NEEDED if we use a React overlay ---
// const HamburgerButtonFactory = { ... }; 

const VideoPlayer: React.FC = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => setVideoElement(node), []);

  const playerRef = useRef<shaka.Player | null>(null);
  const uiRef = useRef<shaka.ui.Overlay | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [shakaPlayerInstance, setShakaPlayerInstance] = useState<shaka.Player | null>(null);
  const [hasInitialSeekCompleted, setHasInitialSeekCompleted] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(!!document.fullscreenElement);

  const { toggleDrawer, isDrawerOpen } = useShell();
  const [shakaScriptLoaded, setShakaScriptLoaded] = useState(!!(window.shaka && window.shaka.ui));

  const isCatchingUpRate = useRef(false);
  const targetCatchUpTime = useRef(0);
  const lastUserInteractionTime = useRef(0);

  // Fetch initial stream state and set up Mercure listener (largely unchanged)
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
          const updateFromServer = JSON.parse(
            event.data
          ) as Partial<StreamState>;
          // Backend now sends stateUpdateServerTime in milliseconds.
          // The previous heuristic conversion is no longer needed here.
          const processedUpdate = { ...updateFromServer };

          // Optional: Log to verify the format of received stateUpdateServerTime
          if (typeof processedUpdate.stateUpdateServerTime === 'number') {
            console.log(
              'Mercure: Received stateUpdateServerTime (should be ms):',
              processedUpdate.stateUpdateServerTime
            );
          }

          setStreamState((prevState) => {
            if (
              !prevState ||
              !prevState.manifestUrl ||
              !currentManifestUrl ||
              prevState.manifestUrl !== currentManifestUrl
            ) {
              console.log(
                'Mercure: State update skipped. PrevManifest:',
                prevState?.manifestUrl,
                'CurrentManifest:',
                currentManifestUrl
              );
              return prevState;
            }
            console.log(
              'Mercure: Applying processed state update:',
              processedUpdate
            );
            const newState = { ...prevState };
            if (processedUpdate.playbackState) {
              newState.playbackState = processedUpdate.playbackState;
            }
            if (typeof processedUpdate.videoPlaybackTimeMs === 'number') {
              newState.videoPlaybackTimeMs =
                processedUpdate.videoPlaybackTimeMs;
            }
            if (typeof processedUpdate.stateUpdateServerTime === 'number') {
              newState.stateUpdateServerTime =
                processedUpdate.stateUpdateServerTime;
            }
            return newState;
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
      console.log(
        'FetchStreamInfo: Attempting to fetch /cinema/api/stream/info'
      );
      try {
        const response = await fetch('/cinema/api/stream/info');
        console.log('FetchStreamInfo: Response status:', response.status);
        if (response.ok) {
          const data: StreamState = await response.json();
          console.log(
            'FetchStreamInfo: Data received (raw):',
            JSON.parse(JSON.stringify(data))
          );

          // Backend now sends stateUpdateServerTime in milliseconds.
          // The previous heuristic conversion is no longer needed here.
          const processedData = { ...data };

          // Optional: Log to verify the format of received stateUpdateServerTime
          if (typeof processedData.stateUpdateServerTime === 'number') {
            console.log(
              'FetchStreamInfo: Received stateUpdateServerTime (should be ms):',
              processedData.stateUpdateServerTime
            );
          }
          console.log(
            'FetchStreamInfo: Data after ensuring correct time format (no client-side conversion needed for server time):',
            processedData
          );

          setStreamState((prevStreamState) => {
            if (
              processedData.manifestUrl &&
              processedData.manifestUrl !== prevStreamState?.manifestUrl
            ) {
              console.log(
                'FetchStreamInfo: New or changed manifest, setting up Mercure for:',
                processedData.manifestUrl
              );
              setupMercureListener(processedData.manifestUrl);
            } else if (
              !processedData.manifestUrl &&
              prevStreamState?.manifestUrl
            ) {
              console.log(
                'FetchStreamInfo: Manifest removed, closing Mercure.'
              );
              eventSource?.close();
            }
            // Always update to the latest data from fetch, including server time
            return processedData;
          });

          if (processedData.manifestUrl) {
            if (pollingIntervalId) {
              console.log(
                'FetchStreamInfo: Active stream found, clearing polling interval.'
              );
              clearInterval(pollingIntervalId);
              pollingIntervalId = undefined;
            }
          } else {
            console.log(
              'FetchStreamInfo: No active stream, ensuring polling is active.'
            );
            if (eventSource) {
              console.log(
                'FetchStreamInfo: Closing Mercure listener due to no active stream (from fetch).'
              );
              eventSource.close();
            }
            if (!pollingIntervalId) {
              console.log('FetchStreamInfo: Starting polling interval.');
              pollingIntervalId = window.setInterval(fetchStreamInfo, 5000);
            }
          }
        } else {
          console.error(
            'FetchStreamInfo: Error fetching stream state: Response not OK',
            response.status
          );
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

  // Load Shaka Player UI script (and its CSS via HTML)
  useEffect(() => {
    if (!shakaScriptLoaded) {
      console.log('Attempting to load Shaka Player UI script...');
      loadScript('/libs/shaka-player.ui.min.js', 'shaka-player-ui-script')
        .then(() => {
          if (!window.shaka?.ui) {
            console.error("Shaka UI not available after script load.");
            return;
          }
          console.log('Shaka Player UI script dynamically loaded.');
          setShakaScriptLoaded(true);
        })
        .catch(error => console.error('Failed to load Shaka Player UI script:', error));
    }
  }, [shakaScriptLoaded]);

  // Initialize Shaka Player & UI
  useEffect(() => {
    let uiInstance: shaka.ui.Overlay | null = null;

    if (videoElement && shakaScriptLoaded && !playerRef.current && playerContainerRef.current) {

      if (window.shaka && window.shaka.Player.isBrowserSupported() && window.shaka.ui) { // Removed Controls check as we are not registering custom elements

        const player = new window.shaka.Player();
        player.addEventListener('error', (event: shaka.extern.ErrorEvent) => {
          console.error('[VideoPlayer] Shaka Player Error Event:', event.detail);
          setIsPlayerReady(false);
        });
        
        player.attach(videoElement)
          .then(() => {
            playerRef.current = player;
            setShakaPlayerInstance(player);

            const ui = new window.shaka.ui.Overlay(player, playerContainerRef.current!, videoElement);
            uiInstance = ui;
            uiRef.current = ui;
            
            ui.configure({
              // 'hamburger' is removed from controlPanelElements
              'controlPanelElements': ['play_pause', 'spacer', 'volume', 'fullscreen', 'overflow_menu'],
              'overflowMenuButtons': ['language', 'captions', 'quality'], 
              'addBigPlayButton': true, 
              'enableKeyboardPlaybackControls': false,
            });
            console.log('[VideoPlayer] Shaka Player and UI initialized (without custom Shaka hamburger).');
          })
          .catch((error: shaka.extern.Error) => {
            console.error('[VideoPlayer] Error attaching player to videoElement:', error);
          });
      } else {
        console.warn('[VideoPlayer] Shaka Player or UI not available or browser not supported.');
      }
    }

    return () => {
      uiInstance?.destroy().catch(e => console.error("[VideoPlayer] Error destroying Shaka UI", e));
      playerRef.current?.destroy().catch(e => console.error("[VideoPlayer] Error destroying Shaka Player", e));
      uiRef.current = null;
      playerRef.current = null;
      setShakaPlayerInstance(null);
      setIsPlayerReady(false);
      setHasInitialSeekCompleted(false);
    };
  }, [videoElement, shakaScriptLoaded, toggleDrawer]);

  // Load Manifest
  useEffect(() => {
    setIsPlayerReady(false); // Reset readiness
    setHasInitialSeekCompleted(!!streamState?.manifestUrl ? false : true); // Reset seek completion

    if (!streamState?.manifestUrl || !shakaPlayerInstance) {
      shakaPlayerInstance?.unload().catch(e => console.error('Error unloading Shaka content', e));
      return;
    }

    const manifestToLoad = `/movies/${streamState.manifestUrl}`; // Ensure this path is correct
    console.log('LoadManifest: Loading:', manifestToLoad);
    shakaPlayerInstance.load(manifestToLoad)
      .then(() => {
        console.log('LoadManifest: Success:', manifestToLoad);
        setIsPlayerReady(true); // Player is ready for SeekEffect
      })
      .catch((error: shaka.extern.Error) => {
        console.error('LoadManifest: Error loading manifest. Code:', error.code, error);
        setIsPlayerReady(false);
      });
  }, [streamState?.manifestUrl, shakaPlayerInstance]);

  // PlaybackEffect: Syncs player's play/pause state with server state, respecting recent user interactions.
  useEffect(() => {
    if (!videoElement || !isPlayerReady || !streamState?.manifestUrl || videoElement.seeking) {
      return;
    }

    // Give user interactions (via Shaka UI, detected by onPlay/onPause) a grace period
    const GRACE_PERIOD_MS = 2000; // 2 seconds
    if (Date.now() - lastUserInteractionTime.current < GRACE_PERIOD_MS) {
      console.log("PlaybackEffect: Within grace period of user interaction. Deferring to user.");
      return;
    }

    const serverWantsToPlay = streamState.playbackState === 'playing';
    const videoIsActuallyPaused = videoElement.paused;

    if (serverWantsToPlay && videoIsActuallyPaused) {
      console.log("PlaybackEffect: Server wants PLAY, video is PAUSED. Attempting play.");
      videoElement.play().catch(e => console.warn("PlaybackEffect: play() failed", e));
    } else if (!serverWantsToPlay && !videoIsActuallyPaused) { // server wants pause or stopped
      console.log("PlaybackEffect: Server wants PAUSE/STOP, video is PLAYING. Attempting pause.");
      videoElement.pause();
    }
  }, [streamState?.playbackState, videoElement, isPlayerReady, streamState?.manifestUrl]); // Removed lastUserInteractionTime from deps

  // SeekEffect: Handles initial seek and syncs time when server state is paused/stopped.
  useEffect(() => {
    if (!videoElement || !streamState?.manifestUrl || !isPlayerReady || videoElement.seeking) {
      return;
    }

    let targetTimeSeconds: number;
    const serverVideoTimeMs = streamState.videoPlaybackTimeMs;

    if (streamState.playbackState === 'playing') {
      if (hasInitialSeekCompleted) { // For playing state, only do initial seek here
        return;
      }
      // Calculate initial target time for playing state (current server time + buffer)
      const serverTimeAtUpdateMs = streamState.stateUpdateServerTime || Date.now();
      const elapsedTimeSinceUpdateMs = Date.now() - serverTimeAtUpdateMs;
      targetTimeSeconds = (serverVideoTimeMs + elapsedTimeSinceUpdateMs + 1000) / 1000; // 1s buffer
    } else { // Paused or stopped state
      targetTimeSeconds = serverVideoTimeMs / 1000;
    }

    const videoDuration = videoElement.duration;
    if (targetTimeSeconds < 0) targetTimeSeconds = 0;
    if (videoDuration && isFinite(videoDuration) && targetTimeSeconds > videoDuration) {
      targetTimeSeconds = videoDuration;
    }
    
    const SEEK_THRESHOLD = 1.0; // If more than 1s off, seek
    if (Math.abs(videoElement.currentTime - targetTimeSeconds) > SEEK_THRESHOLD) {
      if (isFinite(targetTimeSeconds)) { // Ensure targetTime is a valid number
         console.log(`SeekEffect: Seeking to ${targetTimeSeconds.toFixed(3)}s. Current: ${videoElement.currentTime.toFixed(3)}s. State: ${streamState.playbackState}`);
         videoElement.currentTime = targetTimeSeconds;
      }
    }
    
    if (!hasInitialSeekCompleted) {
      setHasInitialSeekCompleted(true); // Mark initial seek attempt as done
    }
  }, [
    streamState?.videoPlaybackTimeMs,
    streamState?.stateUpdateServerTime,
    streamState?.manifestUrl,
    streamState?.playbackState,
    isPlayerReady,
    videoElement,
    // hasInitialSeekCompleted // Removed to allow re-evaluation if other deps change
  ]);

  // Sync on actual play start (seek or adjust playback rate)
  const syncOnPlay = useCallback(() => {
    if (!videoElement || !streamState || typeof streamState.videoPlaybackTimeMs !== 'number') return;
    lastUserInteractionTime.current = Date.now(); // Record user interaction

    const serverVideoTimeMs = streamState.videoPlaybackTimeMs;
    const serverTimeAtUpdateMs = streamState.stateUpdateServerTime || Date.now();
    const elapsedTimeSinceUpdateMs = Date.now() - serverTimeAtUpdateMs;
    
    const targetTimeSeconds = (serverVideoTimeMs + elapsedTimeSinceUpdateMs) / 1000;
    targetCatchUpTime.current = targetTimeSeconds;

    const currentTimeSeconds = videoElement.currentTime;
    const diffSeconds = currentTimeSeconds - targetTimeSeconds;

    const JUMP_THRESHOLD = 1.5;
    const RATE_ADJUST_THRESHOLD_BEHIND = -0.3; // If more than 0.3s behind

    if (Math.abs(diffSeconds) > JUMP_THRESHOLD) {
      console.log(`syncOnPlay: Jumping. Current: ${currentTimeSeconds.toFixed(2)}, Target: ${targetTimeSeconds.toFixed(2)}`);
      if (isFinite(targetTimeSeconds)) videoElement.currentTime = targetTimeSeconds;
      videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    } else if (diffSeconds < RATE_ADJUST_THRESHOLD_BEHIND) {
      console.log(`syncOnPlay: Speeding up. Current: ${currentTimeSeconds.toFixed(2)}, Target: ${targetTimeSeconds.toFixed(2)}`);
      videoElement.playbackRate = 1.2;
      isCatchingUpRate.current = true;
    } else {
      videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
  }, [videoElement, streamState]);

  // Handle time updates for playback rate adjustment
  const handleTimeUpdate = useCallback(() => {
    if (isCatchingUpRate.current && videoElement) {
      if (videoElement.currentTime >= targetCatchUpTime.current - 0.1) { // Small tolerance
        console.log("handleTimeUpdate: Caught up or very close, resetting playback rate.");
        videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
      }
    }
  }, [videoElement]);

  const handleMetadataLoaded = useCallback(() => {
    // ... your existing orientation logic if needed ...
  }, [videoElement /*, isFullScreen, requestOrientationLock */]);


  // Re-introduce handleReactHamburgerClick to manage fullscreen exit and prevent default if necessary
  const handleReactHamburgerClick = (event?: React.MouseEvent) => {
    // If HamburgerIcon was an <a> tag, preventDefault would be important.
    // For a <button type="button">, it's less critical for page reloads but good for consistency.
    event?.preventDefault(); 
    
    console.log('[VideoPlayer] React HamburgerIcon clicked.');
    lastUserInteractionTime.current = Date.now(); // Good to keep track of interactions

    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => {
        toggleDrawer();
      }).catch(err => {
        console.error("Error exiting fullscreen:", err);
        toggleDrawer(); // Still attempt to toggle drawer
      });
    } else {
      toggleDrawer();
    }
  };
  
  // Fullscreen state management
  useEffect(() => {
    const cb = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', cb);
    return () => document.removeEventListener('fullscreenchange', cb);
  }, []);


  // Render loading/no stream states
  if (!shakaScriptLoaded && !(window.shaka && window.shaka.ui)) {
    return <div className="w-full h-screen flex justify-center items-center bg-black text-white">Loading player library...</div>;
  }
  
  const showNoStreamHamburger = !isDrawerOpen && (!streamState || !streamState.manifestUrl);

  return (
    <div
      ref={playerContainerRef}
      // The z-[9999] on the container in fullscreen is very high.
      // The hamburger, being a child, will be within this stacking context.
      className={`relative w-full h-screen bg-black overflow-hidden ${isFullScreen ? 'fixed inset-0 z-[9999]' : ''}`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        // ... (keep existing video props) ...
        className="w-full h-full object-contain"
        playsInline
        autoPlay={false}
        onPlay={() => {
          console.log('Video Event: onPlay');
          syncOnPlay();
          lastUserInteractionTime.current = Date.now();
        }}
        onPause={() => {
          console.log('Video Event: onPause');
          if (videoElement) videoElement.playbackRate = 1.0;
          isCatchingUpRate.current = false;
          lastUserInteractionTime.current = Date.now();
        }}
        onPlaying={() => { /* ... */ }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleMetadataLoaded}
        onError={(e: React.SyntheticEvent<HTMLVideoElement, Event>) => console.error('Native video error:', e.currentTarget.error)}
        onSeeking={() => console.log("Video Event: seeking")}
        onSeeked={() => console.log("Video Event: seeked")}
      />

      {/* Hamburger Icon Overlay - Rendered by React */}
      {(!isDrawerOpen && streamState?.manifestUrl) && (
        // Using a very high z-index for the hamburger itself, relative to its parent container.
        // This should ensure it's on top of Shaka's UI elements if they also have z-indexes.
        <div className="absolute top-4 left-4 z-[10000]"> 
          <HamburgerIcon 
            onClick={handleReactHamburgerClick} // Use the dedicated handler
            className="text-white bg-black bg-opacity-50 p-2 rounded-full cursor-pointer"
          />
        </div>
      )}
      
      {showNoStreamHamburger && (
         <div className="absolute top-4 left-4 z-[10000]"> {/* Consistent high z-index */}
            <HamburgerIcon 
              onClick={handleReactHamburgerClick} // Use the dedicated handler
              className="text-white cursor-pointer" 
            />
          </div>
      )}

      {(!streamState || !streamState.manifestUrl) && (
        <div className="absolute inset-0 flex justify-center items-center text-2xl p-5 text-center text-white pointer-events-none">
          {streamState === null ? 'Loading stream information...' : 'No active stream available.'}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
