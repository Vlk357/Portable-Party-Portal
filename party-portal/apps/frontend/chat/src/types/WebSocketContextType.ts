import { Socket } from 'socket.io-client';
import { BackendRoom } from './BackendRoom';
import { BackendMessage } from './BackendMessage';
import { SimpleUser } from './SimpleUser';

export interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  rooms: BackendRoom[];
  messages: Record<number, BackendMessage[]>;
  users: SimpleUser[];
  sendMessage: (
    roomId: number,
    content: string,
    tempId: number,
    onConfirm: (tempId: number, messageId: number) => void,
    onError: (tempId: number, error: string) => void
  ) => void;
  getMessagesForRoom: (roomId: number) => BackendMessage[];
  requestUsers: () => void;
  setOnSelfMessageConfirmedHandler: (handler: (tempId: number) => void) => void;
}