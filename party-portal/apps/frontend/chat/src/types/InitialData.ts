import { BackendRoom } from "./BackendRoom";
import { RawBackendMessage } from "./RawBackendMessage";
import { SimpleUser } from "./SimpleUser";

export interface InitialData {
  success: boolean;
  rooms: BackendRoom[];
  roomMessages: Record<number, RawBackendMessage[]>; // Messages keyed by room ID
  users: SimpleUser[];
  error?: string;
}