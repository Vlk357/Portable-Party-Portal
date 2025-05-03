import { BackendMessage } from "./BackendMessage";
import { BackendRoom } from "./BackendRoom";
import { SimpleUser } from "./SimpleUser";

export interface InitialData {
  success: boolean;
  rooms: BackendRoom[];
  roomMessages: Record<number, BackendMessage[]>; // Messages keyed by room ID
  users: SimpleUser[];
  error?: string;
}