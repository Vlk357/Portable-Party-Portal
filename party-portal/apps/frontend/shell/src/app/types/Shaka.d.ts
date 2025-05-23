// Extend the global Window interface first
declare global {
  interface Window {
    shaka?: typeof shaka; // This makes window.shaka available
  }
}

// Then declare the shaka namespace
declare namespace shaka {
  // --- Core Player (minimal definition if @types/shaka-player is problematic) ---
  export class Player {
    constructor();
    attach(
      videoElement: HTMLMediaElement,
      initializeMediaSource?: boolean
    ): Promise<void>;
    load(
      manifestUri: string,
      startTime?: number,
      manifestParserFactory?: shaka.extern.ManifestParser.Factory
    ): Promise<void>;
    unload(): Promise<void>;
    destroy(): Promise<void>;
    seekRange(): { start: number; end: number };
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
    static isBrowserSupported(): boolean;
    getAssetUri(): string | null;
  }

  // --- Extern (minimal definition for ErrorEvent and Error) ---
  namespace extern {
    interface Error {
      code: number;
      severity: number;
      category: number;
      data: any[];
      handled: boolean;
      message?: string;
      stack?: string;
      detail?: Error; // For nested errors
    }

    interface ErrorEvent extends Event {
      type: 'error';
      detail: Error;
    }

    namespace ManifestParser {
      type Factory = () => shaka.extern.ManifestParser;
    }
    interface ManifestParser {
      // Define methods if needed, or leave as an empty interface
    }
  }

  // --- UI Namespace ---
  namespace ui {
    interface UIConfiguration {
      controlPanelElements?: string[];
      overflowMenuButtons?: string[];
      addBigPlayButton?: boolean;
    }

    export class Overlay {
      constructor(
        player: shaka.Player,
        container: HTMLElement,
        videoElement: HTMLVideoElement
      );
      configure(config: UIConfiguration | Record<string, any>): void;
      destroy(): Promise<void>;
    }
  }
}
