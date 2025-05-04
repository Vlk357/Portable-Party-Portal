/// <reference types="vite/client" />

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
  useMemo,
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
import { jwtDecode } from 'jwt-decode';
import { DecodedToken } from '../../types/DecodedToken';
import { RawBackendMessage } from '../../types/RawBackendMessage';

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

  // --- State to map tempId to real messageId upon ack ---
  const [pendingAckMap, setPendingAckMap] = useState<Map<number, number>>(
    new Map()
  );
  // --- Callback ref to notify ChatRoom when a self-sent message is confirmed via broadcast ---
  const onSelfMessageConfirmedRef = useRef<(tempId: number) => void>(() => {
    /* intentionally empty */
  });

  const socketInstanceRef = useRef<Socket | null>(null);
  const isRefreshingTokenRef = useRef(false);

  // --- Get Current User ID ---
  const currentUserId = useMemo(() => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const userId = parseInt(decoded.sub, 10);
      return isNaN(userId) ? null : userId;
    } catch (error) {
      console.error('WebSocketContext: Failed to decode token:', error);
      return null;
    }
  }, []); // Calculate once

  // --- Function for ChatRoom to register its confirmation handler ---
  const setOnSelfMessageConfirmedHandler = useCallback(
    (handler: (tempId: number) => void) => {
      onSelfMessageConfirmedRef.current = handler;
    },
    []
  );

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
      // Use InitialChatData
      console.log('Received initialData:', data);
      if (socketInstanceRef.current !== newSocket) return;

      // Process messages: Convert date strings to Date objects
      const processedMessages: Record<number, BackendMessage[]> = {};
      for (const roomIdStr in data.roomMessages) {
        const roomId = parseInt(roomIdStr, 10);
        if (!isNaN(roomId)) {
          processedMessages[roomId] = data.roomMessages[roomId]
            .map(processRawMessage) // Use existing processing function
            .filter((msg): msg is BackendMessage => msg !== null) // Type guard
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        }
      }
      setMessages(processedMessages);
      setRooms(data.rooms || []);
      setUsers(data.users || []);
      setIsLoading(false); // Ensure loading is set to false
    });

    newSocket.on('newMessage', (incomingMessage: RawBackendMessage) => {
      // Use RawBackendMessage
      console.log('Received newMessage (raw):', incomingMessage);
      if (socketInstanceRef.current !== newSocket) return;

      const processedMessage = processRawMessage(incomingMessage); // Use existing processing function
      if (!processedMessage) {
        console.warn('newMessage: Skipping message due to processing failure.');
        return;
      }

      // --- Check if it's a self-sent message that we have an ack for ---
      if (processedMessage.user_id === currentUserId) {
        const realId = processedMessage.id;
        let foundTempId: number | null = null;

        // Find the tempId associated with this realId in our map
        for (const [tempId, messageId] of pendingAckMap.entries()) {
          if (messageId === realId) {
            foundTempId = tempId;
            break;
          }
        }

        if (foundTempId !== null) {
          console.log(
            `newMessage: Confirmed self-sent message. Real ID: ${realId}, Temp ID: ${foundTempId}`
          );
          // Call the callback registered by ChatRoom to remove the pending state
          onSelfMessageConfirmedRef.current(foundTempId);
          // Clean up the map entry
          setPendingAckMap((prev) => {
            const newMap = new Map(prev);
            newMap.delete(foundTempId as number); // Type assertion safe here
            return newMap;
          });
        } else {
          console.log(
            `newMessage: Received self-sent message ID ${realId} but no matching pending ack found (might be from another session/tab).`
          );
        }
      }
      // --- End self-sent message check ---

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
  }, [currentUserId, pendingAckMap, error, setOnSelfMessageConfirmedHandler]); // Added error dependency below

  const sendMessage = useCallback(
    (
      roomId: number,
      content: string,
      tempId: number,
      onConfirm: (tempId: number, messageId: number) => void, // Accept success callback
      onError: (tempId: number, error: string) => void // Accept error callback
    ) => {
      if (socket && isConnected && content.trim()) {
        console.log(
          `Emitting sendMessage for room ${roomId} (tempId: ${tempId})`
        );
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
            messageId?: number; // Expect messageId now
          }) => {
            if (response?.success && typeof response.messageId === 'number') {
              const realMessageId = response.messageId;
              console.log(
                `Message (tempId: ${tempId}) ack received successfully. Real ID: ${realMessageId}`
              );
              // Store the mapping for the newMessage handler to find later
              setPendingAckMap((prev) =>
                new Map(prev).set(tempId, realMessageId)
              );
              // Notify the caller (ChatRoom) of success and provide the real ID
              onConfirm(tempId, realMessageId);
              // --- DO NOT add message to state here ---
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
            } else {
              // Handle case where ack is success but messageId is missing/invalid
              console.error(
                `Message (tempId: ${tempId}) ack success but invalid messageId received:`,
                response
              );
              onError(tempId, 'Server acknowledgement missing message ID.');
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
    setOnSelfMessageConfirmedHandler,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
