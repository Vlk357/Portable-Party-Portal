import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useShell } from '../../../shell/src/app/context/ShellContext';
import { HamburgerIcon } from '../../../shell/src/app/components/HamburgerIcon';

// Assuming shaka types are globally available via your types/index.ts setup

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number; // Unix timestamp in milliseconds
}

// Helper function to load a script dynamically
const loadScript = (src: string, id: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      // Script already loaded or loading
      // Check if shaka is available, if so resolve, otherwise wait a bit
      if (window.shaka) {
        resolve();
        return;
      }
      // Simple polling check if another instance is loading it
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.shaka) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) { // Timeout after ~5 seconds
          clearInterval(interval);
          console.error(`Timeout waiting for Shaka Player to be available after script tag for ${id} was found.`);
          reject(new Error(`Shaka Player not available after script ${id} was found.`));
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.id = id;
    script.async = true;
    script.onload = () => {
      console.log(`Script ${src} loaded successfully.`);
      resolve();
    };
    script.onerror = () => {
      console.error(`Failed to load script ${src}.`);
      reject(new Error(`Failed to load script ${src}`));
    };
    document.head.appendChild(script);
  });
};

const VideoPlayer: React.FC = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  );
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      console.log('VideoRef Callback: Node attached:', node);
      setVideoElement(node);
    } else {
      console.log('VideoRef Callback: Node detached.');
    }
  }, []);

  const playerRef = useRef<shaka.Player | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [isVideoVertical, setIsVideoVertical] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [shakaPlayerInstance, setShakaPlayerInstance] =
    useState<shaka.Player | null>(null);
  const [isMutedForAutoplay, setIsMutedForAutoplay] = useState(true); // New state for muted autoplay
  const [hasInitialSeekCompleted, setHasInitialSeekCompleted] = useState(false); // New state
  const [isPlayingVisual, setIsPlayingVisual] = useState(false);
  const [lastUserAction, setLastUserAction] = useState<{
    type: 'play' | 'pause';
    time: number;
  } | null>(null);
  const { toggleDrawer } = useShell();
  const [shakaScriptLoaded, setShakaScriptLoaded] = useState(!!window.shaka); // Check if already loaded

  // Control visibility timer
  useEffect(() => {
    let hideTimeout: number;
    if (
      isControlsVisible &&
      streamState?.playbackState === 'playing' &&
      !isMutedForAutoplay &&
      !videoElement?.paused
    ) {
      // Hide only if playing and unmuted AND video not paused
      hideTimeout = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, 3000);
    }
    return () => {
      clearTimeout(hideTimeout);
    };
  }, [
    isControlsVisible,
    streamState?.playbackState,
    isMutedForAutoplay,
    videoElement?.paused,
  ]);

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

  // Load Shaka Player script dynamically
  useEffect(() => {
    if (!shakaScriptLoaded) {
      console.log('VideoPlayer: Attempting to dynamically load Shaka Player script...');
      // The path '/libs/shaka-player.ui.min.js' assumes it's served from the root
      // of your shell application (from shell/public/libs/)
      loadScript('/libs/shaka-player.ui.min.js', 'shaka-player-script')
        .then(() => {
          console.log('VideoPlayer: Shaka Player script dynamically loaded and available.');
          setShakaScriptLoaded(true);
        })
        .catch(error => {
          console.error('VideoPlayer: Failed to load Shaka Player script:', error);
          // Handle error appropriately, e.g., show an error message to the user
        });
    }
  }, [shakaScriptLoaded]); // Re-run if shakaScriptLoaded changes (though it only goes false -> true)

  // Initialize Shaka Player
  useEffect(() => {
    console.log(
      'ShakaInit Effect: Fired. shakaScriptLoaded:', shakaScriptLoaded,
      'videoElement (state):', videoElement
    );

    if (!shakaScriptLoaded) {
      console.log('ShakaInit: Shaka Player script not yet loaded. Waiting...');
      return; 
    }

    // Player creation should happen only if videoElement is available AND no player exists yet in playerRef
    if (videoElement && !playerRef.current) {
      console.log(
        'ShakaInit: videoElement available, script loaded, and NO player in playerRef. Initializing...'
      );
      if (window.shaka && window.shaka.Player.isBrowserSupported()) {
        console.log(
          'ShakaInit: Browser supports Shaka Player. Creating new instance...'
        );
        const player = new window.shaka.Player(); // Initialize without media element

        player.addEventListener('error', (event: shaka.extern.ErrorEvent) => {
          console.error('Shaka Player Error Event:', event.detail);
          setIsPlayerReady(false);
        });

        player
          .attach(videoElement) // Attach to the video element
          .then(() => {
            console.log('ShakaInit: Player ATTACHED to videoElement.');
            playerRef.current = player; // Store in ref
            setShakaPlayerInstance(player); // Update state to trigger other effects
            console.log(
              'ShakaInit: Player instance CREATED and SET. playerRef.current:',
              playerRef.current
            );
          })
          .catch((error: shaka.extern.Error) => {
            console.error(
              'ShakaInit: Error attaching player to videoElement:',
              error
            );
            playerRef.current = null;
            setShakaPlayerInstance(null);
          });
      } else {
        console.warn('ShakaInit: Shaka Player not available or not supported.');
      }
    } else if (!videoElement) {
      console.log(
        'ShakaInit: videoElement (state) is null. Waiting for it to be set by callback ref.'
      );
    } else if (playerRef.current) {
      console.log(
        'ShakaInit: Player already exists in playerRef. No re-initialization needed.'
      );
    }

    // Cleanup function
    return () => {
      console.log(
        'ShakaInit Effect: Cleanup. playerRef.current before destroy:',
        playerRef.current
      );
      if (playerRef.current) {
        console.log(
          'ShakaInit Cleanup: Attempting to destroy Shaka Player instance from playerRef.current...'
        );
        playerRef.current
          .destroy()
          .then(() => {
            console.log(
              'ShakaInit Cleanup: Shaka Player (from playerRef) destroyed successfully.'
            );
          })
          .catch((e: shaka.extern.Error | Error) => // Catch Shaka specific or generic error
            console.error(
              'ShakaInit Cleanup: Error destroying Shaka player (from playerRef):',
              e
            )
          )
          .finally(() => {
            playerRef.current = null;
            setShakaPlayerInstance(null);
            setIsPlayerReady(false);
            setHasInitialSeekCompleted(false);
            console.log(
              'ShakaInit Effect: Cleanup finished. playerRef and shakaPlayerInstance (state) set to null.'
            );
          });
      } else {
        // If playerRef.current is already null, still ensure dependent states are reset
        setShakaPlayerInstance(null);
        setIsPlayerReady(false);
        setHasInitialSeekCompleted(false);
        console.log(
          'ShakaInit Effect: Cleanup. No player in playerRef to destroy. Ensured state is clean.'
        );
      }
    };
  }, [videoElement, shakaScriptLoaded]); // Dependencies: only videoElement and shakaScriptLoaded

  // Load manifest
  useEffect(() => {
    console.log(
      'LoadManifest Effect: Fired. manifestUrl:',
      streamState?.manifestUrl,
      'shakaPlayerInstance:', // This will now be the state variable
      shakaPlayerInstance,
      'videoElement (state):',
      videoElement
    );

    // Always reset player readiness when manifest or player changes
    setIsPlayerReady(false);
    // When a new manifest is being loaded (or cleared), reset the initial seek completion flag.
    // This ensures the PlaybackEffect waits for the new content's initial seek.
    if (streamState?.manifestUrl) {
      setHasInitialSeekCompleted(false);
    } else {
      // If no manifest, effectively no initial seek is pending that PlaybackEffect should wait for.
      // Setting to true prevents PlaybackEffect from being stuck if manifest is removed.
      setHasInitialSeekCompleted(true);
    }

    if (!streamState?.manifestUrl) {
      console.log('LoadManifest: Skipping - no manifestUrl.');
      if (shakaPlayerInstance) {
        console.log(
          'LoadManifest: Unloading current Shaka content due to no manifestUrl.'
        );
        shakaPlayerInstance
          .unload()
          .catch((e: shaka.extern.Error | Error) =>
            console.error('Error unloading shaka player', e)
          );
      }
      return;
    }

    if (!videoElement) {
      console.log('LoadManifest: Skipping - no videoElement (from state).');
      return;
    }
    if (!shakaPlayerInstance) {
      console.log(
        'LoadManifest: Skipping - no shakaPlayerInstance (from state).'
      );
      return;
    }

    // The 'muted' prop on <video> and PlaybackEffect handle muting for autoplay.
    // No need to set videoElement.muted here based on isMutedForAutoplay.

    console.log(
      'LoadManifest: Using Shaka Player to load manifest:',
      streamState.manifestUrl
    );
    const manifestToLoad = `/movies/${streamState.manifestUrl}`;
    shakaPlayerInstance
      .load(manifestToLoad)
      .then(() => {
        console.log(
          'LoadManifest: Shaka Player loaded manifest successfully:',
          manifestToLoad
        );
        setIsPlayerReady(true); // Player is ready after manifest loads
        // Note: setHasInitialSeekCompleted is NOT set here. SeekEffect will handle it.
      })
      .catch((error: shaka.extern.Error) => {
        console.error(
          'LoadManifest: Shaka Player error loading manifest. Error Code:',
          error.code,
          'Details:',
          error.detail || error
        );
        setIsPlayerReady(false);
        setHasInitialSeekCompleted(false); // If load fails, ensure it's reset
      });
  }, [streamState?.manifestUrl, shakaPlayerInstance, videoElement]);

  // Handle playback state (play/pause)
  useEffect(() => {
    const effectId = Date.now(); // Unique ID for this effect run for logging
    console.log(
      `PlaybackEffect (${effectId}): Fired. Manifest:`,
      streamState?.manifestUrl,
      'ServerState:',
      streamState?.playbackState,
      'PlayerReady:',
      isPlayerReady,
      'MutedAutoplay:',
      isMutedForAutoplay,
      'InitialSeekDone:',
      hasInitialSeekCompleted,
      'LastUser:',
      lastUserAction,
      'VideoActuallyPaused:',
      videoElement?.paused
    );

    if (!videoElement || !streamState?.manifestUrl || !isPlayerReady) {
      console.log(
        `PlaybackEffect (${effectId}): Skipping - conditions not met.`
      );
      return;
    }

    const serverWantsToPlay = streamState.playbackState === 'playing';
    const serverWantsToPause =
      streamState.playbackState === 'paused' ||
      streamState.playbackState === 'stopped';
    const videoIsActuallyPaused = videoElement.paused;

    // --- Server-commanded Pause takes precedence ---
    if (serverWantsToPause) {
      if (!videoIsActuallyPaused) {
        console.log(
          `PlaybackEffect (${effectId}): Server state is ${streamState.playbackState}, video is PLAYING. Forcing PAUSE.`
        );
        videoElement.pause();
      } else {
        // console.log(`PlaybackEffect (${effectId}): Server state is ${streamState.playbackState}, video is already PAUSED.`);
      }
      // If server commands pause, we clear any conflicting user 'play' action.
      // User 'pause' action is fine, it aligns.
      if (lastUserAction?.type === 'play') {
        console.log(
          `PlaybackEffect (${effectId}): Server commanded PAUSE, clearing user 'play' action.`
        );
        setLastUserAction(null); // This will cause a re-run, but next time server pause will be handled.
      }
      return; // Server pause is definitive for this run.
    }

    // --- Handle User Actions & Server Play State ---
    if (lastUserAction && Date.now() < lastUserAction.time + 750) {
      // 750ms grace period
      console.log(
        `PlaybackEffect (${effectId}): Within user action grace period. Action: ${lastUserAction.type}`
      );
      if (lastUserAction.type === 'pause') {
        // User explicitly paused. If video is indeed paused, respect it even if server wants to play.
        if (videoIsActuallyPaused) {
          console.log(
            `PlaybackEffect (${effectId}): Respecting user PAUSE. Video is paused. Server wants to PLAY. Holding off play.`
          );
          return;
        } else {
          // This case should be rare if pause is immediate, but if somehow video is playing after user pause intent:
          console.log(
            `PlaybackEffect (${effectId}): User action was PAUSE, but video is playing. Forcing pause (within grace).`
          );
          videoElement.pause(); // Ensure it's paused
          return;
        }
      } else if (lastUserAction.type === 'play') {
        // User wants to play. Server also wants to play (since serverWantsToPause was false).
        // If initial seek is not yet complete (because user just clicked play), wait for seek.
        if (!hasInitialSeekCompleted && serverWantsToPlay) {
          console.log(
            `PlaybackEffect (${effectId}): User wants PLAY, server wants PLAY, but initial seek not done. Waiting for seek.`
          );
          return;
        }
        // If seek is complete, and video is paused, proceed to play (handled below by main play logic).
        // If video is already playing, this 'play' action is effectively a confirmation, do nothing extra here.
      }
    } else if (lastUserAction) {
      // Grace period ended for a user action that wasn't a server-commanded pause override.
      console.log(
        `PlaybackEffect (${effectId}): Grace period for user action ${lastUserAction.type} ended. Clearing lastUserAction.`
      );
      setLastUserAction(null);
      return; // Re-run effect with server state taking full precedence.
    }

    // If initial seek is not completed, and server wants to play, defer action until seek is done.
    // This is crucial after a user 'play' action that triggers a re-seek, or initial load.
    if (!hasInitialSeekCompleted && serverWantsToPlay) {
      console.log(
        `PlaybackEffect (${effectId}): Server wants to PLAY, but initial seek not complete. Waiting for seek.`
      );
      return;
    }

    // --- Main Play Logic (Server wants to play, no conflicting user pause in grace period) ---
    if (serverWantsToPlay) {
      if (videoIsActuallyPaused) {
        console.log(
          `PlaybackEffect (${effectId}): Server state is PLAYING, video is PAUSED. Attempting to play...`
        );
        if (isMutedForAutoplay) {
          // Ensure muted if still in autoplay phase
          if (videoElement.muted === false) videoElement.muted = true;
        }

        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() =>
              console.log(
                `PlaybackEffect (${effectId}): Play command successful.`
              )
            )
            .catch((error) => {
              if (error.name === 'NotAllowedError') {
                console.warn(
                  `PlaybackEffect (${effectId}): Play was prevented by browser autoplay policy. isMutedForAutoplay: ${isMutedForAutoplay}, video.muted: ${videoElement.muted}`
                );
              } else if (error.name !== 'AbortError') {
                console.error(
                  `PlaybackEffect (${effectId}): Error playing video:`,
                  error
                );
              } else {
                console.warn(
                  `PlaybackEffect (${effectId}): Play command aborted (e.g., by a subsequent pause).`
                );
              }
            });
        }
      } else {
        // console.log(`PlaybackEffect (${effectId}): Server state is PLAYING, video is already playing or attempting to.`);
      }
    }
    // No explicit 'else' for serverWantsToPause here, as it's handled at the top.
  }, [
    streamState?.playbackState,
    streamState?.manifestUrl,
    isPlayerReady,
    videoElement,
    isMutedForAutoplay,
    hasInitialSeekCompleted,
    lastUserAction,
  ]);

  // Handle seeking
  useEffect(() => {
    console.log(
      'SeekEffect: Fired. manifestUrl:',
      streamState?.manifestUrl,
      'PlaybackState:',
      streamState?.playbackState,
      'TimeMs:',
      streamState?.videoPlaybackTimeMs,
      'ServerTime:',
      streamState?.stateUpdateServerTime,
      'IsPlayerReady:',
      isPlayerReady,
      'HasInitialSeekCompleted:',
      hasInitialSeekCompleted
    );
    if (
      !videoElement ||
      !streamState?.manifestUrl ||
      typeof streamState.videoPlaybackTimeMs !== 'number' ||
      streamState.videoPlaybackTimeMs < 0 ||
      !isPlayerReady
    ) {
      console.log(
        'SeekEffect: Skipping - conditions not met (videoElement, manifest, time, or player not ready).'
      );
      return;
    }

    let targetTimeSeconds: number;
    const FORWARD_BUFFER_MS = 1000; // Try to buffer 1 second ahead when playing

    if (streamState.playbackState === 'playing') {
      if (
        typeof streamState.stateUpdateServerTime === 'number' &&
        streamState.stateUpdateServerTime > 0
      ) {
        const serverTimeAtLastUpdateMs = streamState.stateUpdateServerTime;
        const videoTimeAtLastUpdateMs = streamState.videoPlaybackTimeMs;
        const currentTimeMs = Date.now();
        const elapsedTimeSinceLastUpdateMs =
          currentTimeMs - serverTimeAtLastUpdateMs;

        if (elapsedTimeSinceLastUpdateMs < 0) {
          console.warn(
            `SeekEffect (Playing): Clock skew detected or future server time? Elapsed: ${elapsedTimeSinceLastUpdateMs}ms. Using raw videoPlaybackTimeMs + forward buffer.`
          );
          targetTimeSeconds =
            (videoTimeAtLastUpdateMs + FORWARD_BUFFER_MS) / 1000;
        } else {
          const estimatedCurrentVideoTimeMs =
            videoTimeAtLastUpdateMs + elapsedTimeSinceLastUpdateMs;
          targetTimeSeconds =
            (estimatedCurrentVideoTimeMs + FORWARD_BUFFER_MS) / 1000;
          console.log(
            `SeekEffect (Playing): Calculated target video time (with forward buffer): ${targetTimeSeconds.toFixed(
              3
            )}s (Base: ${videoTimeAtLastUpdateMs / 1000}s, Elapsed: ${
              elapsedTimeSinceLastUpdateMs / 1000
            }s, Buffer: ${FORWARD_BUFFER_MS / 1000}s)`
          );
        }
      } else {
        // Fallback if server time is not available while playing
        targetTimeSeconds =
          (streamState.videoPlaybackTimeMs + FORWARD_BUFFER_MS) / 1000;
        console.log(
          `SeekEffect (Playing): Using raw videoPlaybackTimeMs + forward buffer: ${targetTimeSeconds.toFixed(
            3
          )}s (stateUpdateServerTime not available).`
        );
      }
    } else {
      // Includes 'paused' or 'stopped'
      // If paused or stopped, use the videoPlaybackTimeMs directly from the state update (no forward buffer)
      targetTimeSeconds = streamState.videoPlaybackTimeMs / 1000;
      console.log(
        `SeekEffect (${
          streamState.playbackState
        }): Using direct videoPlaybackTimeMs: ${targetTimeSeconds.toFixed(3)}s.`
      );
    }

    let canSeek = false;
    let currentSeekableString = 'not available';
    const videoDuration = videoElement.duration;

    if (targetTimeSeconds < 0) targetTimeSeconds = 0;
    if (videoDuration && targetTimeSeconds > videoDuration) {
      console.log(
        `SeekEffect: Target time ${targetTimeSeconds.toFixed(
          3
        )}s exceeds duration ${videoDuration.toFixed(
          3
        )}s. Clamping to duration.`
      );
      targetTimeSeconds = videoDuration;
    }

    if (shakaPlayerInstance) {
      const seekRange = shakaPlayerInstance.seekRange();
      currentSeekableString = `Shaka Range: [${seekRange.start?.toFixed(
        3
      )}, ${seekRange.end?.toFixed(3)}]`;
      if (
        targetTimeSeconds >= seekRange.start &&
        targetTimeSeconds <= seekRange.end
      ) {
        canSeek = true;
      }
    } else if (videoElement.seekable && videoElement.seekable.length > 0) {
      currentSeekableString = `Native Ranges: `;
      for (let i = 0; i < videoElement.seekable.length; i++) {
        currentSeekableString += `[${videoElement.seekable
          .start(i)
          .toFixed(3)}, ${videoElement.seekable.end(i).toFixed(3)}] `;
        if (
          targetTimeSeconds >= videoElement.seekable.start(i) &&
          targetTimeSeconds <= videoElement.seekable.end(i)
        ) {
          canSeek = true;
        }
      }
    }

    console.log(
      `SeekEffect: Target time: ${targetTimeSeconds.toFixed(
        3
      )}s. Current video time: ${videoElement.currentTime.toFixed(
        3
      )}s. Seekable: ${currentSeekableString}`
    );

    // Adjust threshold for seeking based on how fresh the sync data is.
    // If stateUpdateServerTime is very recent, we can be more aggressive.
    // If it's old, a larger difference might be acceptable to avoid jumpiness.
    const seekThreshold = streamState.playbackState === 'playing' ? 1.5 : 0.5; // Smaller threshold for paused state to be more precise

    if (
      canSeek &&
      Math.abs(videoElement.currentTime - targetTimeSeconds) > seekThreshold
    ) {
      console.log(`SeekEffect: Seeking to ${targetTimeSeconds.toFixed(3)}.`);
      videoElement.currentTime = targetTimeSeconds;
      if (!hasInitialSeekCompleted) {
        setHasInitialSeekCompleted(true);
      }
    } else if (canSeek && !hasInitialSeekCompleted) {
      // If already close enough to target on the first check after manifest load,
      // and initial seek hasn't been flagged, flag it now so playback can start.
      console.log(
        `SeekEffect: Close enough on initial check (${Math.abs(
          videoElement.currentTime - targetTimeSeconds
        ).toFixed(3)}s diff), marking initial seek complete.`
      );
      setHasInitialSeekCompleted(true);
    } else if (canSeek) {
      console.log(
        `SeekEffect: Target time ${targetTimeSeconds.toFixed(
          3
        )}s is close enough or already there. No seek needed.`
      );
    } else {
      console.log(
        `SeekEffect: Cannot seek to ${targetTimeSeconds.toFixed(
          3
        )}s (outside seekable range or range not available).`
      );
      // If we can't seek but an initial seek is pending, we might get stuck.
      // However, Shaka should eventually make the range seekable once enough data is buffered.
      // If it's truly unseekable (e.g. live stream not started yet at that point),
      // setting hasInitialSeekCompleted might be needed to unblock, but this is complex.
      // For VOD, this should resolve as data buffers.
    }
  }, [
    streamState?.videoPlaybackTimeMs,
    streamState?.stateUpdateServerTime,
    streamState?.manifestUrl,
    streamState?.playbackState,
    isPlayerReady,
    shakaPlayerInstance,
    videoElement,
    hasInitialSeekCompleted,
  ]);

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
    if (videoElement) {
      // Use videoElement
      console.log(
        'Video metadata loaded: Width=',
        videoElement.videoWidth,
        'Height=',
        videoElement.videoHeight,
        'Duration=',
        videoElement.duration
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
      if (currentlyFullScreen && videoElement && videoElement.videoWidth > 0) {
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

  const handleUnmuteInteraction = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      event.stopPropagation(); // Prevent this event from bubbling up to container tap handlers
      if (videoElement && isMutedForAutoplay) {
        console.log(
          'VideoPlayer: handleUnmuteInteraction: Unmuting and attempting play.'
        );
        videoElement.muted = false;
        setIsMutedForAutoplay(false);
        setLastUserAction({ type: 'play', time: Date.now() });
        if (streamState?.playbackState === 'playing') {
          setHasInitialSeekCompleted(false); // Trigger resync
        }
        // Attempt to play directly after unmuting
        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn(
              'Play from unmute interaction failed. PlaybackEffect will try.',
              err
            );
            // If play fails (e.g. NotAllowedError), and it was an unmuted attempt,
            // we might need to set isMutedForAutoplay back to true to show the unmute prompt again.
            if (err.name === 'NotAllowedError' && !videoElement.muted) {
              // Revert if unmuted play was disallowed
              // setIsMutedForAutoplay(true); // Consider this if issues persist
            }
          });
        }
      }
    },
    [
      videoElement,
      isMutedForAutoplay,
      streamState?.playbackState,
      setIsMutedForAutoplay,
      setLastUserAction,
      setHasInitialSeekCompleted,
    ]
  );

  const handleContainerTap = (
    event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    // This handler is for the main video container background.
    // It should not fire if a more specific control (like a button or the unmute message) was the target.
    // The stopPropagation in other handlers should prevent this.

    if (videoElement && isMutedForAutoplay) {
      // If still muted for autoplay, a tap on the container background should also unmute.
      console.log(
        'VideoPlayer: handleContainerTap: Initial unmute by container tap.'
      );
      handleUnmuteInteraction(event); // Use the centralized unmute logic
    } else {
      // If already unmuted, taps on the container toggle general controls visibility.
      console.log(
        'VideoPlayer: handleContainerTap: Toggling controls visibility.'
      );
      setIsControlsVisible((prev) => !prev);
    }
  };

  
  const handleTogglePlayPauseClick = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();

    if (!videoElement) return;
    setIsControlsVisible(true);

    if (videoElement.paused) {
      console.log(
        'VideoPlayer: handleTogglePlayPauseClick: User wants to PLAY. Triggering resync.'
      );
      setLastUserAction({ type: 'play', time: Date.now() });
      setHasInitialSeekCompleted(false);
      // We can also try a direct play here, followed by PlaybackEffect's reconciliation
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) =>
          console.warn(
            'Play from toggle button failed, PlaybackEffect will retry',
            err
          )
        );
      }
    } else {
      console.log(
        'VideoPlayer: handleTogglePlayPauseClick: User wants to PAUSE.'
      );
      setLastUserAction({ type: 'pause', time: Date.now() });
      videoElement.pause();
    }
  };

  if (!shakaScriptLoaded && !window.shaka) { // Check window.shaka as well in case it was loaded by another instance
    return (
      <div className="w-full h-screen flex justify-center items-center bg-black text-white">
        <div className="text-2xl p-5 text-center">Loading video player library...</div>
      </div>
    );
  }

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
      onClick={handleContainerTap} // Directly call handleContainerTap
      onTouchEndCapture={handleContainerTap} // Directly call handleContainerTap
    >
      <video
        ref={videoRef}
        className={videoElementClasses}
        onLoadedMetadata={handleMetadataLoaded}
        playsInline
        autoPlay={false} // Autoplay is handled by PlaybackEffect after conditions met
        muted // Start muted, user interaction will unmute
        onPlay={() => {
          console.log('VideoPlayer: Native video event: play');
          setIsPlayingVisual(true);
        }}
        onPause={() => {
          console.log('VideoPlayer: Native video event: pause');
          setIsPlayingVisual(false);
        }}
        onPlaying={() => {
          console.log('VideoPlayer: Native video event: playing');
          setIsPlayingVisual(true);
        }}
        onWaiting={() =>
          console.log('VideoPlayer: Native video event: waiting (buffering)')
        }
        onStalled={() =>
          console.log('VideoPlayer: Native video event: stalled')
        }
        onError={(e: React.SyntheticEvent<HTMLVideoElement, Event>) => // Type the event
          console.error(
            'VideoPlayer: Native video event: error',
            e.currentTarget.error // Use currentTarget
          )
        }
      />

      {/* Tap to Unmute Overlay - Separate from main controls for independent interactivity */}
      {isMutedForAutoplay && streamState?.playbackState === 'playing' && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20" // Ensure high z-index
          onClick={handleUnmuteInteraction}
          onTouchEndCapture={handleUnmuteInteraction}
          style={{ cursor: 'pointer' }} // Indicate the whole area is clickable for unmuting
        >
        </div>
      )}

      {/* Main Controls Overlay */}
      {/* This overlay's visibility is controlled by isControlsVisible */}
      <div className={controlsClasses}>
        {/* Top Bar (Hamburger, Title, Fullscreen) */}
        <div className="flex justify-between items-center w-full">
          <HamburgerIcon
            onClick={(e: React.MouseEvent) => { // Explicitly type 'e'
              e.stopPropagation(); // Prevent event from bubbling to container
              toggleDrawer();
            }}
            className="text-white" // Add text-white for visibility
          />
          {/* <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg> */}

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
            onClick={(e) => {
              e.stopPropagation(); // Prevent parent div's onClick
              toggleFullScreen();
            }}
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

        {/* Central Controls Area - MODIFIED */}
        <div className="flex-grow flex items-center justify-center pointer-events-none"> {/* Use flex-grow, remove absolute inset-0 */}
          {isMutedForAutoplay && streamState?.playbackState === 'playing' && (
            <div
              className="p-4 bg-black/70 rounded-lg text-white text-center pointer-events-auto" // Ensure this has pointer-events-auto
              // onClick and onTouchEndCapture are on the parent Tap to Unmute Overlay,
              // but if this specific div is meant to be an alternative click target for unmute:
              // onClick={handleUnmuteInteraction}
              // onTouchEndCapture={handleUnmuteInteraction}
            >
              <p>Tap to unmute</p>
            </div>
          )}
          {!isMutedForAutoplay && videoElement && (
            <button
              className={`${buttonClasses} w-16 h-16 pointer-events-auto`} // This already has pointer-events-auto
              onClick={handleTogglePlayPauseClick}
              aria-label={isPlayingVisual ? 'Pause' : 'Play'}
            >
              {isPlayingVisual ? (
                <svg
                  viewBox="0 0 24 24"
                  width="36"
                  height="36"
                  fill="currentColor"
                >
                  {' '}
                  {/* Larger icon */}
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="36"
                  height="36"
                  fill="currentColor"
                >
                  {' '}
                  {/* Larger icon */}
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Bottom Controls Area (e.g., timeline placeholder) */}
        <div></div> {/* Placeholder for bottom controls (e.g., timeline) */}
      </div>
    </div>
  );
};

export default VideoPlayer;
