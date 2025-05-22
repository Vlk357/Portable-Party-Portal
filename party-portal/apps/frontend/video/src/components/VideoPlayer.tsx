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

const PERFECT_SYNC_TOLERANCE_MS = 10;

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
  const [isVideoActuallyPlaying, setIsVideoActuallyPlaying] = useState(false);
  const [shakaScriptLoaded, setShakaScriptLoaded] = useState(!!(window.shaka && window.shaka.ui));
  const [lastSeekEventTime, setLastSeekEventTime] = useState<number>(0); // For seek events
  const [rafTrigger, setRafTrigger] = useState(0); // New state for RAF trigger

  const isCatchingUpRate = useRef(false);
  const lastUserInteractionTime = useRef(0); // To manage grace period for server overriding user *seek*
  const lastUserSeekTime = useRef(0); // For reactive seek correction
  const pollingIntervalRef = useRef<number | null>(null);
  const lastKnownServerStateTimeMs = useRef(0);

  // RAF loop to trigger Seek & Sync while playing
  useEffect(() => {
    let rafId: number | undefined;
    if (isVideoActuallyPlaying) {
      const loop = () => {
        setRafTrigger(prev => prev + 1); // Update state to trigger effect
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      // console.log("RAF loop started for Seek & Sync trigger");
    }
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        // console.log("RAF loop stopped");
      }
    };
  }, [isVideoActuallyPlaying]); // Only depends on isVideoActuallyPlaying


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
  }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

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
      event.preventDefault(); event.stopPropagation(); console.log('Double-click prevented on Shaka container/video.');
    };

    if (currentVideoElement && shakaScriptLoaded && !playerRef.current && currentContainerRef && window.shaka?.ui) {
      // Prevent double-click on the container that Shaka UI uses
      currentContainerRef.addEventListener('dblclick', preventDoubleClick);
      // Also on the video element itself, though Shaka's UI usually overlays this.
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

    // Scenario 1: Server wants to play, user was previously playing but is now marked as not wanting to play
    // (likely due to server-initiated pause that triggered onNativePause), AND we stored their intent.
    if (serverWantsToPlay && !userWantsToPlay && userHadPlayIntentBeforeServerPauseRef.current) {
        console.log("PlaybackControl: Server resumed play, and user had intent to play before server pause. Restoring user's play intent.");
        effectiveUserWantsToPlay = true;
        setUserWantsToPlay(true); // This will re-trigger the effect, but that's okay.
        userHadPlayIntentBeforeServerPauseRef.current = false; // Intent restored and acted upon.
    }


    const videoShouldBePlayingAccordingToIntentAndServer = effectiveUserWantsToPlay && serverWantsToPlay;
    const videoIsActuallyPaused = videoElement.paused;

    console.log(`PlaybackControl: Conditions: serverWantsToPlay: ${serverWantsToPlay}, effectiveUserWantsToPlay: ${effectiveUserWantsToPlay}, videoShouldBePlayingIntent: ${videoShouldBePlayingAccordingToIntentAndServer}, videoIsActuallyPaused: ${videoIsActuallyPaused}`);

    if (videoShouldBePlayingAccordingToIntentAndServer && videoIsActuallyPaused) {
      console.log("PlaybackControl: DECISION: Attempting play.");
      videoElement.play().catch(e => console.warn("PlaybackControl: play() failed.", e.message));
      // If we are playing because server wants to play and user's intent was restored, ensure flag is clear.
      // This is already handled by the block above that sets effectiveUserWantsToPlay = true.
    } else if (!videoShouldBePlayingAccordingToIntentAndServer && !videoIsActuallyPaused) {
      console.log(`PlaybackControl: DECISION: Attempting pause. (Reason: effectiveUserWantsPlay: ${effectiveUserWantsToPlay}, serverWantsPlay: ${serverWantsToPlay})`);
      // If this pause is due to server, and user *currently* wanted to play (before this decision), store that intent.
      if (!serverWantsToPlay && userWantsToPlay) {
        console.log("PlaybackControl: Server is pausing, but user wanted to play. Storing user's play intent.");
        userHadPlayIntentBeforeServerPauseRef.current = true;
      }
      // Do NOT clear userHadPlayIntentBeforeServerPauseRef.current here if serverWantsPlay is true
      // and effectiveUserWantsToPlay is false (user paused). The ref should only be cleared by user action or when intent is restored.
      else if (serverWantsToPlay && !effectiveUserWantsToPlay) {
        // User explicitly paused while server is playing. Clear any stored server-pause intent.
        userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      videoElement.pause();
    } else {
      // If no action is taken (e.g., already in desired state):
      // If server is playing and user effectively wants to play, ensure the flag is cleared
      // (it should have been cleared when intent was restored, but as a safeguard).
      if (serverWantsToPlay && effectiveUserWantsToPlay && userHadPlayIntentBeforeServerPauseRef.current) {
          console.log("PlaybackControl: No action, but clearing stale userHadPlayIntentBeforeServerPauseRef as server and user want play.");
          userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      console.log("PlaybackControl: DECISION: No action needed.");
    }
  }, [videoElement, isPlayerReady, streamState, userWantsToPlay, hasInitialServerSeekCompleted]);


  // --- Seek & Sync Effect (Time Synchronization & Anti-User-Seek) ---
  useEffect(() => {
    // Guard: Ensure all necessary data and objects are available.
    if (!videoElement || !streamState?.manifestUrl || !isPlayerReady || videoElement.seeking || !streamState.stateUpdateServerTime) {
      if (videoElement) console.log(`Seek & Sync: Guarded out. video.paused: ${videoElement.paused}, seeking: ${videoElement.seeking}, isPlayerReady: ${isPlayerReady}, manifest: ${!!streamState?.manifestUrl}, serverTime: ${!!streamState?.stateUpdateServerTime}`);
      else console.log(`Seek & Sync: Guarded out. Video element or streamState not ready.`);
      // If we are catching up but get guarded out, ensure the rate is reset if the video is paused.
      if (isCatchingUpRate.current && videoElement && videoElement.paused && videoElement.playbackRate !== 1.0) {
        console.log("Seek & Sync (Guard): Resetting rate to 1.0 because video paused while catching up.");
        videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
      }
      return;
    }
    // Log includes lastSeekEventTime and rafTrigger to see when it triggers
    // console.log(`Seek & Sync: Running. video.paused: ${videoElement.paused}, streamState.playbackState: ${streamState.playbackState}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}, lastSeekEventTime: ${lastSeekEventTime}, rafTrigger: ${rafTrigger}`);

    const USER_SEEK_CORRECTION_GRACE_MS = 300; // Grace period after a user seek
    // Check if the current seek event was very recent (likely user-initiated via scrub)
    // and if we are NOT in the initial server seek phase.
    // The existing lastUserSeekTime.current is set in onSeeked.
    // This grace period is more about not fighting an immediate re-correction if the user is actively scrubbing.
    // However, with the current logic, any seek will trigger this effect, and it will try to align to server time.
    // The `lastUserSeekTime.current` is mostly to identify if a seek was user-driven for potential different handling (currently not much different).

    const serverVideoTimeMs = streamState.videoPlaybackTimeMs;
    const serverTimeAtUpdateMs = streamState.stateUpdateServerTime;
    let targetTimeSeconds: number;

    if (streamState.playbackState === 'playing') {
      const elapsedTimeSinceUpdateMs = Math.max(0, Date.now() - serverTimeAtUpdateMs);
      targetTimeSeconds = (serverVideoTimeMs + elapsedTimeSinceUpdateMs) / 1000;
    } else { // Server is paused or stopped
      targetTimeSeconds = serverVideoTimeMs / 1000;
    }

    const videoDuration = videoElement.duration;
    if (targetTimeSeconds < 0) targetTimeSeconds = 0;
    if (videoDuration && isFinite(videoDuration) && targetTimeSeconds > videoDuration - 0.1) {
      targetTimeSeconds = videoDuration - 0.1; // Prevent seeking beyond duration
    }
    if (!isFinite(targetTimeSeconds)) {
      console.warn("Seek & Sync: Target time is not finite. Skipping seek.", targetTimeSeconds);
      return;
    }

    const currentTimeSeconds = videoElement.currentTime;
    const diffSeconds = targetTimeSeconds - currentTimeSeconds;

    const JUMP_THRESHOLD_SECONDS = 1.5;
    const MIN_DIFFERENCE_FOR_RATE_ADJUST_SECONDS = PERFECT_SYNC_TOLERANCE_MS / 1000.0; // e.g., 0.01s for 10ms tolerance
    const MAX_PLAYBACK_RATE = 1.1;
    const MIN_PLAYBACK_RATE = 0.9;

    // Sync Logic
    if (!hasInitialServerSeekCompleted) {
      if (Math.abs(diffSeconds) > 0.1) {
        console.log(`Seek & Sync (Initial): Jumping. Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s.`);
        videoElement.currentTime = targetTimeSeconds;
         if (isPlayerReady && videoElement.duration > 0) {
            console.log("Seek & Sync: Initial jump attempted. Setting hasInitialServerSeekCompleted to true.");
            setHasInitialServerSeekCompleted(true);
        }
      } else if (isPlayerReady && videoElement.duration > 0 && !hasInitialServerSeekCompleted) {
        console.log("Seek & Sync (Initial): Diff small, marking initial seek completed.");
        setHasInitialServerSeekCompleted(true);
      }
      if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
    else if (streamState.playbackState !== 'playing') {
      if (Math.abs(diffSeconds) > 0.1) {
        console.log(`Seek & Sync (Server Paused): Jumping. Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s.`);
        videoElement.currentTime = targetTimeSeconds;
      }
      if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
    else if (streamState.playbackState === 'playing' && !videoElement.paused) {
      // Condition 3: Server is Playing, local video is playing (after initial sync)
      if (Math.abs(diffSeconds) > JUMP_THRESHOLD_SECONDS) {
        console.log(`Seek & Sync (Large Diff): Jumping. Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s.`);
        videoElement.currentTime = targetTimeSeconds;
        if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0; // Reset rate on jump
        isCatchingUpRate.current = false;
      } else if (Math.abs(diffSeconds) > MIN_DIFFERENCE_FOR_RATE_ADJUST_SECONDS) {
        const rateFactor = 0.05;
        let newRate = 1.0 + diffSeconds * rateFactor;
        newRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, newRate));

        if (Math.abs(videoElement.playbackRate - newRate) > 0.001) {
            videoElement.playbackRate = newRate;
            isCatchingUpRate.current = true;
            // console.log(`Seek & Sync (Rate Adjust): Target: ${targetTimeSeconds.toFixed(2)}s, Current: ${currentTimeSeconds.toFixed(2)}s, Diff: ${diffSeconds.toFixed(2)}s. New Rate: ${newRate.toFixed(3)}`);
        } else if (!isCatchingUpRate.current && videoElement.playbackRate !== 1.0) {
             videoElement.playbackRate = 1.0;
        }
      } else { // Small difference (diff is <= MIN_DIFFERENCE_FOR_RATE_ADJUST_SECONDS)
        if (videoElement.playbackRate !== 1.0 || isCatchingUpRate.current) {
          // console.log(`Seek & Sync (In Sync/Caught Up - Diff: ${diffSeconds.toFixed(3)}s): Resetting rate to 1.0.`);
          videoElement.playbackRate = 1.0;
          isCatchingUpRate.current = false;
        }
      }
    }
    else if (streamState.playbackState === 'playing' && videoElement.paused) {
      // Condition 4: Server is Playing, but local video is PAUSED (user paused it)
      // User has paused locally while server is playing.
      // We should respect user's pause. Time will be corrected when user resumes.
      // Ensure playback rate is normal if we were catching up.
      if (videoElement.playbackRate !== 1.0) {
          videoElement.playbackRate = 1.0;
          isCatchingUpRate.current = false;
          console.log("Seek & Sync: Local pause while server plays. Ensured rate is 1.0.");
      }
    }

  }, [streamState, isPlayerReady, videoElement, hasInitialServerSeekCompleted, isVideoActuallyPlaying, lastSeekEventTime, rafTrigger]); // Added rafTrigger

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
      if (!userWantsToPlay) setUserWantsToPlay(true); // Set if not already true
      userHadPlayIntentBeforeServerPauseRef.current = false; // Clear flag as user took action
      console.log('onNativePlay: User wants to play.');
    }, [userWantsToPlay]); // Added userWantsToPlay
  
    const onNativePause = useCallback(() => {
    console.log('Video Event: onPause (native)');
    setIsVideoActuallyPlaying(false);

    const currentStreamState = streamStateRef.current; // Use a ref for freshest streamState

    if (currentStreamState?.playbackState === 'playing') {
      console.log('onNativePause: Pause event occurred while server state is "playing".');
      // If userWantsToPlay is true, PlaybackControl will see the video is paused and attempt to resume,
      // effectively correcting for a glitch.
      // If userWantsToPlay was already false (e.g., user clicked a custom pause button that sets it,
      // or PlaybackControl decided to pause due to user intent), PlaybackControl will respect that.
      // We DO NOT change userWantsToPlay here based on this event in this scenario.

      // If the server is 'playing', any prior server-induced pause that might have set
      // userHadPlayIntentBeforeServerPauseRef is now void because the server itself wants to play.
      // This flag should primarily be managed by PlaybackControl when it decides to pause
      // due to server instruction while the user wanted to play.
      // If the user explicitly paused (and userWantsToPlay became false), this flag should also be false.
      userHadPlayIntentBeforeServerPauseRef.current = false;
    }
    // If the server is 'paused'
    else if (currentStreamState?.playbackState === 'paused') {
      // This onNativePause could be due to:
      // 1. PlaybackControl just paused the video because the server state changed to 'paused'.
      //    In this case, PlaybackControl would have set userHadPlayIntentBeforeServerPauseRef.current
      //    if the user previously wanted to play. userWantsToPlay might still be true here.
      // 2. User clicked pause on an already server-paused stream.

      // If userWantsToPlay is true, it means the user's *last explicit action* was to play,
      // or PlaybackControl hasn't yet updated userWantsToPlay to false after a server pause.
      // We set userWantsToPlay to false to reflect the video is now paused.
      if (userWantsToPlay) {
        console.log('onNativePause: Video paused. Server is also paused. Setting userWantsToPlay to false.');
        setUserWantsToPlay(false);
      } else {
        console.log('onNativePause: Video paused. Server is also paused. userWantsToPlay was already false.');
      }
      // DO NOT CLEAR userHadPlayIntentBeforeServerPauseRef.current here if server is paused.
      // It might have been set by PlaybackControl if this pause is server-initiated
      // and the user previously wanted to play. PlaybackControl will clear it when intent is restored.
    }
    // For 'stopped' or other server states (e.g. null)
    else {
      console.log('onNativePause: Paused. Server state:', currentStreamState?.playbackState);
      if (userWantsToPlay) setUserWantsToPlay(false);
      userHadPlayIntentBeforeServerPauseRef.current = false; // General reset for non-playing/non-paused server states
    }

    if (videoElement && videoElement.playbackRate !== 1.0) {
      videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
  }, [videoElement, userWantsToPlay]); // streamStateRef is used for currentStreamState
  
    // Ref to hold the latest streamState for onNativePause/Play
    const streamStateRef = useRef<StreamState | null>(null);
    useEffect(() => {
      streamStateRef.current = streamState;
    }, [streamState]);
  
    // --- Playback Control Effect (Play/Pause Logic) ---
    useEffect(() => {
      // ... (the rest of PlaybackControl effect remains the same as your last provided version) ...
      // Make sure it uses `streamState` directly, not `streamStateRef.current`
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
  
      // Scenario 1: Server wants to play, user was previously playing but is now marked as not wanting to play
      // (likely due to server-initiated pause that triggered onNativePause), AND we stored their intent.
      if (serverWantsToPlay && !userWantsToPlay && userHadPlayIntentBeforeServerPauseRef.current) {
          console.log("PlaybackControl: Server resumed play, and user had intent to play before server pause. Restoring user's play intent.");
          effectiveUserWantsToPlay = true;
          setUserWantsToPlay(true); // This will re-trigger the effect, but that's okay.
          userHadPlayIntentBeforeServerPauseRef.current = false; // Intent restored and acted upon.
      }
  
  
      const videoShouldBePlayingAccordingToIntentAndServer = effectiveUserWantsToPlay && serverWantsToPlay;
      const videoIsActuallyPaused = videoElement.paused;
  
      console.log(`PlaybackControl: Conditions: serverWantsToPlay: ${serverWantsToPlay}, effectiveUserWantsToPlay: ${effectiveUserWantsToPlay}, videoShouldBePlayingIntent: ${videoShouldBePlayingAccordingToIntentAndServer}, videoIsActuallyPaused: ${videoIsActuallyPaused}`);
  
      if (videoShouldBePlayingAccordingToIntentAndServer && videoIsActuallyPaused) {
        console.log("PlaybackControl: DECISION: Attempting play.");
        videoElement.play().catch(e => console.warn("PlaybackControl: play() failed.", e.message));
      } else if (!videoShouldBePlayingAccordingToIntentAndServer && !videoIsActuallyPaused) {
        console.log(`PlaybackControl: DECISION: Attempting pause. (Reason: effectiveUserWantsPlay: ${effectiveUserWantsToPlay}, serverWantsPlay: ${serverWantsToPlay})`);
        if (!serverWantsToPlay && userWantsToPlay) { // userWantsToPlay is the state *before* this effect might change it
          console.log("PlaybackControl: Server is pausing, but user wanted to play. Storing user's play intent.");
          userHadPlayIntentBeforeServerPauseRef.current = true;
        }
        else if (serverWantsToPlay && !effectiveUserWantsToPlay) { // User explicitly paused while server is playing
          userHadPlayIntentBeforeServerPauseRef.current = false;
        }
        videoElement.pause();
      } else {
        if (serverWantsToPlay && effectiveUserWantsToPlay && userHadPlayIntentBeforeServerPauseRef.current) {
            console.log("PlaybackControl: No action, but clearing stale userHadPlayIntentBeforeServerPauseRef as server and user want play.");
            userHadPlayIntentBeforeServerPauseRef.current = false;
        }
        console.log("PlaybackControl: DECISION: No action needed.");
      }
    }, [videoElement, isPlayerReady, streamState, userWantsToPlay, hasInitialServerSeekCompleted]);
  // ...existing code...


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
      className={`relative w-full h-screen bg-black overflow-hidden ${isFullScreen ? 'fixed inset-0 z-[9999]' : ''}`}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay={false}
        onPlay={onNativePlay}
        onPause={onNativePause}
        onError={(e: React.SyntheticEvent<HTMLVideoElement, Event>) => console.error('Native video error:', e.currentTarget.error)}
        onSeeking={() => {
          console.log("Video Event: seeking");
          // lastUserSeekTime.current is already set in onSeeked, which is more definitive.
          // No need to set lastSeekEventTime here, as onSeeked is more appropriate.
        }}
        onSeeked={() => {
          const currentTime = videoElement?.currentTime;
          console.log("Video Event: seeked. Current time:", currentTime);
          lastUserSeekTime.current = Date.now(); // For grace period logic (if any remains relevant)
          setLastSeekEventTime(Date.now()); // Trigger Seek & Sync effect
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
