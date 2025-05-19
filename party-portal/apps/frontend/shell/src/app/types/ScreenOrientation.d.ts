type OrientationLockType = 
  | 'any' 
  | 'natural' 
  | 'landscape' 
  | 'portrait' 
  | 'portrait-primary' 
  | 'portrait-secondary' 
  | 'landscape-primary' 
  | 'landscape-secondary';

interface ScreenOrientation {
  angle: number;
  type: 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary';
  lock(orientation: OrientationLockType): Promise<void>;
  unlock(): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  dispatchEvent(event: Event): boolean;
  onchange: ((this: ScreenOrientation, ev: Event) => any) | null;
}

// Extend the Screen interface globally
declare global {
  interface Screen {
    orientation: ScreenOrientation;
  }
}