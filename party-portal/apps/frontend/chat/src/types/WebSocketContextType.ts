import { Socket } from "socket.io-client";
import { BackendRoom } from "./BackendRoom";
import { BackendMessage } from "./BackendMessage";
import { SimpleUser } from "./SimpleUser";

export interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  rooms: BackendRoom[];
  messages: Record<number, BackendMessage[]>;
  users: SimpleUser[];
  sendMessage: (roomId: number, content: string) => void;
  getMessagesForRoom: (roomId: number) => BackendMessage[];
  requestUsers: () => void;
}