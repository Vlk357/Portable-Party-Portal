import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface StreamState {
  manifestUrl: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  videoPlaybackTimeMs: number;
}

const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
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
      // Only hide if playing
      hideTimeout = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, 3000);
    }
    return () => {
      clearTimeout(hideTimeout);
    };
  }, [isControlsVisible, streamState?.playbackState]);

  // Fetch stream state from API
  useEffect(() => {
    const fetchStreamState = async () => {
      try {
        const response = await fetch('/cinema/api/stream/info');
        if (response.ok) {
          const data = await response.json();
          setStreamState(data);
        }
      } catch (error) {
        console.error('Error fetching stream state:', error);
      }
    };
    fetchStreamState();
    const interval = setInterval(fetchStreamState, 5000);
    return () => clearInterval(interval);
  }, []);

  // Set up video source (keep as is, Shaka player logic is separate from styling)
  useEffect(() => {
    if (!streamState?.manifestUrl || !videoRef.current) return;
    const videoElement = videoRef.current;
    if (window.shaka) {
      const player = new window.shaka.Player(videoElement);
      player
        .load(`/movies/${streamState.manifestUrl}`)
        .catch((error: Error) => {
          console.error('Error loading video:', error);
        });
    } else {
      videoElement.src = `/movies/${streamState.manifestUrl}`;
    }
    if (streamState.videoPlaybackTimeMs > 0) {
      videoElement.currentTime = streamState.videoPlaybackTimeMs / 1000;
    }
    if (streamState.playbackState === 'playing') {
      videoElement
        .play()
        .catch((error) => console.error('Error playing:', error));
    } else {
      videoElement.pause();
    }
  }, [
    streamState?.manifestUrl,
    streamState?.playbackState,
    streamState?.videoPlaybackTimeMs,
  ]);

  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      setIsVideoVertical(videoHeight > videoWidth);
      if (isFullScreen) {
        // Only attempt orientation lock if already in fullscreen
        requestOrientationLock();
      }
    }
  };

  const requestOrientationLock = () => {
    try {
      if (
        window.screen.orientation &&
        typeof window.screen.orientation.lock === 'function'
      ) {
        const lockOrientation = isVideoVertical ? 'portrait' : 'landscape';
        window.screen.orientation.lock(lockOrientation).catch((e: Error) => {
          console.log(`Failed to lock to ${lockOrientation}:`, e);
        });
      }
    } catch (error) {
      console.error('Error locking orientation:', error);
    }
  };

  const toggleFullScreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current
        .requestFullscreen()
        .then(() => {
          setIsFullScreen(true);
          requestOrientationLock();
        })
        .catch((err) => {
          console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
      document.exitFullscreen().then(() => setIsFullScreen(false));
    }
  };

  // Update fullscreen state on change (e.g. ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleUserInteraction = () => {
    setIsControlsVisible(true);
  };

  const handleBack = () => {
    window.parent.postMessage({ type: 'NAVIGATE_BACK' }, '*');
    navigate(-1);
  };

  if (!streamState || !streamState.manifestUrl) {
    return (
      <div className="w-full h-screen flex justify-center items-center bg-black text-white">
        <div className="text-2xl p-5 text-center">
          No active stream available
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
      onTouchStart={handleUserInteraction} // For touch devices
    >
      <video
        ref={videoRef}
        className={videoElementClasses}
        onLoadedMetadata={handleMetadataLoaded}
        playsInline // Important for iOS
        autoPlay
        // Consider adding 'controls' attribute for native controls as a fallback or for accessibility
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

          <div className="text-white text-lg font-bold">
            {/* Text shadow: Tailwind doesn't have text-shadow utilities by default. 
                You might need a plugin (e.g., tailwindcss-textshadow) or custom CSS for this.
                Example with plugin: className="text-white text-lg font-bold text-shadow-md" 
            */}
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
        {/* Placeholder for bottom controls (play/pause, timeline, volume) if you add them later */}
        <div></div>
      </div>
    </div>
  );
};

export default VideoPlayer;
