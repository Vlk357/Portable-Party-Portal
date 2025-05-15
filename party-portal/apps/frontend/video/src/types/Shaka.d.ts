declare namespace shaka {
  namespace extern {
    interface Error {
      code: number;
      detail?: any; // Or more specific type if known
      severity: number;
      category: number;
      data: any[];
      handled: boolean;
      message?: string;
      stack?: string;
      detail?: Error; // For nested errors
    }

    interface ErrorEvent extends Event { // Or use CustomEvent if that's more accurate
      type: 'error';
      detail: Error;
    }

    // Add other extern types as needed, e.g., Manifest, Track, Variant, etc.
    // For example:
    // interface Manifest {}
    // interface Track {}
  }

  export class Player {
    constructor(); // Constructor takes no arguments in modern versions
    attach(videoElement: HTMLMediaElement, initializeMediaSource?: boolean): Promise<void>;
    load(manifestUri: string, startTime?: number, manifestParserFactory?: shaka.extern.ManifestParser.Factory): Promise<void>;
    unload(): Promise<void>;
    destroy(): Promise<void>;
    seekRange(): { start: number; end: number };
    addEventListener(type: string, listener: (event: any) => void): void; // Simplified event listener
    removeEventListener(type: string, listener: (event: any) => void): void; // Simplified event listener
    // ... other Player methods and properties you use ...
    static isBrowserSupported(): boolean;
  }
}

// Extend the global Window interface
declare global {
  interface Window {
    shaka?: typeof shaka;
  }
}