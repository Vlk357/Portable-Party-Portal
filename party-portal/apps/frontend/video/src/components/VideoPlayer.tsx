import React, { useEffect, useRef, useState, useCallback } from 'react';

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
  stateUpdateServerTime?: number;
}

const loadScript = (src: string, id: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      if (window.shaka?.ui) {
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
          reject(
            new Error(
              `Shaka Player UI not available after script ${id} was found and polling.`
            )
          );
        }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.id = id;
    script.async = true;
    script.onload = () => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.shaka?.ui) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(
            new Error(
              'Shaka Player UI not available after script load and polling.'
            )
          );
        }
      }, 100);
    };
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });
};

const PERFECT_SYNC_TOLERANCE_MS = 10;

const VideoPlayer: React.FC = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  );
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    setVideoElement(node);
  }, []);

  const playerRef = useRef<shaka.Player | null>(null);
  const uiRef = useRef<shaka.ui.Overlay | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [shakaPlayerInstance, setShakaPlayerInstance] =
    useState<shaka.Player | null>(null);
  const [hasInitialServerSeekCompleted, setHasInitialServerSeekCompleted] =
    useState(false);
  const [userWantsToPlay, setUserWantsToPlay] = useState(false);
  const userHadPlayIntentBeforeServerPauseRef = useRef(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isVideoActuallyPlaying, setIsVideoActuallyPlaying] = useState(false);
  const [shakaScriptLoaded, setShakaScriptLoaded] = useState(
    !!(window.shaka && window.shaka.ui)
  );
  const [lastSeekEventTime, setLastSeekEventTime] = useState<number>(0);
  const [rafTrigger, setRafTrigger] = useState(0);

  const isCatchingUpRate = useRef(false);
  const lastUserInteractionTime = useRef(0);
  const lastUserSeekTime = useRef(0);
  const pollingIntervalRef = useRef<number | null>(null);
  const lastKnownServerStateTimeMs = useRef(0);

  useEffect(() => {
    let rafId: number | undefined;
    if (isVideoActuallyPlaying) {
      const loop = () => {
        setRafTrigger((prev) => prev + 1);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isVideoActuallyPlaying]);

  useEffect(() => {
    console.log('VideoPlayer: Main data fetching useEffect runs');

    const fetchStreamInfo = async (isInitialFetch = false) => {
      console.log(
        `FetchStreamInfo (${
          isInitialFetch ? 'initial' : 'polling'
        }): Attempting to fetch /cinema/api/stream/info`
      );
      try {
        const response = await fetch('/cinema/api/stream/info');
        console.log(
          `FetchStreamInfo (${
            isInitialFetch ? 'initial' : 'polling'
          }): Response status:`,
          response.status
        );
        if (response.ok) {
          const newData: StreamState = await response.json();

          console.log(
            `FetchStreamInfo (${
              isInitialFetch ? 'initial' : 'polling'
            }): Raw data received:`,
            JSON.stringify(newData)
          );

          if (
            !newData.manifestUrl ||
            typeof newData.videoPlaybackTimeMs !== 'number' ||
            !newData.stateUpdateServerTime ||
            typeof newData.stateUpdateServerTime !== 'number'
          ) {
            console.error(
              `FetchStreamInfo (${
                isInitialFetch ? 'initial' : 'polling'
              }): CRITICAL DATA MISSING or invalid in response. Manifest: ${
                newData.manifestUrl
              }, Time: ${newData.videoPlaybackTimeMs}, ServerTime: ${
                newData.stateUpdateServerTime
              }. Aborting state update for this fetch.`
            );
            return;
          }

          setStreamState((prevStreamState) => {
            if (
              isInitialFetch ||
              JSON.stringify(prevStreamState) !== JSON.stringify(newData)
            ) {
              console.log(
                `FetchStreamInfo (${
                  isInitialFetch ? 'initial' : 'polling'
                }): New or changed data, updating state.`
              );
              lastKnownServerStateTimeMs.current = newData.videoPlaybackTimeMs;
              if (
                prevStreamState?.manifestUrl !== newData.manifestUrl ||
                isInitialFetch
              ) {
                console.log(
                  `FetchStreamInfo (${
                    isInitialFetch ? 'initial' : 'polling'
                  }): Manifest changed or initial fetch. Resetting hasInitialServerSeekCompleted.`
                );
                setHasInitialServerSeekCompleted(false);
              }
              return newData;
            }
            console.log(
              `FetchStreamInfo (${
                isInitialFetch ? 'initial' : 'polling'
              }): Data unchanged, not updating state.`
            );
            return prevStreamState;
          });
        } else {
          console.error(
            `FetchStreamInfo (${
              isInitialFetch ? 'initial' : 'polling'
            }): Error fetching stream state: Response not OK`,
            response.status
          );
        }
      } catch (error) {
        console.error(
          `FetchStreamInfo (${
            isInitialFetch ? 'initial' : 'polling'
          }): Error fetching stream state:`,
          error
        );
      }
    };

    fetchStreamInfo(true);

    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = window.setInterval(
      () => fetchStreamInfo(false),
      5000
    );
    console.log('VideoPlayer: Polling started.');

    return () => {
      console.log(
        'VideoPlayer: Cleaning up main data fetching useEffect (polling).'
      );
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        console.log('VideoPlayer: Polling stopped.');
      }
    };
  }, []);

  useEffect(() => {
    if (!shakaScriptLoaded) {
      console.log('Attempting to load Shaka Player UI script...');
      loadScript('/libs/shaka-player.ui.min.js', 'shaka-player-ui-script')
        .then(() => {
          console.log('Shaka Player UI script dynamically loaded.');
          setShakaScriptLoaded(true);
        })
        .catch((error) =>
          console.error('Failed to load Shaka Player UI script:', error)
        );
    }
  }, [shakaScriptLoaded]);

  useEffect(() => {
    let uiInstance: shaka.ui.Overlay | null = null;
    const currentContainerRef = playerContainerRef.current;
    const currentVideoElement = videoElement;

    const preventDoubleClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('Double-click prevented on Shaka container/video.');
    };

    if (
      currentVideoElement &&
      shakaScriptLoaded &&
      !playerRef.current &&
      currentContainerRef &&
      window.shaka?.ui
    ) {
      currentContainerRef.addEventListener('dblclick', preventDoubleClick);

      currentVideoElement.addEventListener('dblclick', preventDoubleClick);

      if (window.shaka.Player.isBrowserSupported()) {
        const player = new window.shaka.Player();
        player.addEventListener('error', (event: any) => {
          console.error(
            '[VideoPlayer] Shaka Player Error Event:',
            event.detail
          );
          setIsPlayerReady(false);
        });
        player
          .attach(currentVideoElement)
          .then(() => {
            playerRef.current = player;
            setShakaPlayerInstance(player);
            const ui = new window.shaka.ui.Overlay(
              player,
              currentContainerRef!,
              currentVideoElement!
            );
            uiInstance = ui;
            uiRef.current = ui;
            ui.configure({
              controlPanelElements: [
                'play_pause',
                'time_and_duration',
                'spacer',
                'volume',
                'fullscreen',
              ],
              addBigPlayButton: true,
              enableKeyboardPlaybackControls: false,
            });
            console.log('[VideoPlayer] Shaka Player and UI initialized.');
          })
          .catch((error: any) =>
            console.error(
              '[VideoPlayer] Error attaching player to videoElement:',
              error
            )
          );
      } else {
        console.warn(
          '[VideoPlayer] Shaka Player or UI not available or browser not supported.'
        );
      }
    }
    return () => {
      uiInstance
        ?.destroy()
        .catch((e) =>
          console.error('[VideoPlayer] Error destroying Shaka UI', e)
        );
      playerRef.current
        ?.destroy()
        .catch((e) =>
          console.error('[VideoPlayer] Error destroying Shaka Player', e)
        );
      if (currentContainerRef)
        currentContainerRef.removeEventListener('dblclick', preventDoubleClick);
      if (currentVideoElement)
        currentVideoElement.removeEventListener('dblclick', preventDoubleClick);
      uiRef.current = null;
      playerRef.current = null;
      setShakaPlayerInstance(null);
      setIsPlayerReady(false);
      setHasInitialServerSeekCompleted(false);
    };
  }, [videoElement, shakaScriptLoaded]);

  useEffect(() => {
    setIsPlayerReady(false);
    if (!streamState?.manifestUrl || !shakaPlayerInstance) {
      if (shakaPlayerInstance && shakaPlayerInstance.getAssetUri()) {
        shakaPlayerInstance
          .unload()
          .catch((e) => console.error('Error unloading Shaka content', e));
      }
      return;
    }
    const manifestToLoad = `/movies/${streamState.manifestUrl}`;
    console.log('LoadManifest: Loading:', manifestToLoad);
    shakaPlayerInstance
      .load(manifestToLoad)
      .then(() => {
        console.log('LoadManifest: Success:', manifestToLoad);
        setIsPlayerReady(true);
      })
      .catch((error: any) => {
        console.error(
          'LoadManifest: Error loading manifest. Code:',
          error.code,
          error
        );
        setIsPlayerReady(false);
      });
  }, [streamState?.manifestUrl, shakaPlayerInstance]);

  useEffect(() => {
    console.log(
      `PlaybackControl: Effect triggered. userWantsToPlay: ${userWantsToPlay}, userHadPlayIntentBeforeServerPause: ${
        userHadPlayIntentBeforeServerPauseRef.current
      }, isPlayerReady: ${isPlayerReady}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}, videoElement: ${!!videoElement}, streamState: ${JSON.stringify(
        streamState?.playbackState
      )}, videoActuallyPlaying: ${!videoElement?.paused}`
    );

    if (
      !videoElement ||
      !isPlayerReady ||
      !streamState ||
      !hasInitialServerSeekCompleted
    ) {
      console.log(
        `PlaybackControl: Guards failed. videoElement: ${!!videoElement}, isPlayerReady: ${isPlayerReady}, streamState: ${!!streamState}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}`
      );
      if (videoElement && videoElement.seeking)
        console.log(
          'PlaybackControl: Guard failed due to videoElement.seeking'
        );
      return;
    }
    if (videoElement.seeking) {
      console.log(
        'PlaybackControl: Video is seeking, deferring play/pause action.'
      );
      return;
    }

    const serverWantsToPlay = streamState.playbackState === 'playing';
    let effectiveUserWantsToPlay = userWantsToPlay;

    if (
      serverWantsToPlay &&
      !userWantsToPlay &&
      userHadPlayIntentBeforeServerPauseRef.current
    ) {
      console.log(
        "PlaybackControl: Server resumed play, and user had intent to play before server pause. Restoring user's play intent."
      );
      effectiveUserWantsToPlay = true;
      setUserWantsToPlay(true);
      userHadPlayIntentBeforeServerPauseRef.current = false;
    }

    const videoShouldBePlayingAccordingToIntentAndServer =
      effectiveUserWantsToPlay && serverWantsToPlay;
    const videoIsActuallyPaused = videoElement.paused;

    console.log(
      `PlaybackControl: Conditions: serverWantsToPlay: ${serverWantsToPlay}, effectiveUserWantsToPlay: ${effectiveUserWantsToPlay}, videoShouldBePlayingIntent: ${videoShouldBePlayingAccordingToIntentAndServer}, videoIsActuallyPaused: ${videoIsActuallyPaused}`
    );

    if (
      videoShouldBePlayingAccordingToIntentAndServer &&
      videoIsActuallyPaused
    ) {
      console.log('PlaybackControl: DECISION: Attempting play.');
      videoElement
        .play()
        .catch((e) =>
          console.warn('PlaybackControl: play() failed.', e.message)
        );
    } else if (
      !videoShouldBePlayingAccordingToIntentAndServer &&
      !videoIsActuallyPaused
    ) {
      console.log(
        `PlaybackControl: DECISION: Attempting pause. (Reason: effectiveUserWantsPlay: ${effectiveUserWantsToPlay}, serverWantsPlay: ${serverWantsToPlay})`
      );

      if (!serverWantsToPlay && userWantsToPlay) {
        console.log(
          "PlaybackControl: Server is pausing, but user wanted to play. Storing user's play intent."
        );
        userHadPlayIntentBeforeServerPauseRef.current = true;
      } else if (serverWantsToPlay && !effectiveUserWantsToPlay) {
        userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      videoElement.pause();
    } else {
      if (
        serverWantsToPlay &&
        effectiveUserWantsToPlay &&
        userHadPlayIntentBeforeServerPauseRef.current
      ) {
        console.log(
          'PlaybackControl: No action, but clearing stale userHadPlayIntentBeforeServerPauseRef as server and user want play.'
        );
        userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      console.log('PlaybackControl: DECISION: No action needed.');
    }
  }, [
    videoElement,
    isPlayerReady,
    streamState,
    userWantsToPlay,
    hasInitialServerSeekCompleted,
  ]);

  useEffect(() => {
    if (
      !videoElement ||
      !streamState?.manifestUrl ||
      !isPlayerReady ||
      videoElement.seeking ||
      !streamState.stateUpdateServerTime
    ) {
      if (videoElement)
        console.log(
          `Seek & Sync: Guarded out. video.paused: ${
            videoElement.paused
          }, seeking: ${
            videoElement.seeking
          }, isPlayerReady: ${isPlayerReady}, manifest: ${!!streamState?.manifestUrl}, serverTime: ${!!streamState?.stateUpdateServerTime}`
        );
      else
        console.log(
          `Seek & Sync: Guarded out. Video element or streamState not ready.`
        );

      if (
        isCatchingUpRate.current &&
        videoElement &&
        videoElement.paused &&
        videoElement.playbackRate !== 1.0
      ) {
        console.log(
          'Seek & Sync (Guard): Resetting rate to 1.0 because video paused while catching up.'
        );
        videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
      }
      return;
    }

    const USER_SEEK_CORRECTION_GRACE_MS = 300;

    const serverVideoTimeMs = streamState.videoPlaybackTimeMs;
    const serverTimeAtUpdateMs = streamState.stateUpdateServerTime;
    let targetTimeSeconds: number;

    if (streamState.playbackState === 'playing') {
      const elapsedTimeSinceUpdateMs = Math.max(
        0,
        Date.now() - serverTimeAtUpdateMs
      );
      targetTimeSeconds = (serverVideoTimeMs + elapsedTimeSinceUpdateMs) / 1000;
    } else {
      targetTimeSeconds = serverVideoTimeMs / 1000;
    }

    const videoDuration = videoElement.duration;
    if (targetTimeSeconds < 0) targetTimeSeconds = 0;
    if (
      videoDuration &&
      isFinite(videoDuration) &&
      targetTimeSeconds > videoDuration - 0.1
    ) {
      targetTimeSeconds = videoDuration - 0.1;
    }
    if (!isFinite(targetTimeSeconds)) {
      console.warn(
        'Seek & Sync: Target time is not finite. Skipping seek.',
        targetTimeSeconds
      );
      return;
    }

    const currentTimeSeconds = videoElement.currentTime;
    const diffSeconds = targetTimeSeconds - currentTimeSeconds;

    const JUMP_THRESHOLD_SECONDS = 1.5;
    const MIN_DIFFERENCE_FOR_RATE_ADJUST_SECONDS =
      PERFECT_SYNC_TOLERANCE_MS / 1000.0;
    const MAX_PLAYBACK_RATE = 1.1;
    const MIN_PLAYBACK_RATE = 0.9;

    if (!hasInitialServerSeekCompleted) {
      if (Math.abs(diffSeconds) > 0.1) {
        console.log(
          `Seek & Sync (Initial): Jumping. Target: ${targetTimeSeconds.toFixed(
            2
          )}s, Current: ${currentTimeSeconds.toFixed(
            2
          )}s, Diff: ${diffSeconds.toFixed(2)}s.`
        );
        videoElement.currentTime = targetTimeSeconds;
        if (isPlayerReady && videoElement.duration > 0) {
          console.log(
            'Seek & Sync: Initial jump attempted. Setting hasInitialServerSeekCompleted to true.'
          );
          setHasInitialServerSeekCompleted(true);
        }
      } else if (
        isPlayerReady &&
        videoElement.duration > 0 &&
        !hasInitialServerSeekCompleted
      ) {
        console.log(
          'Seek & Sync (Initial): Diff small, marking initial seek completed.'
        );
        setHasInitialServerSeekCompleted(true);
      }
      if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    } else if (streamState.playbackState !== 'playing') {
      if (Math.abs(diffSeconds) > 0.1) {
        console.log(
          `Seek & Sync (Server Paused): Jumping. Target: ${targetTimeSeconds.toFixed(
            2
          )}s, Current: ${currentTimeSeconds.toFixed(
            2
          )}s, Diff: ${diffSeconds.toFixed(2)}s.`
        );
        videoElement.currentTime = targetTimeSeconds;
      }
      if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    } else if (
      streamState.playbackState === 'playing' &&
      !videoElement.paused
    ) {
      if (Math.abs(diffSeconds) > JUMP_THRESHOLD_SECONDS) {
        console.log(
          `Seek & Sync (Large Diff): Jumping. Target: ${targetTimeSeconds.toFixed(
            2
          )}s, Current: ${currentTimeSeconds.toFixed(
            2
          )}s, Diff: ${diffSeconds.toFixed(2)}s.`
        );
        videoElement.currentTime = targetTimeSeconds;
        if (videoElement.playbackRate !== 1.0) videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
      } else if (
        Math.abs(diffSeconds) > MIN_DIFFERENCE_FOR_RATE_ADJUST_SECONDS
      ) {
        const rateFactor = 0.05;
        let newRate = 1.0 + diffSeconds * rateFactor;
        newRate = Math.max(
          MIN_PLAYBACK_RATE,
          Math.min(MAX_PLAYBACK_RATE, newRate)
        );

        if (Math.abs(videoElement.playbackRate - newRate) > 0.001) {
          videoElement.playbackRate = newRate;
          isCatchingUpRate.current = true;
        } else if (
          !isCatchingUpRate.current &&
          videoElement.playbackRate !== 1.0
        ) {
          videoElement.playbackRate = 1.0;
        }
      } else {
        if (videoElement.playbackRate !== 1.0 || isCatchingUpRate.current) {
          videoElement.playbackRate = 1.0;
          isCatchingUpRate.current = false;
        }
      }
    } else if (streamState.playbackState === 'playing' && videoElement.paused) {
      if (videoElement.playbackRate !== 1.0) {
        videoElement.playbackRate = 1.0;
        isCatchingUpRate.current = false;
        console.log(
          'Seek & Sync: Local pause while server plays. Ensured rate is 1.0.'
        );
      }
    }
  }, [
    streamState,
    isPlayerReady,
    videoElement,
    hasInitialServerSeekCompleted,
    isVideoActuallyPlaying,
    lastSeekEventTime,
    rafTrigger,
  ]);

  const handleUserPlay = () => {
    console.log('User Action: Play clicked');
    setUserWantsToPlay(true);
  };

  const handleUserPause = () => {
    console.log('User Action: Pause clicked');
    setUserWantsToPlay(false);
  };

  const onNativePlay = useCallback(() => {
    console.log('Video Event: onPlay (native)');
    setIsVideoActuallyPlaying(true);

    if (!userWantsToPlay) setUserWantsToPlay(true);
    userHadPlayIntentBeforeServerPauseRef.current = false;
    console.log('onNativePlay: User wants to play.');
  }, [userWantsToPlay]);

  const onNativePause = useCallback(() => {
    console.log('Video Event: onPause (native)');
    setIsVideoActuallyPlaying(false);

    const currentStreamState = streamStateRef.current;

    if (currentStreamState?.playbackState === 'playing') {
      console.log(
        'onNativePause: Pause event occurred while server state is "playing".'
      );

      userHadPlayIntentBeforeServerPauseRef.current = false;
    } else if (currentStreamState?.playbackState === 'paused') {
      if (userWantsToPlay) {
        console.log(
          'onNativePause: Video paused. Server is also paused. Setting userWantsToPlay to false.'
        );
        setUserWantsToPlay(false);
      } else {
        console.log(
          'onNativePause: Video paused. Server is also paused. userWantsToPlay was already false.'
        );
      }
    } else {
      console.log(
        'onNativePause: Paused. Server state:',
        currentStreamState?.playbackState
      );
      if (userWantsToPlay) setUserWantsToPlay(false);
      userHadPlayIntentBeforeServerPauseRef.current = false;
    }

    if (videoElement && videoElement.playbackRate !== 1.0) {
      videoElement.playbackRate = 1.0;
      isCatchingUpRate.current = false;
    }
  }, [videoElement, userWantsToPlay]);

  const streamStateRef = useRef<StreamState | null>(null);
  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  useEffect(() => {
    console.log(
      `PlaybackControl: Effect triggered. userWantsToPlay: ${userWantsToPlay}, userHadPlayIntentBeforeServerPause: ${
        userHadPlayIntentBeforeServerPauseRef.current
      }, isPlayerReady: ${isPlayerReady}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}, videoElement: ${!!videoElement}, streamState: ${JSON.stringify(
        streamState?.playbackState
      )}, videoActuallyPlaying: ${!videoElement?.paused}`
    );

    if (
      !videoElement ||
      !isPlayerReady ||
      !streamState ||
      !hasInitialServerSeekCompleted
    ) {
      console.log(
        `PlaybackControl: Guards failed. videoElement: ${!!videoElement}, isPlayerReady: ${isPlayerReady}, streamState: ${!!streamState}, hasInitialServerSeekCompleted: ${hasInitialServerSeekCompleted}`
      );
      if (videoElement && videoElement.seeking)
        console.log(
          'PlaybackControl: Guard failed due to videoElement.seeking'
        );
      return;
    }
    if (videoElement.seeking) {
      console.log(
        'PlaybackControl: Video is seeking, deferring play/pause action.'
      );
      return;
    }

    const serverWantsToPlay = streamState.playbackState === 'playing';
    let effectiveUserWantsToPlay = userWantsToPlay;

    if (
      serverWantsToPlay &&
      !userWantsToPlay &&
      userHadPlayIntentBeforeServerPauseRef.current
    ) {
      console.log(
        "PlaybackControl: Server resumed play, and user had intent to play before server pause. Restoring user's play intent."
      );
      effectiveUserWantsToPlay = true;
      setUserWantsToPlay(true);
      userHadPlayIntentBeforeServerPauseRef.current = false;
    }

    const videoShouldBePlayingAccordingToIntentAndServer =
      effectiveUserWantsToPlay && serverWantsToPlay;
    const videoIsActuallyPaused = videoElement.paused;

    console.log(
      `PlaybackControl: Conditions: serverWantsToPlay: ${serverWantsToPlay}, effectiveUserWantsToPlay: ${effectiveUserWantsToPlay}, videoShouldBePlayingIntent: ${videoShouldBePlayingAccordingToIntentAndServer}, videoIsActuallyPaused: ${videoIsActuallyPaused}`
    );

    if (
      videoShouldBePlayingAccordingToIntentAndServer &&
      videoIsActuallyPaused
    ) {
      console.log('PlaybackControl: DECISION: Attempting play.');
      videoElement
        .play()
        .catch((e) =>
          console.warn('PlaybackControl: play() failed.', e.message)
        );
    } else if (
      !videoShouldBePlayingAccordingToIntentAndServer &&
      !videoIsActuallyPaused
    ) {
      console.log(
        `PlaybackControl: DECISION: Attempting pause. (Reason: effectiveUserWantsPlay: ${effectiveUserWantsToPlay}, serverWantsPlay: ${serverWantsToPlay})`
      );
      if (!serverWantsToPlay && userWantsToPlay) {
        console.log(
          "PlaybackControl: Server is pausing, but user wanted to play. Storing user's play intent."
        );
        userHadPlayIntentBeforeServerPauseRef.current = true;
      } else if (serverWantsToPlay && !effectiveUserWantsToPlay) {
        userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      videoElement.pause();
    } else {
      if (
        serverWantsToPlay &&
        effectiveUserWantsToPlay &&
        userHadPlayIntentBeforeServerPauseRef.current
      ) {
        console.log(
          'PlaybackControl: No action, but clearing stale userHadPlayIntentBeforeServerPauseRef as server and user want play.'
        );
        userHadPlayIntentBeforeServerPauseRef.current = false;
      }
      console.log('PlaybackControl: DECISION: No action needed.');
    }
  }, [
    videoElement,
    isPlayerReady,
    streamState,
    userWantsToPlay,
    hasInitialServerSeekCompleted,
  ]);

  useEffect(() => {
    const cb = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', cb);
    return () => document.removeEventListener('fullscreenchange', cb);
  }, []);

  if (!shakaScriptLoaded && !(window.shaka && window.shaka.ui)) {
    return (
      <div className="w-full h-screen flex justify-center items-center bg-black text-white">
        Loading player library...
      </div>
    );
  }

  return (
    <div
      ref={playerContainerRef}
      className={`relative w-full h-screen bg-black overflow-hidden ${
        isFullScreen ? 'fixed inset-0 z-[9999]' : ''
      }`}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay={false}
        onPlay={onNativePlay}
        onPause={onNativePause}
        onError={(e: React.SyntheticEvent<HTMLVideoElement, Event>) =>
          console.error('Native video error:', e.currentTarget.error)
        }
        onSeeking={() => {
          console.log('Video Event: seeking');
        }}
        onSeeked={() => {
          const currentTime = videoElement?.currentTime;
          console.log('Video Event: seeked. Current time:', currentTime);
          lastUserSeekTime.current = Date.now();
          setLastSeekEventTime(Date.now());
        }}
      />

      {(!streamState || !streamState.manifestUrl) && (
        <div className="absolute inset-0 flex justify-center items-center text-2xl p-5 text-center text-white pointer-events-none">
          {streamState === null
            ? 'Loading stream information...'
            : 'No active stream available.'}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
