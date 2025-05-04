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
import {
  handleLogout,
  refreshToken,
  getAuthTokens,
} from '../../utils/apiFetch';
import { BackendRoom } from '../../types/BackendRoom';
import { BackendMessage } from '../../types/BackendMessage';
import { InitialData } from '../../types/InitialData';
import type { SimpleUser } from '../../types/SimpleUser';
import { WebSocketContextType } from '../../types/WebSocketContextType';
import { processRawMessage } from '../../utils/messageProcessor';

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

    newSocket.on('initialData', (data: InitialData | any) => {
      console.log('Received initialData (raw):', data);
      if (socketInstanceRef.current !== newSocket) return;

      if (data && typeof data === 'object' && data.success) {
        setRooms(data.rooms || []);
        setUsers(data.users || []);

        const processedMessages: Record<number, BackendMessage[]> = {};

        (data.rooms || []).forEach((room: BackendRoom) => {
          const roomMessagesRaw = data.roomMessages?.[room.id];
          if (Array.isArray(roomMessagesRaw)) {
            console.log(
              `initialData: Processing ${roomMessagesRaw.length} messages for room ${room.id}`
            );
            // Use the helper function in map
            processedMessages[room.id] = roomMessagesRaw
              .map(processRawMessage) // Pass the raw message to the helper
              .filter((msg): msg is BackendMessage => msg !== null) // Filter out nulls (failed processing)
              .sort((a, b) => a.created_at.getTime() - b.created_at.getTime()); // Sort by Date object time
            console.log(
              `initialData: Successfully processed ${
                processedMessages[room.id].length
              } messages for room ${room.id}`
            );
          } else {
            console.log(`initialData: No messages found for room ${room.id}.`);
            processedMessages[room.id] = [];
          }
        });

        console.log(
          'initialData: Setting processed messages state:',
          processedMessages
        );
        setMessages(processedMessages);
        setError(null);
      } else if (data && typeof data === 'object' && !data.success) {
        console.error(
          'initialData event received but success flag is false. Error:',
          data.error
        );
        setError(
          data.error || 'Failed to load initial chat data (server error)'
        );
      } else {
        console.error(
          'Received invalid or non-object data on initialData event:',
          data
        );
        setError('Received invalid initial data from server.');
      }
      setIsLoading(false);
    });

    newSocket.on('newMessage', (incomingMessage: any) => {
      console.log('Received newMessage (raw):', incomingMessage); // Log raw data
      if (socketInstanceRef.current !== newSocket) return;

      // Process the raw incoming message using the helper
      const processedMessage = processRawMessage(incomingMessage);

      // Check if processing was successful
      if (!processedMessage) {
        console.warn('newMessage: Skipping message due to processing failure.');
        return; // Don't update state if processing failed
      }

      // Use the processed message (with Date objects) to update state
      setMessages((prevMessages) => {
        // Use the correct room ID property from the processed message
        const roomMessages = prevMessages[processedMessage.chat_room_id] || [];
        // Check for duplicates using the processed message ID
        if (roomMessages.some((msg) => msg.id === processedMessage.id)) {
          console.log(
            `newMessage: Duplicate message ID ${processedMessage.id} received, skipping.`
          );
          return prevMessages;
        }
        // Add the processed message and sort using the Date object directly
        const updatedRoomMessages = [...roomMessages, processedMessage].sort(
          (a, b) => a.created_at.getTime() - b.created_at.getTime() // Use Date object directly
        );
        console.log(
          `newMessage: Added message ${processedMessage.id} to room ${processedMessage.chat_room_id}`
        );
        return {
          ...prevMessages,
          // Use the correct room ID property from the processed message
          [processedMessage.chat_room_id]: updatedRoomMessages,
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

    newSocket.on('error', async (errorData: { message: string } | string) => {
      // Make handler async
      const errorMessage =
        typeof errorData === 'string' ? errorData : errorData.message;
      console.error('WebSocket post-connection error:', errorMessage);

      // Check if this error is for the current socket instance
      if (socketInstanceRef.current !== newSocket) {
        console.log(
          'Ignoring post-connection error for non-current socket instance.'
        );
        return;
      }

      const postConnectAuthErrors = [
        'Invalid or expired token',
        'Unauthorized',
        // Add other specific error messages that indicate an auth issue after connection
      ];

      const isAuthError = postConnectAuthErrors.some((msg) =>
        errorMessage.includes(msg)
      );

      if (isAuthError && !isRefreshingTokenRef.current) {
        console.log(
          'Post-connection auth error detected, attempting token refresh...'
        );
        isRefreshingTokenRef.current = true;
        setError('Session issue detected, attempting to refresh...');
        setIsLoading(true); // Indicate loading during refresh

        const refreshed = await refreshToken();

        if (refreshed) {
          console.log('Token refresh successful after post-connection error.');
          const currentToken = localStorage.getItem('token');
          if (currentToken && socketInstanceRef.current === newSocket) {
            // Update auth details for subsequent operations
            socketInstanceRef.current.auth = { token: currentToken };
            console.log('Socket auth updated.');
            // Check if the socket is still connected. If not, attempt reconnect.
            if (!socketInstanceRef.current.connected) {
              console.log(
                'Socket disconnected after error, attempting reconnect...'
              );
              socketInstanceRef.current.connect();
            } else {
              // If still connected, clear the error potentially caused by the auth issue
              setError(null);
            }
          } else {
            console.error(
              'Failed to get new token or socket instance changed after refresh. Logging out.'
            );
            handleLogout();
            setError('Session expired. Please log in again.');
            setIsConnected(false);
            setSocket(null);
            if (socketInstanceRef.current === newSocket) {
              socketInstanceRef.current.disconnect();
              socketInstanceRef.current = null;
            }
          }
        } else {
          // Refresh failed, proceed with logout
          console.error(
            'Token refresh failed after post-connection error. Logging out.'
          );
          handleLogout();
          setError('Session expired. Please log in again.');
          setIsConnected(false);
          setSocket(null);
          if (socketInstanceRef.current === newSocket) {
            socketInstanceRef.current.disconnect();
            socketInstanceRef.current = null;
          }
        }
        // Reset flags after handling
        setIsLoading(false);
        isRefreshingTokenRef.current = false;
      } else if (isAuthError && isRefreshingTokenRef.current) {
        console.log(
          'Refresh already in progress, ignoring subsequent post-connection auth error.'
        );
      } else {
        // Handle non-auth errors
        setError(`Chat error: ${errorMessage}`);
        // Consider if disconnect is needed for non-auth errors too
        // Example: newSocket.disconnect();
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
    (
      roomId: number,
      content: string,
      tempId: string, // Accept tempId
      onConfirm: (tempId: string, confirmedMessage: BackendMessage) => void, // Accept success callback
      onError: (tempId: string, error: string) => void // Accept error callback
    ) => {
      if (socket && isConnected && content.trim()) {
        console.log(
          `Emitting sendMessage for room ${roomId} (tempId: ${tempId})`
        );
        const payload = {
          roomId,
          content,
          clientCreatedAt: new Date().toISOString(),
        };
        socket.emit(
          'sendMessage',
          payload,
          (response: {
            success: boolean;
            error?: string;
            message?: any; // Expect raw message from server ack
          }) => {
            if (response?.success && response.message) {
              // Process the raw acknowledged message
              const confirmedMessage = processRawMessage(response.message);
              if (confirmedMessage) {
                console.log(
                  `Message (tempId: ${tempId}) sent successfully and acknowledged:`,
                  confirmedMessage
                );
                onConfirm(tempId, confirmedMessage); // Use the callback on success
              } else {
                console.error(
                  `Message (tempId: ${tempId}) acknowledged but failed processing:`,
                  response.message
                );
                onError(tempId, 'Failed to process server acknowledgement.');
              }
            } else if (!response?.success) {
              const errorMsg = response?.error || 'Unknown error';
              console.error(
                `Failed to send message (tempId: ${tempId}):`,
                errorMsg
              );
              onError(tempId, errorMsg); // Use the error callback
              // Existing global error handling (optional, maybe remove if handled per message)
              // setError(`Failed to send message: ${errorMsg}`);
              // if (errorMsg.includes('Unauthorized') || errorMsg.includes('expired')) {
              //   console.error('Auth error on send. Disconnecting to trigger refresh.');
              //   socket.disconnect();
              // }
            }
          }
        );
      } else {
        console.warn(
          `Cannot send message (tempId: ${tempId}): Socket not connected or message empty.`
        );
        const errorMsg = !isConnected ? 'Not connected' : 'Message empty';
        onError(tempId, `Cannot send message: ${errorMsg}`); // Trigger error callback immediately if cannot send
        // if (!isConnected) setError('Cannot send message: Not connected.');
      }
    },
    [socket, isConnected] // Removed setError dependency if handling per message
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
