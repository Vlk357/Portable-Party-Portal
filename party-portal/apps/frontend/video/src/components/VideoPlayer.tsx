import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Assuming shaka types are globally available via your types/index.ts setup

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number; // Unix timestamp in milliseconds
}

const VideoPlayer: React.FC = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
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
  const navigate = useNavigate();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [shakaPlayerInstance, setShakaPlayerInstance] = useState<shaka.Player | null>(null);
  const [isMutedForAutoplay, setIsMutedForAutoplay] = useState(true); // New state for muted autoplay
  const [hasInitialSeekCompleted, setHasInitialSeekCompleted] = useState(false); // New state

  // Control visibility timer
  useEffect(() => {
    let hideTimeout: number;
    if (isControlsVisible && streamState?.playbackState === 'playing' && !isMutedForAutoplay) { // Only hide if playing and unmuted
      hideTimeout = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, 3000);
    }
    return () => {
      clearTimeout(hideTimeout);
    };
  }, [isControlsVisible, streamState?.playbackState, isMutedForAutoplay]);

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
          const updateFromServer = JSON.parse(event.data) as Partial<StreamState>;
          // Backend now sends stateUpdateServerTime in milliseconds.
          // The previous heuristic conversion is no longer needed here.
          const processedUpdate = { ...updateFromServer }; 

          // Optional: Log to verify the format of received stateUpdateServerTime
          if (typeof processedUpdate.stateUpdateServerTime === 'number') {
            console.log('Mercure: Received stateUpdateServerTime (should be ms):', processedUpdate.stateUpdateServerTime);
          }

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
            console.log('Mercure: Applying processed state update:', processedUpdate);
            const newState = { ...prevState };
            if (processedUpdate.playbackState) {
              newState.playbackState = processedUpdate.playbackState;
            }
            if (typeof processedUpdate.videoPlaybackTimeMs === 'number') {
              newState.videoPlaybackTimeMs = processedUpdate.videoPlaybackTimeMs;
            }
            if (typeof processedUpdate.stateUpdateServerTime === 'number') {
              newState.stateUpdateServerTime = processedUpdate.stateUpdateServerTime;
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
      console.log('FetchStreamInfo: Attempting to fetch /cinema/api/stream/info');
      try {
        const response = await fetch('/cinema/api/stream/info');
        console.log('FetchStreamInfo: Response status:', response.status);
        if (response.ok) {
          const data: StreamState = await response.json();
          console.log('FetchStreamInfo: Data received (raw):', JSON.parse(JSON.stringify(data))); 
          
          // Backend now sends stateUpdateServerTime in milliseconds.
          // The previous heuristic conversion is no longer needed here.
          const processedData = { ...data };

          // Optional: Log to verify the format of received stateUpdateServerTime
          if (typeof processedData.stateUpdateServerTime === 'number') {
            console.log('FetchStreamInfo: Received stateUpdateServerTime (should be ms):', processedData.stateUpdateServerTime);
          }
          console.log('FetchStreamInfo: Data after ensuring correct time format (no client-side conversion needed for server time):', processedData);
          
          setStreamState(prevStreamState => {
            if (processedData.manifestUrl && processedData.manifestUrl !== prevStreamState?.manifestUrl) {
                 console.log('FetchStreamInfo: New or changed manifest, setting up Mercure for:', processedData.manifestUrl);
                 setupMercureListener(processedData.manifestUrl);
            } else if (!processedData.manifestUrl && prevStreamState?.manifestUrl) {
                 console.log('FetchStreamInfo: Manifest removed, closing Mercure.');
                 eventSource?.close();
            }
            // Always update to the latest data from fetch, including server time
            return processedData; 
          });

          if (processedData.manifestUrl) {
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

  // Initialize Shaka Player
  useEffect(() => {
    console.log('ShakaInit Effect: Fired. videoElement (state):', videoElement, 'shakaPlayerInstance (state):', shakaPlayerInstance);

    if (videoElement && !shakaPlayerInstance) {
      console.log('ShakaInit: videoElement available and NO shakaPlayerInstance (state). Initializing...');
      if (window.shaka && window.shaka.Player.isBrowserSupported()) {
        console.log('ShakaInit: Browser supports Shaka Player. Creating new instance...');
        // const player = new window.shaka.Player(videoElement); // Old way
        const player = new window.shaka.Player(); // New way (Shaka v3.1+)
        
        player.addEventListener('error', (event: shaka.extern.ErrorEvent) => {
          console.error('Shaka Player Error Event:', event.detail);
          setIsPlayerReady(false);
        });

        // Attach player to video element (New way)
        player.attach(videoElement).then(() => {
            console.log('ShakaInit: Player ATTACHED to videoElement.');
            playerRef.current = player;
            setShakaPlayerInstance(player);
            console.log('ShakaInit: Player instance CREATED and SET to state. playerRef.current:', playerRef.current);
        }).catch((error: shaka.extern.Error) => {
            console.error('ShakaInit: Error attaching player to videoElement:', error);
        });
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
      setShakaPlayerInstance(null);
      setIsPlayerReady(false);
      setHasInitialSeekCompleted(false); // Reset on cleanup
      console.log('ShakaInit Effect: Cleanup finished. shakaPlayerInstance (state) set to null.');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoElement]);

  // Load manifest
  useEffect(() => {
    console.log('LoadManifest Effect: Fired. manifestUrl:', streamState?.manifestUrl, 'shakaPlayerInstance:', shakaPlayerInstance, 'videoElement (state):', videoElement);

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
        console.log('LoadManifest: Unloading current Shaka content due to no manifestUrl.');
        shakaPlayerInstance.unload().catch((e: shaka.extern.Error | Error) => console.error("Error unloading shaka player", e));
      }
      return;
    }

    if (!videoElement) {
      console.log('LoadManifest: Skipping - no videoElement (from state).');
      return;
    }
    if (!shakaPlayerInstance) {
      console.log('LoadManifest: Skipping - no shakaPlayerInstance (from state).');
      return;
    }
    
    // The 'muted' prop on <video> and PlaybackEffect handle muting for autoplay.
    // No need to set videoElement.muted here based on isMutedForAutoplay.

    console.log('LoadManifest: Using Shaka Player to load manifest:', streamState.manifestUrl);
    const manifestToLoad = `/movies/${streamState.manifestUrl}`;
    shakaPlayerInstance.load(manifestToLoad)
      .then(() => {
        console.log('LoadManifest: Shaka Player loaded manifest successfully:', manifestToLoad);
        setIsPlayerReady(true); // Player is ready after manifest loads
        // Note: setHasInitialSeekCompleted is NOT set here. SeekEffect will handle it.
      })
      .catch((error: shaka.extern.Error) => {
        console.error('LoadManifest: Shaka Player error loading manifest. Error Code:', error.code, 'Details:', error.detail || error);
        setIsPlayerReady(false);
        setHasInitialSeekCompleted(false); // If load fails, ensure it's reset
      });
  }, [streamState?.manifestUrl, shakaPlayerInstance, videoElement]);


  // Handle playback state (play/pause)
  useEffect(() => {
    console.log('PlaybackEffect: Fired. manifestUrl:', streamState?.manifestUrl, 'PlaybackState:', streamState?.playbackState, 'IsPlayerReady:', isPlayerReady, 'isMutedForAutoplay:', isMutedForAutoplay, 'HasInitialSeekCompleted:', hasInitialSeekCompleted);
    if (!videoElement || !streamState?.manifestUrl || !isPlayerReady || !hasInitialSeekCompleted) {
      console.log('PlaybackEffect: Skipping - conditions not met (videoElement, manifestUrl, isPlayerReady, or initial seek not done).');
      return;
    }

    if (streamState.playbackState === 'playing') {
      console.log('PlaybackEffect: Attempting to play...');
      if (isMutedForAutoplay) { // Ensure video is muted before attempting to play if muted autoplay is intended
          videoElement.muted = true;
          console.log('PlaybackEffect: Ensured video is muted for autoplay attempt.');
      }
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('PlaybackEffect: Play command successful.');
          // If play succeeded and was muted for autoplay, it remains muted until user interaction.
        }).catch(error => {
          if (error.name === 'NotAllowedError') {
            console.warn('PlaybackEffect: Play was prevented by browser autoplay policy. Video remains muted. User interaction needed to unmute and play.');
            // isMutedForAutoplay remains true. User interaction will handle unmuting.
            // Optionally, show a "Tap to unmute/play" UI element here.
          } else if (error.name !== 'AbortError') {
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
  }, [streamState?.playbackState, streamState?.manifestUrl, isPlayerReady, videoElement, isMutedForAutoplay, hasInitialSeekCompleted]);

  // Handle seeking
  useEffect(() => {
    console.log('SeekEffect: Fired. manifestUrl:', streamState?.manifestUrl, 'PlaybackState:', streamState?.playbackState, 'TimeMs:', streamState?.videoPlaybackTimeMs, 'ServerTime:', streamState?.stateUpdateServerTime, 'IsPlayerReady:', isPlayerReady, 'HasInitialSeekCompleted:', hasInitialSeekCompleted);
    if (!videoElement || !streamState?.manifestUrl || typeof streamState.videoPlaybackTimeMs !== 'number' || streamState.videoPlaybackTimeMs < 0 || !isPlayerReady) {
      console.log('SeekEffect: Skipping - conditions not met (videoElement, manifest, time, or player not ready).');
      return;
    }

    let targetTimeSeconds: number;
    const SYNC_OFFSET_MS = 200; // User requested 200ms offset

    if (streamState.playbackState === 'playing') {
      if (typeof streamState.stateUpdateServerTime === 'number' && streamState.stateUpdateServerTime > 0) {
        const serverTimeAtLastUpdateMs = streamState.stateUpdateServerTime;
        const videoTimeAtLastUpdateMs = streamState.videoPlaybackTimeMs;
        const currentTimeMs = Date.now();
        const elapsedTimeSinceLastUpdateMs = currentTimeMs - serverTimeAtLastUpdateMs;
        
        if (elapsedTimeSinceLastUpdateMs < 0) {
          console.warn(`SeekEffect (Playing): Clock skew detected or future server time? Elapsed: ${elapsedTimeSinceLastUpdateMs}ms. Using raw videoPlaybackTimeMs + offset.`);
          targetTimeSeconds = (videoTimeAtLastUpdateMs + SYNC_OFFSET_MS) / 1000;
        } else {
          const calculatedTargetTimeMs = videoTimeAtLastUpdateMs + elapsedTimeSinceLastUpdateMs + SYNC_OFFSET_MS;
          targetTimeSeconds = calculatedTargetTimeMs / 1000;
          console.log(`SeekEffect (Playing): Calculated current video time: ${targetTimeSeconds.toFixed(3)}s (Base: ${videoTimeAtLastUpdateMs/1000}s, Elapsed: ${elapsedTimeSinceLastUpdateMs/1000}s, Offset: ${SYNC_OFFSET_MS/1000}s)`);
        }
      } else {
        // Fallback if server time is not available while playing
        targetTimeSeconds = (streamState.videoPlaybackTimeMs + SYNC_OFFSET_MS) / 1000;
        console.log(`SeekEffect (Playing): Using raw videoPlaybackTimeMs + offset: ${targetTimeSeconds.toFixed(3)}s (stateUpdateServerTime not available).`);
      }
    } else { // Includes 'paused' or 'stopped'
      // If paused or stopped, use the videoPlaybackTimeMs directly from the state update (plus offset)
      targetTimeSeconds = (streamState.videoPlaybackTimeMs + SYNC_OFFSET_MS) / 1000;
      console.log(`SeekEffect (${streamState.playbackState}): Using direct videoPlaybackTimeMs + offset: ${targetTimeSeconds.toFixed(3)}s.`);
    }
    
    let canSeek = false;
    let currentSeekableString = "not available";
    const videoDuration = videoElement.duration;

    if (targetTimeSeconds < 0) targetTimeSeconds = 0;
    if (videoDuration && targetTimeSeconds > videoDuration) {
        console.log(`SeekEffect: Target time ${targetTimeSeconds.toFixed(3)}s exceeds duration ${videoDuration.toFixed(3)}s. Clamping to duration.`);
        targetTimeSeconds = videoDuration;
    }


    if (shakaPlayerInstance) {
        const seekRange = shakaPlayerInstance.seekRange();
        currentSeekableString = `Shaka Range: [${seekRange.start?.toFixed(3)}, ${seekRange.end?.toFixed(3)}]`;
        if (targetTimeSeconds >= seekRange.start && targetTimeSeconds <= seekRange.end) {
            canSeek = true;
        }
    } else if (videoElement.seekable && videoElement.seekable.length > 0) {
        currentSeekableString = `Native Ranges: `;
        for (let i = 0; i < videoElement.seekable.length; i++) {
            currentSeekableString += `[${videoElement.seekable.start(i).toFixed(3)}, ${videoElement.seekable.end(i).toFixed(3)}] `;
            if (targetTimeSeconds >= videoElement.seekable.start(i) && targetTimeSeconds <= videoElement.seekable.end(i)) {
                canSeek = true;
            }
        }
    }
    
    console.log(`SeekEffect: Target time: ${targetTimeSeconds.toFixed(3)}s. Current video time: ${videoElement.currentTime.toFixed(3)}s. Seekable: ${currentSeekableString}`);

    // Adjust threshold for seeking based on how fresh the sync data is.
    // If stateUpdateServerTime is very recent, we can be more aggressive.
    // If it's old, a larger difference might be acceptable to avoid jumpiness.
    const seekThreshold = streamState.playbackState === 'playing' ? 1.5 : 0.5; // Smaller threshold for paused state to be more precise

    if (canSeek && Math.abs(videoElement.currentTime - targetTimeSeconds) > seekThreshold) {
      console.log(`SeekEffect: Seeking to ${targetTimeSeconds.toFixed(3)}.`);
      videoElement.currentTime = targetTimeSeconds;
      if (!hasInitialSeekCompleted) {
        setHasInitialSeekCompleted(true);
      }
    } else if (canSeek && !hasInitialSeekCompleted) {
      // If already close enough to target on the first check after manifest load,
      // and initial seek hasn't been flagged, flag it now so playback can start.
      console.log(`SeekEffect: Close enough on initial check (${Math.abs(videoElement.currentTime - targetTimeSeconds).toFixed(3)}s diff), marking initial seek complete.`);
      setHasInitialSeekCompleted(true);
    } else if (canSeek) {
      console.log(`SeekEffect: Target time ${targetTimeSeconds.toFixed(3)}s is close enough or already there. No seek needed.`);
    } else {
      console.log(`SeekEffect: Cannot seek to ${targetTimeSeconds.toFixed(3)}s (outside seekable range or range not available).`);
      // If we can't seek but an initial seek is pending, we might get stuck.
      // However, Shaka should eventually make the range seekable once enough data is buffered.
      // If it's truly unseekable (e.g. live stream not started yet at that point),
      // setting hasInitialSeekCompleted might be needed to unblock, but this is complex.
      // For VOD, this should resolve as data buffers.
    }
  }, [streamState?.videoPlaybackTimeMs, streamState?.stateUpdateServerTime, streamState?.manifestUrl, streamState?.playbackState, isPlayerReady, shakaPlayerInstance, videoElement, hasInitialSeekCompleted]);

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
    console.log('handleUserInteraction: Fired.');
    setIsControlsVisible(true); // Show controls on any interaction

    if (videoElement && isMutedForAutoplay) {
      console.log('handleUserInteraction: Unmuting video.');
      videoElement.muted = false;
      setIsMutedForAutoplay(false);
      // If the desired state is 'playing' and the video was paused (e.g. due to autoplay restrictions initially failing silently or by other means)
      // then attempt to play. If it was already playing (muted), unmuting is enough.
      if (streamState?.playbackState === 'playing' && videoElement.paused) {
        console.log('handleUserInteraction: Video was paused and should be playing, attempting to play after unmute.');
        videoElement.play().then(() => {
          console.log('handleUserInteraction: Play after unmute successful.');
        }).catch(error => {
          // It's possible the play() here is interrupted if a seek happens immediately after due to state updates.
          // This is usually fine as the SeekEffect and PlaybackEffect will take over.
          if (error.name !== 'AbortError') {
            console.error('handleUserInteraction: Error playing after unmute:', error);
          } else {
            console.warn('handleUserInteraction: Play after unmute aborted, likely by other player actions (e.g., seek).');
          }
        });
      } else if (streamState?.playbackState === 'playing' && !videoElement.paused) {
        console.log('handleUserInteraction: Video was already playing (muted), now unmuted.');
      }
    }
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
      onClick={handleUserInteraction} // This will now also handle unmuting
      onTouchStart={handleUserInteraction} // For touch devices
    >
      <video
        ref={videoRef}
        className={videoElementClasses}
        onLoadedMetadata={handleMetadataLoaded}
        playsInline
        autoPlay={false} // Explicitly false, we control play via effect
        muted // Start muted - this attribute is key for attempting autoplay
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

          {isMutedForAutoplay && streamState?.playbackState === 'playing' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 bg-black/70 rounded-lg text-white text-center">
              <p>Tap to unmute</p>
            </div>
          )}

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
