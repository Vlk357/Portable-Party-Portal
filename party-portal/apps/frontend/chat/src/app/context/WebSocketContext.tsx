import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { handleLogout, refreshToken, getAuthTokens } from '../../utils/apiFetch';
import { BackendRoom } from '../../types/BackendRoom';
import { BackendMessage } from '../../types/BackendMessage';
import { InitialData } from '../../types/InitialData';
import type { SimpleUser } from '../../types/SimpleUser';
import { WebSocketContextType } from '../../types/WebSocketContextType';

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined
);

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<BackendRoom[]>([]);
  const [messages, setMessages] = useState<Record<number, BackendMessage[]>>(
    {}
  );
  const [users, setUsers] = useState<SimpleUser[]>([]); // Add users state

  const socketInstanceRef = useRef<Socket | null>(null);
  const isRefreshingTokenRef = useRef(false);

  useEffect(() => {
    const { token } = getAuthTokens();

    if (!token) {
      console.log('No token found, skipping WebSocket connection.');
      setError('Authentication token not found.');
      setIsLoading(false);
      return;
    }

    if (socketInstanceRef.current) {
      console.log(
        'WebSocketProvider effect: Skipping setup, socket instance already exists.'
      );
      return;
    }

    console.log('WebSocketProvider effect: Starting setup');
    let currentToken = localStorage.getItem('token');

    if (!currentToken) {
      setError('Authentication token not found.');
      setIsLoading(false);
      return;
    }

    const wsUrl =
      import.meta.env.VITE_CHAT_WEBSOCKET_URL || 'ws://127.0.0.1:8080/chat';
    console.log('Attempting to connect to WebSocket:', wsUrl);

    setIsLoading(true);
    setError(null);

    const newSocket = io(wsUrl, {
      auth: { token: currentToken },
      transports: ['websocket'],
      reconnection: false,
    });

    socketInstanceRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      if (socketInstanceRef.current === newSocket) {
        setSocket(newSocket);
        setIsConnected(true);
        setError(null);
        isRefreshingTokenRef.current = false;
      }
    });

    newSocket.on('initialData', (data: InitialData) => {
      console.log('Received initialData:', data);
      if (socketInstanceRef.current !== newSocket) return;

      if (data.success) {
        setRooms(data.rooms || []);
        const initialMessages: Record<number, BackendMessage[]> = {};
        (data.rooms || []).forEach((room) => {
          initialMessages[room.id] = (data.roomMessages?.[room.id] || []).sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
        setMessages(initialMessages);
        setUsers(data.users || []); // Set users from initial data
        setError(null);
      } else {
        setError(data.error || 'Failed to load initial chat data.');
      }
      setIsLoading(false);
    });

    newSocket.on('newMessage', (newMessage: BackendMessage) => {
      console.log('Received newMessage:', newMessage);
      if (socketInstanceRef.current !== newSocket) return;

      setMessages((prevMessages) => {
        const roomMessages = prevMessages[newMessage.roomId] || [];
        if (roomMessages.some((msg) => msg.id === newMessage.id)) {
          return prevMessages;
        }
        const updatedRoomMessages = [...roomMessages, newMessage].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return {
          ...prevMessages,
          [newMessage.roomId]: updatedRoomMessages,
        };
      });
    });

    newSocket.on('connect_error', async (err) => {
      console.error('WebSocket connection error:', err.message);
      if (socketInstanceRef.current !== newSocket) return;

      setIsConnected(false);

      const authErrorMessages = [
        'Invalid or expired token',
        'Authentication failed',
        'jwt expired',
        'Unauthorized',
        'Missing authentication token',
        'Invalid token payload',
        'No authentication token provided',
      ];
      const isAuthError = authErrorMessages.some((msg) =>
        err.message.includes(msg)
      );

      if (isAuthError && !isRefreshingTokenRef.current) {
        console.log('Auth error detected, attempting token refresh...');
        isRefreshingTokenRef.current = true;
        setError('Authentication expired, attempting to refresh...');
        setIsLoading(true);

        const refreshed = await refreshToken();

        if (refreshed) {
          console.log(
            'Token refresh successful. Retrying WebSocket connection...'
          );
          currentToken = localStorage.getItem('token');
          if (currentToken && socketInstanceRef.current === newSocket) {
            newSocket.auth = { token: currentToken };
            newSocket.connect();
          } else {
            console.error(
              'Failed to get new token or socket instance changed after refresh. Logging out.'
            );
            handleLogout();
            setError('Session expired. Please log in again.');
            setIsLoading(false);
          }
        } else {
          console.error('Token refresh failed.');
          if (!localStorage.getItem('refreshToken')) {
            setError('Session expired. Please log in again.');
          } else {
            setError(
              'Failed to refresh session. Please try again later or log in again.'
            );
          }
          setIsLoading(false);
          isRefreshingTokenRef.current = false;
          if (socketInstanceRef.current === newSocket) {
            socketInstanceRef.current.disconnect();
            socketInstanceRef.current = null;
          }
          setSocket(null);
        }
      } else if (isAuthError && isRefreshingTokenRef.current) {
        console.log(
          'Refresh already in progress, ignoring subsequent auth error.'
        );
      } else {
        console.error('Non-authentication connection error.');
        setError(`Connection failed: ${err.message}`);
        setIsLoading(false);
        isRefreshingTokenRef.current = false;
        if (socketInstanceRef.current === newSocket) {
          socketInstanceRef.current.disconnect();
          socketInstanceRef.current = null;
        }
        setSocket(null);
      }
    });

    newSocket.on('error', (errorData: { message: string } | string) => {
      const errorMessage =
        typeof errorData === 'string' ? errorData : errorData.message;
      console.error('WebSocket post-connection error:', errorMessage);
      if (socketInstanceRef.current !== newSocket) return;

      const postConnectAuthErrors = [
        'Invalid or expired token',
        'Unauthorized',
      ];
      if (postConnectAuthErrors.some((msg) => errorMessage.includes(msg))) {
        console.error('Post-connection auth error detected. Logging out.');
        handleLogout();
        setError('Session expired. Please log in again.');
        setIsConnected(false);
        setSocket(null);
        if (socketInstanceRef.current === newSocket) {
          socketInstanceRef.current.disconnect();
          socketInstanceRef.current = null;
        }
      } else {
        setError(`Chat error: ${errorMessage}`);
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${reason}`);
      if (socketInstanceRef.current === newSocket) {
        if (!error?.includes('Session expired')) {
          setError(`Disconnected: ${reason}.`);
        }
        setIsConnected(false);
        setSocket(null);
        socketInstanceRef.current = null;
        isRefreshingTokenRef.current = false;
      }
    });

    return () => {
      console.log('Running WebSocketProvider effect cleanup');
      if (socketInstanceRef.current === newSocket) {
        console.log('Disconnecting WebSocket in cleanup for ID:', newSocket.id);
        socketInstanceRef.current.disconnect();
        socketInstanceRef.current = null;
      } else {
        console.log(
          'Skipping disconnect in cleanup (socket instance mismatch or already null)'
        );
      }
      isRefreshingTokenRef.current = false;
    };
  }, []);

  const sendMessage = useCallback(
    (roomId: number, content: string) => {
      if (socket && isConnected && content.trim()) {
        console.log(`Emitting sendMessage for room ${roomId}`);
        const payload = {
          roomId,
          content,
          createdAt: new Date().toISOString(),
        };
        socket.emit(
          'sendMessage',
          payload,
          (response: {
            success: boolean;
            error?: string;
            message?: BackendMessage;
          }) => {
            if (response?.success && response.message) {
              console.log(
                'Message sent successfully and acknowledged:',
                response.message
              );
            } else if (!response?.success) {
              console.error(
                'Failed to send message:',
                response?.error || 'Unknown error'
              );
              const sendError = `Failed to send message: ${
                response?.error || 'Unknown error'
              }`;
              setError(sendError);
              if (
                response?.error?.includes('Unauthorized') ||
                response?.error?.includes('expired')
              ) {
                console.error(
                  'Auth error on send. Disconnecting to trigger refresh.'
                );
                socket.disconnect();
              }
            }
          }
        );
      } else {
        console.warn(
          'Cannot send message: Socket not connected or message empty.'
        );
        if (!isConnected) setError('Cannot send message: Not connected.');
      }
    },
    [socket, isConnected]
  );

  const getMessagesForRoom = useCallback(
    (roomId: number): BackendMessage[] => {
      return messages[roomId] || [];
    },
    [messages]
  );

  const requestUsers = useCallback(() => {
    if (socket && isConnected) {
      console.log('Requesting user list...');
      socket.emit(
        'getUsers',
        {},
        (response: {
          success: boolean;
          users?: SimpleUser[];
          error?: string;
        }) => {
          if (response.success && response.users) {
            console.log('Received user list:', response.users);
            setUsers(response.users);
          } else {
            console.error('Failed to get users:', response.error);
            setError(
              `Failed to get users: ${response.error || 'Unknown error'}`
            );
          }
        }
      );
    } else {
      console.warn('Cannot request users: Socket not connected.');
    }
  }, [socket, isConnected]);

  const value: WebSocketContextType = {
    socket,
    isConnected,
    isLoading,
    error,
    rooms,
    messages,
    users,
    sendMessage,
    getMessagesForRoom,
    requestUsers,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
