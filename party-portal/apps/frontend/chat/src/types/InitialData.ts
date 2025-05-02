import { BackendMessage } from "./BackendMessage";
import { BackendRoom } from "./BackendRoom";

export interface InitialData {
  success: boolean;
  rooms: BackendRoom[];
  roomMessages: Record<number, BackendMessage[]>; // Messages keyed by room ID
  error?: string;
}