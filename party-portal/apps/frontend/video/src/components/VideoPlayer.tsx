import React, { useEffect, useRef, useState, useCallback } from 'react';

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped'; // 'stopped' can be treated like 'paused' for client logic
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number; // Unix timestamp in milliseconds
}

const loadScript = (src: string, id: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      if (window.shaka?.ui) {
        resolve(); return;
      }
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.shaka?.ui) {
          clearInterval(interval); resolve();
        } else if (attempts > 50) {
          clearInterval(interval); reject(new Error(`Shaka Player UI not available after script ${id} was found and polling.`));
        }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = src; script.id = id; script.async = true;
    script.onload = () => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.shaka?.ui) {
          clearInterval(interval); resolve();
        } else if (attempts > 50) {
          clearInterval(interval); reject(new Error('Shaka Player UI not available after script load and polling.'));
        }
      }, 100);
    };
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });
};

const PERFECT_SYNC_TOLERANCE_MS = 100;

const VideoPlayer: React.FC = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    setVideoElement(node);
  }, []);

  const playerRef = useRef<shaka.Player | null>(null);
  const uiRef = useRef<shaka.ui.Overlay | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [shakaPlayerInstance, setShakaPlayerInstance] = useState<shaka.Player | null>(null);
  const [hasInitialServerSeekCompleted, setHasInitialServerSeekCompleted] = useState(false);
  const [userWantsToPlay, setUserWantsToPlay] = useState(false); // User's direct intent
  const userHadPlayIntentBeforeServerPauseRef = useRef(false); // Tracks user intent if server overrode
  const [isFullScreen, setIsFullScreen] = useState(false); // Declare isFullScreen state

  // Using a state for isVideoActuallyPlaying to make it a clearer dependency for Seek & Sync
  const [isVideoActuallyPlaying, setIsVideoActuallyPlaying] = useState(false);

  const [shakaScriptLoaded, setShakaScriptLoaded] = useState(!!(window.shaka && window.shaka.ui));

  const isCatchingUpRate = useRef(false);
  const lastUserInteractionTime = useRef(0); // To manage grace period for server overriding user *seek*
  const lastUserSeekTime = useRef(0); // For reactive seek correction
  const pollingIntervalRef = useRef<number | null>(null);
  const lastKnownServerStateTimeMs = useRef(0); // Keep track of this for rate reset

  // --- Data Fetching (Polling) ---
  useEffect(() => {
    console.log('VideoPlayer: Main data fetching useEffect runs');

    const fetchStreamInfo = async (isInitialFetch = false) => {
      console.log(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Attempting to fetch /cinema/api/stream/info`);
      try {
        const response = await fetch('/cinema/api/stream/info');
        console.log(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Response status:`, response.status);
        if (response.ok) {
          const newData: StreamState = await response.json();
          // Log the raw data immediately after parsing JSON
          console.log(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Raw data received:`, JSON.stringify(newData));

          // CRITICAL CHECK: Ensure essential data is present before attempting to update state
          if (!newData.manifestUrl || typeof newData.videoPlaybackTimeMs !== 'number' || !newData.stateUpdateServerTime || typeof newData.stateUpdateServerTime !== 'number') {
            console.error(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): CRITICAL DATA MISSING or invalid in response. Manifest: ${newData.manifestUrl}, Time: ${newData.videoPlaybackTimeMs}, ServerTime: ${newData.stateUpdateServerTime}. Aborting state update for this fetch.`);
            return; // Do not proceed to setStreamState if critical data is missing
          }

          setStreamState(prevStreamState => {
            // Now we are sure newData has stateUpdateServerTime
            if (isInitialFetch || JSON.stringify(prevStreamState) !== JSON.stringify(newData)) {
              console.log(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): New or changed data, updating state.`);
              lastKnownServerStateTimeMs.current = newData.videoPlaybackTimeMs;
              if (prevStreamState?.manifestUrl !== newData.manifestUrl || isInitialFetch) {
                console.log(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Manifest changed or initial fetch. Resetting hasInitialServerSeekCompleted.`);
                setHasInitialServerSeekCompleted(false);
              }
              return newData;
            }
            console.log(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Data unchanged, not updating state.`);
            return prevStreamState;
          });
        } else {
          console.error(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Error fetching stream state: Response not OK`, response.status);
        }
      } catch (error) {
        console.error(`FetchStreamInfo (${isInitialFetch ? 'initial' : 'polling'}): Error fetching stream state:`, error);
      }
    };

    fetchStreamInfo(true); // Initial fetch

    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = window.setInterval(() => fetchStreamInfo(false), 5000);
    console.log('VideoPlayer: Polling started.');

    return () => {
      console.log('VideoPlayer: Cleaning up main data fetching useEffect (polling).');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        console.log('VideoPlayer: Polling stopped.');
      }
    };
  }, []);

  // --- Shaka Script Loading ---
  useEffect(() => {
    if (!shakaScriptLoaded) {
      console.log('Attempting to load Shaka Player UI script...');
      loadScript('/libs/shaka-player.ui.min.js', 'shaka-player-ui-script')
        .then(() => {
          console.log('Shaka Player UI script dynamically loaded.');
          setShakaScriptLoaded(true);
        })
        .catch(error => console.error('Failed to load Shaka Player UI script:', error));
    }
  }, [shakaScriptLoaded]);

  // --- Shaka Player & UI Initialization ---
  useEffect(() => {
    let uiInstance: shaka.ui.Overlay | null = null;
    const currentContainerRef = playerContainerRef.current;
    const currentVideoElement = videoElement;

    const preventDoubleClick = (event: MouseEvent) => {
      event.preventDefault(); event.stopPropagation(); console.log('Double-click prevented.');
    };

    if (currentVideoElement && shakaScriptLoaded && !playerRef.current && currentContainerRef && window.shaka?.ui) {
      currentContainerRef.addEventListener('dblclick', preventDoubleClick);
      currentVideoElement.addEventListener('dblclick', preventDoubleClick);

      if (window.shaka.Player.isBrowserSupported()) {
        const player = new window.shaka.Player();
        player.addEventListener('error', (event: any) => {
          console.error('[VideoPlayer] Shaka Player Error Event:', event.detail);
          setIsPlayerReady(false);
        });
        player.attach(currentVideoElement)
          .then(() => {
            playerRef.current = player;
            setShakaPlayerInstance(player);
            const ui = new window.shaka.ui.Overlay(player, currentContainerRef!, currentVideoElement!);
            uiInstance = ui;
            uiRef.current = ui;
            ui.configure({
              'controlPanelElements': ['play_pause', 'time_and_duration', 'spacer', 'volume', 'fullscreen'],
              'addBigPlayButton': true,
              'enableKeyboardPlaybackControls': false,
            });
            console.log('[VideoPlayer] Shaka Player and UI initialized.');
          })
          .catch((error: any) => console.error('[VideoPlayer] Error attaching player to videoElement:', error));
      } else {
        console.warn('[VideoPlayer] Shaka Player or UI not available or browser not supported.');
      }
    }
    return () => {
      uiInstance?.destroy().catch(e => console.error("[VideoPlayer] Error destroying Shaka UI", e));
      playerRef.current?.destroy().catch(e => console.error("[VideoPlayer] Error destroying Shaka Player", e));
      if (currentContainerRef) currentContainerRef.removeEventListener('dblclick', preventDoubleClick);
      if (currentVideoElement) currentVideoElement.removeEventListener('dblclick', preventDoubleClick);
      uiRef.current = null; playerRef.current = null; setShakaPlayerInstance(null);
      setIsPlayerReady(false); setHasInitialServerSeekCompleted(false);
    };
  }, [videoElement, shakaScriptLoaded]);

  // --- Load Manifest ---
  useEffect(() => {
    setIsPlayerReady(false);
    if (!streamState?.manifestUrl || !shakaPlayerInstance) {
      if (shakaPlayerInstance && shakaPlayerInstance.getAssetUri()) { // Corrected: Use getAssetUri()
        shakaPlayerInstance.unload().catch(e => console.error('Error unloading Shaka content', e));
      }
      return;
    }
    const manifestToLoad = `/movies/${streamState.manifestUrl}`;
    console.log('LoadManifest: Loading:', manifestToLoad);
    shakaPlayerInstance.load(manifestToLoad)
      .then(() => {
        console.log('LoadManifest: Success:', manifestToLoad);
        setIsPlayerReady(true);
        // Initial seek will be handled by Seek & Sync Effect
      })
      .catch((error: any) => {
        console.error('LoadManifest: Error loading manifest. Code:', error.code, error);
        setIsPlayerReady(false);
      });
  }, [streamState?.manifestUrl, shakaPlayerInstance]);


  // --- Playback Control Effect (Play/Pause Logic) ---
  useEffect(() => {
    console.log(`PlaybackControl: Effect triggered. userWantsToPlay: ${userWantsToPlay}, userHadPlayIntentBeforeServerPause: ${userHadPlayIntentBeforeServerPauseRef.current}, isPlayerReady: ${isPlayerReady}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}, videoElement: ${!!videoElement}, streamState: ${JSON.stringify(streamState?.playbackState)}, videoActuallyPlaying: ${!videoElement?.paused}`);

    if (!videoElement || !isPlayerReady || !streamState || !hasInitialServerSeekCompleted) {
      console.log(`PlaybackControl: Guards failed. videoElement: ${!!videoElement}, isPlayerReady: ${isPlayerReady}, streamState: ${!!streamState}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}`);
      if (videoElement && videoElement.seeking) console.log("PlaybackControl: Guard failed due to videoElement.seeking");
      return;
    }
    if (videoElement.seeking) {
        console.log("PlaybackControl: Video is seeking, deferring play/pause action.");
        return;
    }

    const serverWantsToPlay = streamState.playbackState === 'playing';
    let effectiveUserWantsToPlay = userWantsToPlay;

    if (serverWantsToPlay && !userWantsToPlay && userHadPlayIntentBeforeServerPauseRef.current) {
        console.log("PlaybackControl: Server resumed play, and user had intent to play before server pause. Restoring user's play intent.");
        effectiveUserWantsToPlay = true;
        setUserWantsToPlay(true); // Update the state to reflect this restoration
        userHadPlayIntentBeforeServerPauseRef.current = false; // Reset the flag
    }


    const videoShouldBePlayingAccordingToIntentAndServer = effectiveUserWantsToPlay && serverWantsToPlay;
    const videoIsActuallyPaused = videoElement.paused;

    console.log(`PlaybackControl: Conditions: serverWantsToPlay: ${serverWantsToPlay}, effectiveUserWantsToPlay: ${effectiveUserWantsToPlay}, videoShouldBePlayingIntent: ${videoShouldBePlayingAccordingToIntentAndServer}, videoIsActuallyPaused: ${videoIsActuallyPaused}`);

    if (videoShouldBePlayingAccordingToIntentAndServer && videoIsActuallyPaused) {
      console.log("PlaybackControl: DECISION: Attempting play.");
      videoElement.play().catch(e => console.warn("PlaybackControl: play() failed.", e.message));
    } else if (!videoShouldBePlayingAccordingToIntentAndServer && !videoIsActuallyPaused) {
      console.log(`PlaybackControl: DECISION: Attempting pause. (Reason: effectiveUserWantsPlay: ${effectiveUserWantsToPlay}, serverWantsPlay: ${serverWantsToPlay})`);
      // If this pause is due to server, and user wanted to play, store that intent.
      if (!serverWantsToPlay && userWantsToPlay) {
        console.log("PlaybackControl: Server is pausing, but user wanted to play. Storing user's play intent.");
        userHadPlayIntentBeforeServerPauseRef.current = true;
      } else {
        // If user initiated pause, or server pause while user also wanted pause, clear the flag.
        userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      videoElement.pause();
    } else {
      // If no action is taken, but the server is playing and the user's intent was restored,
      // ensure the flag is cleared.
      if (serverWantsToPlay && effectiveUserWantsToPlay) {
          userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      console.log("PlaybackControl: DECISION: No action needed.");
    }
  }, [videoElement, isPlayerReady, streamState, userWantsToPlay, hasInitialServerSeekCompleted]);


  // --- Seek & Sync Effect (Time Synchronization & Anti-User-Seek) ---
  useEffect(() => {
    // Guard: Ensure all necessary data and objects are available.
    // Crucially, streamState and streamState.stateUpdateServerTime must be valid.
    // isVideoActuallyPlaying (derived from videoElement.paused) is now a dependency.
    if (!videoElement || !streamState?.manifestUrl || !isPlayerReady || videoElement.seeking || !streamState.stateUpdateServerTime) {
      // ... (existing guard logs) ...
      if (videoElement) console.log(`Seek & Sync: Guarded out. video.paused: ${videoElement.paused}, seeking: ${videoElement.seeking}, isPlayerReady: ${isPlayerReady}, manifest: ${!!streamState?.manifestUrl}, serverTime: ${!!streamState?.stateUpdateServerTime}`);
      return;
    }
    console.log(`Seek & Sync: Running. video.paused: ${videoElement.paused}, streamState.playbackState: ${streamState.playbackState}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}`);


    const USER_SEEK_CORRECTION_GRACE_MS = 300;
    if (Date.now() - lastUserSeekTime.current < USER_SEEK_CORRECTION_GRACE_MS && !hasInitialServerSeekCompleted) {
      console.log("Seek & Sync: Within brief grace period of a recent user seek event (during initial sync phase). Deferring server time sync.");
      return;
    }

    const serverVideoTimeMs = streamState.videoPlaybackTimeMs;
    const serverTimeAtUpdateMs = streamState.stateUpdateServerTime;
    let targetTimeSeconds: number;

    if (streamState.playbackState === 'playing') {
      const elapsedTimeSinceUpdateMs = Math.max(0, Date.now() - serverTimeAtUpdateMs);
      targetTimeSeconds = (serverVideoTimeMs + elapsedTimeSinceUpdateMs) / 1000;
    } else {
      targetTimeSeconds = serverVideoTimeMs / 1000;
    }

    const videoDuration = videoElement.duration;
    if (targetTimeSeconds < 0) targetTimeSeconds = 0;
    if (videoDuration && isFinite(videoDuration) && targetTimeSeconds > videoDuration - 0.1) {
      targetTimeSeconds = videoDuration - 0.1;
    }
    if (!isFinite(targetTimeSeconds)) {
      console.warn("Seek & Sync: Target time is not finite. Skipping seek.", targetTimeSeconds);
      return;
    }

    const currentTimeSeconds = videoElement.currentTime;
    const diffSeconds = targetTimeSeconds - currentTimeSeconds;

    const JUMP_THRESHOLD_SECONDS = 1.5; // Jump if diff is larger than this
    const RATE_ADJUST_START_THRESHOLD_SECONDS = 0.3; // Start rate adjustment if diff is larger than this (and smaller than jump)
    const MAX_PLAYBACK_RATE = 1.05; // Slightly reduced for smoother catchup
    const MIN_PLAYBACK_RATE = 0.95; // Slightly increased

    // Sync Logic
    // Condition 1: Initial Sync (must jump)
    if (!hasInitialServerSeekCompleted) {
      if (Math.abs(diffSeconds) > 0.1) { // Only jump if there's a meaningful difference
        console.log(`Seek & Sync (Initial): Jumping. Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s.`);
        videoElement.currentTime = targetTimeSeconds;
        // setHasInitialServerSeekCompleted will be set on 'seeked' or after a short delay
        // For now, we set it here, but a more robust solution would confirm the seek.
         if (isPlayerReady && videoElement.duration > 0) { // Check added here
            console.log("Seek & Sync: Initial jump attempted. Setting hasInitialServerSeekCompleted to true.");
            setHasInitialServerSeekCompleted(true);
        }
      } else if (isPlayerReady && videoElement.duration > 0 && !hasInitialServerSeekCompleted) {
        // If diff is small but initial seek not marked, mark it.
        console.log("Seek & Sync (Initial): Diff small, marking initial seek completed.");
        setHasInitialServerSeekCompleted(true);
      }
      if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
    // Condition 2: Server is Paused (must jump to match server time exactly)
    else if (streamState.playbackState !== 'playing') {
      if (Math.abs(diffSeconds) > 0.1) { // Only jump if meaningfully different
        console.log(`Seek & Sync (Server Paused): Jumping. Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s.`);
        videoElement.currentTime = targetTimeSeconds;
      }
      if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
    // Condition 3: Server is Playing, local video is playing, and desynced (after initial sync)
    else if (streamState.playbackState === 'playing' && !videoElement.paused) {
      if (Math.abs(diffSeconds) > JUMP_THRESHOLD_SECONDS) {
        console.log(`Seek & Sync (Large Diff): Jumping. Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s.`);
        videoElement.currentTime = targetTimeSeconds;
        if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
      } else if (Math.abs(diffSeconds) > RATE_ADJUST_START_THRESHOLD_SECONDS) {
        // Moderate difference: Adjust playback rate
        const rateFactor = 0.02; // How aggressively to change rate based on diff
        let newRate = 1.0 + diffSeconds * rateFactor;
        newRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, newRate));

        if (Math.abs(videoElement.playbackRate - newRate) > 0.001) { // Avoid tiny floating point updates
            videoElement.playbackRate = newRate;
            isCatchingUpRate.current = true;
            console.log(`Seek & Sync (Rate Adjust): Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s. New Rate: ${newRate.toFixed(3)}`);
        } else if (!isCatchingUpRate.current && videoElement.playbackRate !== 1.0) {
            // If we thought we were adjusting but now rate is close to 1, ensure it's exactly 1
             videoElement.playbackRate = 1.0; // Should be caught by next condition if still needed
        }

      } else { // Small difference or caught up
        if (videoElement.playbackRate !== 1.0 || isCatchingUpRate.current) {
          console.log(`Seek & Sync (In Sync/Caught Up): Diff: ${diffSeconds.toFixed(2)}s. Resetting rate to 1.0.`);
          videoElement.playbackRate = 1.0;
          isCatchingUpRate.current = false;
        }
      }
    }
    // Condition 4: Server is Playing, but local video is PAUSED (user paused it)
    else if (streamState.playbackState === 'playing' && videoElement.paused) {
        // User has paused locally while server is playing.
        // We should respect user's pause. Time will be corrected when user resumes.
        // Ensure playback rate is normal if we were catching up.
        if (videoElement.playbackRate !== 1.0) {
            videoElement.playbackRate = 1.0;
            isCatchingUpRate.current = false;
            console.log("Seek & Sync: Local pause while server plays. Ensured rate is 1.0.");
        }
    }

  }, [streamState, isPlayerReady, videoElement, hasInitialServerSeekCompleted, isVideoActuallyPlaying]); // Added isVideoActuallyPlaying

  // --- User Interaction Handlers (from Shaka UI or custom controls) ---
  const handleUserPlay = () => {
    console.log("User Action: Play clicked");
    setUserWantsToPlay(true);
    // The PlaybackControl effect will handle the rest based on server state
  };

  const handleUserPause = () => {
    console.log("User Action: Pause clicked");
    setUserWantsToPlay(false);
    // The PlaybackControl effect will handle the rest
  };

  // --- Native Video Element Event Handlers ---
  // These are for Shaka UI interactions if it directly manipulates the video element's play/pause
  // or if you add your own custom controls that call videoElement.play()/pause()
  const onNativePlay = useCallback(() => {
    console.log('Video Event: onPlay (native)');
    setIsVideoActuallyPlaying(true);
    // If user clicks play, their intent is clear.
    setUserWantsToPlay(true);
    userHadPlayIntentBeforeServerPauseRef.current = false; // Clear flag as user took action
    console.log('onNativePlay: User wants to play.');
  }, []); // Removed streamState dependency to simplify, user play is explicit

  const onNativePause = useCallback(() => {
    console.log('Video Event: onPause (native)');
    setIsVideoActuallyPlaying(false);
    // DO NOT automatically set userWantsToPlay to false here if the pause might be server-initiated.
    // PlaybackControl will handle userWantsToPlay if the server forces a pause.
    // If the user explicitly clicks a pause button that calls handleUserPause, that will set userWantsToPlay = false.
    // For now, let's assume native pause means user initiated it unless PlaybackControl says otherwise.
    // This part is tricky. If Shaka's pause button triggers this, it IS a user action.
    // If PlaybackControl calls videoElement.pause(), this also triggers.

    // Let's simplify: if PlaybackControl is what's causing the pause due to server state,
    // it will manage userHadPlayIntentBeforeServerPauseRef.
    // If this onNativePause is from a direct user click on Shaka's UI:
    if (streamState?.playbackState === 'playing') { // If server is playing, this pause must be user-initiated
        console.log('onNativePause: User paused while server is playing.');
        setUserWantsToPlay(false);
        userHadPlayIntentBeforeServerPauseRef.current = false; // User explicitly paused
    } else {
        // Server is also paused. userWantsToPlay might have already been set false by PlaybackControl.
        // Or user is pausing when server is already paused.
        console.log('onNativePause: Paused. Server state:', streamState?.playbackState);
        // If userWantsToPlay is true here, it means they clicked pause.
        if(userWantsToPlay) setUserWantsToPlay(false);
        userHadPlayIntentBeforeServerPauseRef.current = false;
    }


    if (videoElement) videoElement.playbackRate = 1.0;
    isCatchingUpRate.current = false;
  }, [videoElement, streamState, userWantsToPlay]); // Added userWantsToPlay


  const handleTimeUpdateForRateReset = useCallback(() => {
    if (isCatchingUpRate.current && videoElement && streamState?.stateUpdateServerTime && streamState.playbackState === 'playing') {
      const serverVideoTimeMs = lastKnownServerStateTimeMs.current;
      const serverTimeAtUpdateMs = streamState.stateUpdateServerTime;
      const elapsedTimeSinceUpdateMs = Math.max(0, Date.now() - serverTimeAtUpdateMs);
      const currentTargetTimeSeconds = (serverVideoTimeMs + elapsedTimeSinceUpdateMs) / 1000;

      if (Math.abs(videoElement.currentTime - currentTargetTimeSeconds) * 1000 <= PERFECT_SYNC_TOLERANCE_MS + 50) {
        console.log("handleTimeUpdateForRateReset: Caught up, resetting playback rate to 1.0.");
        videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
      }
    }
  }, [videoElement, streamState]);


  // Fullscreen change listener
  useEffect(() => {
    const cb = () => setIsFullScreen(!!document.fullscreenElement); // Now uses the declared setIsFullScreen
    document.addEventListener('fullscreenchange', cb);
    return () => document.removeEventListener('fullscreenchange', cb);
  }, []);


  if (!shakaScriptLoaded && !(window.shaka && window.shaka.ui)) {
    return <div className="w-full h-screen flex justify-center items-center bg-black text-white">Loading player library...</div>;
  }

  return (
    <div
      ref={playerContainerRef}
      className={`relative w-full h-screen bg-black overflow-hidden ${isFullScreen ? 'fixed inset-0 z-[9999]' : ''}`} // Now uses the declared isFullScreen
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay={false} // Autoplay is false; user must initiate first play via UI
        // Native onPlay/onPause are now for Shaka UI interactions primarily
        onPlay={onNativePlay}
        onPause={onNativePause}
        onTimeUpdate={handleTimeUpdateForRateReset}
        onError={(e: React.SyntheticEvent<HTMLVideoElement, Event>) => console.error('Native video error:', e.currentTarget.error)}
        onSeeking={() => {
          console.log("Video Event: seeking");
        }}
        onSeeked={() => {
          console.log("Video Event: seeked. Current time:", videoElement?.currentTime);
          lastUserSeekTime.current = Date.now(); // Mark that a user-driven seek just happened
          // The Seek & Sync effect will handle correction if needed.
        }}
      />

      {/* You would ideally replace Shaka's default play/pause button with your own
          that call handleUserPlay and handleUserPause, or ensure Shaka's UI
          events correctly update userWantsToPlay. For now, Shaka's play/pause
          will trigger onNativePlay/onNativePause. */}

      {(!streamState || !streamState.manifestUrl) && (
        <div className="absolute inset-0 flex justify-center items-center text-2xl p-5 text-center text-white pointer-events-none">
          {streamState === null ? 'Loading stream information...' : 'No active stream available.'}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
