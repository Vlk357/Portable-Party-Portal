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
      enableKeyboardPlaybackControls?: boolean; // Added this
      // Allow any other string keys for custom configurations like customHamburgerCallback
      [key: string]: any; 
    }

    export class Overlay {
      constructor(
        player: shaka.Player,
        container: HTMLElement,
        videoElement: HTMLVideoElement
      );
      configure(config: UIConfiguration | Record<string, any>): void; // Record<string, any> is fine
      destroy(): Promise<void>;
      getControls(): shaka.ui.Controls | null; // Method to get controls
    }

    // --- Define Controls and related interfaces ---
    export class Controls {
      constructor(player: shaka.Player, video: HTMLVideoElement, container: HTMLElement, config: UIConfiguration);
      static registerElement(name: string, factory: any): void; // 'any' for factory for simplicity
      static elementNames_?: string[]; // Optional, as it's somewhat internal

      eventManager: EventManager; // Add EventManager type
      getConfig(): UIConfiguration;
      getPlayer(): shaka.Player;
      getVideo(): HTMLVideoElement;
      getContainer(): HTMLElement;
      isSeeking(): boolean;
      // Add other methods/properties of Controls if you use them
    }

    // Minimal EventManager definition
    export class EventManager {
      listen(target: EventTarget, eventType: string, listener: (event: Event) => void): void;
      unlistenAll(): void;
      // Add other methods if needed
    }
  }
}
