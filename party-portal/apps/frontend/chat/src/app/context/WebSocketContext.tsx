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
import { handleLogout, refreshToken } from '../../utils/apiFetch';
import { BackendRoom } from '../../types/BackendRoom';
import { BackendMessage } from '../../types/BackendMessage';
import { InitialData } from '../../types/InitialData';
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

  const socketInstanceRef = useRef<Socket | null>(null);
  const isRefreshingTokenRef = useRef(false);

  // --- Connection Effect (Similar to your original ChatList logic) ---
  useEffect(() => {
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
      // Decide if automatic logout is desired here
      // handleLogout();
      return; // Don't attempt connection without a token
    }

    const wsUrl =
      import.meta.env.VITE_CHAT_WEBSOCKET_URL || 'ws://127.0.0.1:8080/chat';
    console.log('Attempting to connect to WebSocket:', wsUrl);

    setIsLoading(true);
    setError(null);

    const newSocket = io(wsUrl, {
      auth: { token: currentToken },
      transports: ['websocket'],
      reconnection: false, // Manage manually with refresh logic
    });

    socketInstanceRef.current = newSocket;

    // --- Event Handlers ---
    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      if (socketInstanceRef.current === newSocket) {
        setSocket(newSocket);
        setIsConnected(true);
        setError(null);
        isRefreshingTokenRef.current = false; // Reset refresh flag
      }
    });

    newSocket.on('initialData', (data: InitialData) => {
      console.log('Received initialData:', data);
      if (socketInstanceRef.current !== newSocket) return;

      if (data.success) {
        setRooms(data.rooms || []); // Ensure rooms is an array
        // Initialize messages state correctly from initialData
        const initialMessages: Record<number, BackendMessage[]> = {};
        (data.rooms || []).forEach((room) => {
          // Sort messages within each room by date ascending
          initialMessages[room.id] = (data.roomMessages?.[room.id] || []).sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
        setMessages(initialMessages);
        setError(null);
      } else {
        setError(data.error || 'Failed to load initial chat data.');
      }
      setIsLoading(false);
    });

    // --- Handle incoming new messages ---
    newSocket.on('newMessage', (newMessage: BackendMessage) => {
      console.log('Received newMessage:', newMessage);
      if (socketInstanceRef.current !== newSocket) return;

      setMessages((prevMessages) => {
        const roomMessages = prevMessages[newMessage.roomId] || [];
        // Avoid adding duplicates if the message somehow arrives twice
        if (roomMessages.some((msg) => msg.id === newMessage.id)) {
          return prevMessages;
        }
        // Add the new message and re-sort (or just append if always latest)
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
    // --- End Handle incoming new messages ---

    newSocket.on('connect_error', async (err) => {
      console.error('WebSocket connection error:', err.message);
      if (socketInstanceRef.current !== newSocket) return;

      setIsConnected(false); // Ensure connection status is false

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
        setIsLoading(true); // Show loading during refresh attempt

        const refreshed = await refreshToken();

        if (refreshed) {
          console.log(
            'Token refresh successful. Retrying WebSocket connection...'
          );
          currentToken = localStorage.getItem('token');
          if (currentToken && socketInstanceRef.current === newSocket) {
            newSocket.auth = { token: currentToken };
            newSocket.connect(); // Retry connection
            // Don't reset loading/error here, let 'connect' or next 'connect_error' handle it
          } else {
            console.error(
              'Failed to get new token or socket instance changed after refresh. Logging out.'
            );
            handleLogout(); // Logout if refresh succeeded but something else went wrong
            setError('Session expired. Please log in again.');
            setIsLoading(false); // Stop loading on definitive failure
          }
        } else {
          console.error('Token refresh failed.');
          // refreshToken() handles logout internally if refresh token is invalid
          if (!localStorage.getItem('refreshToken')) {
            setError('Session expired. Please log in again.');
          } else {
            // Refresh failed for other reasons (network, server error)
            setError(
              'Failed to refresh session. Please try again later or log in again.'
            );
          }
          setIsLoading(false); // Stop loading on definitive failure
          isRefreshingTokenRef.current = false; // Reset flag here after failure
          // Clean up this specific socket instance if it still exists
          if (socketInstanceRef.current === newSocket) {
            socketInstanceRef.current.disconnect();
            socketInstanceRef.current = null;
          }
          setSocket(null); // Clear socket state
        }
      } else if (isAuthError && isRefreshingTokenRef.current) {
        console.log(
          'Refresh already in progress, ignoring subsequent auth error.'
        );
        // Keep loading state true while refresh is in progress
      } else {
        // --- Non-Auth Error Handling ---
        console.error('Non-authentication connection error.');
        setError(`Connection failed: ${err.message}`);
        setIsLoading(false); // Stop loading on connection failure
        isRefreshingTokenRef.current = false; // Reset flag if it was somehow set
        // Clean up this specific socket instance
        if (socketInstanceRef.current === newSocket) {
          socketInstanceRef.current.disconnect();
          socketInstanceRef.current = null;
        }
        setSocket(null); // Clear socket state
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
        setSocket(null); // Ensure socket state is cleared
        if (socketInstanceRef.current === newSocket) {
          socketInstanceRef.current.disconnect();
          socketInstanceRef.current = null;
        }
      } else {
        setError(`Chat error: ${errorMessage}`);
        // Consider if disconnect is needed for other errors
        // Maybe disconnect to allow connect_error handler to manage state?
        // newSocket.disconnect();
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${reason}`);
      if (socketInstanceRef.current === newSocket) {
        // Avoid showing reconnecting message if logout was triggered
        if (!error?.includes('Session expired')) {
          setError(`Disconnected: ${reason}.`);
        }
        // Keep isLoading potentially true if you plan automatic reconnect attempts
        // setIsLoading(false);
        setIsConnected(false);
        setSocket(null);
        socketInstanceRef.current = null;
        isRefreshingTokenRef.current = false; // Reset flag on disconnect
      }
    });

    // --- Cleanup Function ---
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
      isRefreshingTokenRef.current = false; // Ensure flag is reset on unmount
    };
  }, []); // Empty dependency array ensures this runs once on mount

  // --- Send Message Function ---
  const sendMessage = useCallback(
    (roomId: number, content: string) => {
      if (socket && isConnected && content.trim()) {
        console.log(`Emitting sendMessage for room ${roomId}`);
        // Define the payload structure your backend expects
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
            // Optional: Handle acknowledgement from server
            if (response?.success && response.message) {
              console.log(
                'Message sent successfully and acknowledged:',
                response.message
              );
              // If server doesn't broadcast back to sender, add message here:
              // setMessages((prevMessages) => { ... add response.message ... });
            } else if (!response?.success) {
              console.error(
                'Failed to send message:',
                response?.error || 'Unknown error'
              );
              const sendError = `Failed to send message: ${
                response?.error || 'Unknown error'
              }`;
              setError(sendError);
              // Handle potential auth error on send
              if (
                response?.error?.includes('Unauthorized') ||
                response?.error?.includes('expired')
              ) {
                console.error(
                  'Auth error on send. Disconnecting to trigger refresh.'
                );
                // Disconnect to let the connect_error handler manage refresh/state
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
    [socket, isConnected] // Dependencies for useCallback
  );

  // --- Get Messages Function ---
  // Returns messages already sorted chronologically
  const getMessagesForRoom = useCallback(
    (roomId: number): BackendMessage[] => {
      return messages[roomId] || [];
    },
    [messages] // Dependency: messages state
  );

  // --- Context Value ---
  const value: WebSocketContextType = {
    socket,
    isConnected,
    isLoading,
    error,
    rooms,
    messages, // Provide the whole messages object
    sendMessage,
    getMessagesForRoom,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
