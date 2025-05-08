declare namespace shaka {
  class Player {
    constructor(videoElement: HTMLVideoElement, dependencyInjector?: unknown);

    destroy(): Promise<void>;
    load(
      manifestUri: string,
      startTime?: number,
      manifestParser?: unknown
    ): Promise<void>;
    configure(config: Record<string, unknown>): void;
    getNetworkingEngine(): unknown;

    static isBrowserSupported(): boolean;
    static setLogLevel(level: number): void;
  }
}

// Extend the global Window interface
declare global {
  interface Window {
    shaka: typeof shaka;
  }
}
