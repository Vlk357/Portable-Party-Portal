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
  const hasProcessedInitialDataRef = useRef(false); // Flag for initialData

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
    const { token: initialToken } = getAuthTokens(); // Get token at the start of the effect

    if (!initialToken) {
      console.log('useEffect: No token found, skipping WebSocket connection.');
      setError('Authentication token not found.');
      setIsLoading(false);
      return;
    }

    // If currentUserId changes, we definitely need a new socket with new auth.
    // The cleanup from the PREVIOUS effect run (due to currentUserId change)
    // should have disconnected the old socket.

    console.log(
      'WebSocketProvider effect: Starting setup. currentUserId:',
      currentUserId
    );
    setIsLoading(true);
    setError(null);
    hasProcessedInitialDataRef.current = false;

    // Ensure any previous socket instance managed by this ref is fully disconnected
    // This is a bit aggressive but helps ensure a clean slate if the ref wasn't cleared properly.
    if (socketInstanceRef.current) {
      console.log(
        'useEffect: Disconnecting existing socketInstanceRef before creating new one:',
        socketInstanceRef.current.id
      );
      socketInstanceRef.current.disconnect();
      socketInstanceRef.current.offAny(); // Remove all listeners
      socketInstanceRef.current = null;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/chat`;
    console.log(
      'Attempting to connect to WebSocket:',
      wsUrl,
      'with token from effect start.'
    );

    const newSocket = io(wsUrl, {
      auth: { token: initialToken }, // Use token captured at effect start
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    console.log('Created new socket instance:', newSocket.id);
    socketInstanceRef.current = newSocket; // Assign the new socket to the ref
    setSocket(newSocket); // Update state for consumers

    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      if (socketInstanceRef.current === newSocket) {
        setIsConnected(true);
        setError(null);
        setIsLoading(false);
        isRefreshingTokenRef.current = false;
      } else {
        console.warn(
          'connect event for a stale socket instance:',
          newSocket.id,
          'current is',
          socketInstanceRef.current?.id
        );
        newSocket.disconnect(); // Disconnect this stale socket
      }
    });

    newSocket.on('initialData', (data: InitialData) => {
      console.log('Received initialData:', data);
      if (
        socketInstanceRef.current !== newSocket ||
        hasProcessedInitialDataRef.current
      ) {
        if (hasProcessedInitialDataRef.current) {
          console.log(
            'initialData: Already processed for this connection, skipping.'
          );
        }
        return;
      }
      hasProcessedInitialDataRef.current = true; // Set flag after first successful processing

      const newProcessedMessages: Record<number, BackendMessage[]> = {};
      for (const roomIdStr in data.roomMessages) {
        const roomId = parseInt(roomIdStr, 10);
        if (!isNaN(roomId)) {
          newProcessedMessages[roomId] = data.roomMessages[roomId]
            .map(processRawMessage)
            .filter((msg): msg is BackendMessage => msg !== null)
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        }
      }

      // Merge initial data with existing messages if any (though typically messages would be empty here)
      // This provides a safety net if initialData were to be emitted later unexpectedly.
      // A more robust merge would be needed if initialData could truly arrive mid-session
      // and potentially overlap with messages loaded via requestOlderMessages.
      // For now, a simple overwrite if messages state is empty, otherwise merge.
      setMessages((prevMessages) => {
        // If prevMessages is empty, just use the newProcessedMessages
        if (Object.keys(prevMessages).length === 0) {
          console.log('initialData: Setting messages from initial load.');
          return newProcessedMessages;
        }

        // More complex merge: only add messages from initialData if they don't already exist
        // This is a basic merge. A more sophisticated one might be needed depending on backend behavior.
        console.log(
          'initialData: Merging with existing messages (should be rare).'
        );
        const mergedMessages = { ...prevMessages };
        for (const roomIdStr in newProcessedMessages) {
          const roomId = parseInt(roomIdStr, 10);
          const existingRoomMessages = mergedMessages[roomId] || [];
          const initialRoomMessages = newProcessedMessages[roomId] || [];

          const uniqueInitialMessages = initialRoomMessages.filter(
            (initMsg) =>
              !existingRoomMessages.some(
                (existMsg) => existMsg.id === initMsg.id
              )
          );

          if (uniqueInitialMessages.length > 0) {
            mergedMessages[roomId] = [
              ...existingRoomMessages,
              ...uniqueInitialMessages,
            ].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
          }
        }
        return mergedMessages;
      });

      setRooms(data.rooms || []);
      setUsers(data.users || []);
      setIsLoading(false);
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
      console.error(`connect_error for socket ${newSocket.id}:`, err.message);
      if (socketInstanceRef.current !== newSocket) {
        console.warn(
          'connect_error: Stale event for socket',
          newSocket.id,
          'current is',
          socketInstanceRef.current?.id
        );
        return;
      }

      setIsConnected(false); // Definitely not connected

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

      if (isAuthError) {
        if (!isRefreshingTokenRef.current) {
          isRefreshingTokenRef.current = true;
          setError('Session issue. Attempting to refresh...'); // Neutral message
          setIsLoading(true);
          const refreshed = await refreshToken();
          isRefreshingTokenRef.current = false; // Reset after attempt

          if (refreshed) {
            const newToken = localStorage.getItem('token');
            if (newToken && socketInstanceRef.current === newSocket) {
              console.log(
                'Token refreshed, updating auth and retrying connect for socket:',
                newSocket.id
              );
              socketInstanceRef.current.auth = { token: newToken };
              socketInstanceRef.current.connect(); // Retry with new auth on the SAME instance
              setError('Re-establishing connection...'); // Optimistic message
              // isLoading remains true as we are connecting
            } else {
              console.error(
                'Token refresh reported success, but new token is missing or socket instance changed. Logging out.'
              );
              setError('Error applying refreshed session. Please log in again.'); // More specific
              setIsLoading(false);
              if (socketInstanceRef.current === newSocket)
                socketInstanceRef.current.disconnect();
              handleLogout(); // Treat as unrecoverable for this specific path
            }
          } else {
            // Token refresh failed
            console.error('Token refresh failed for socket:', newSocket.id);
            if (localStorage.getItem('refreshToken')) {
              setError('Failed to refresh session. Please check your connection or try refreshing the page.');
              // Do not logout yet. User might recover by other means or another component might trigger refresh.
            } else {
              setError('Session expired. Please log in again.'); // No refresh token, so it's final
              handleLogout(); // Only logout if no refresh token means it's truly unrecoverable by this mechanism
            }
            setIsLoading(false);
            if (socketInstanceRef.current === newSocket)
              socketInstanceRef.current.disconnect(); // Stop this instance
          }
        } else {
          console.log(
            'connect_error: Auth error, but refresh already in progress for socket:',
            newSocket.id
          );
        }
      } else {
        // Non-authentication connection error
        console.log(
          `connect_error: Non-auth error for socket ${newSocket.id}: ${err.message}. Socket.IO will attempt to reconnect.`
        );
        setError(`Connection error: ${err.message}. Retrying...`);
        setIsLoading(true); // Indicate that connection attempts are ongoing
      }
    });

    newSocket.on('error', async (errorData: { message: string } | string) => {
      const errorMessage =
        typeof errorData === 'string' ? errorData : errorData.message;
      console.error('WebSocket post-connection error:', errorMessage);

      if (socketInstanceRef.current !== newSocket) {
        console.log(
          'Ignoring post-connection error for non-current socket instance.'
        );
        return;
      }

      const postConnectAuthErrors = [
        'Invalid or expired token',
        'Unauthorized',
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
        setIsLoading(true); 

        const refreshed = await refreshToken();

        if (refreshed) {
          console.log('Token refresh successful after post-connection error.');
          const currentToken = localStorage.getItem('token');
          if (currentToken && socketInstanceRef.current === newSocket) {
            socketInstanceRef.current.auth = { token: currentToken };
            console.log('Socket auth updated.');
            if (!socketInstanceRef.current.connected) {
              console.log(
                'Socket disconnected after error, attempting reconnect...'
              );
              socketInstanceRef.current.connect();
              setError('Re-establishing connection...');
            } else {
              setError(null); // Clear error if already connected and refresh was preemptive
            }
          } else {
            console.error(
              'Failed to get new token or socket instance changed after refresh (post-connection). Logging out.'
            );
            setError('Error applying refreshed session. Please log in again.');
            if (socketInstanceRef.current === newSocket) {
              socketInstanceRef.current.disconnect();
            }
            handleLogout();
          }
        } else {
          // Refresh failed
          console.error(
            'Token refresh failed after post-connection error.'
          );
          if (localStorage.getItem('refreshToken')) {
            setError('Failed to refresh session. Please check your connection or try refreshing the page.');
            // The connection might have been severed by the server due to the error.
            // Do not logout.
          } else {
            setError('Session expired. Please log in again.');
            if (socketInstanceRef.current === newSocket) {
              socketInstanceRef.current.disconnect();
            }
            handleLogout();
          }
        }
        setIsLoading(false); // Reset loading after attempt
        isRefreshingTokenRef.current = false;
      } else if (isAuthError && isRefreshingTokenRef.current) {
        console.log(
          'Refresh already in progress, ignoring subsequent post-connection auth error.'
        );
      } else {
        // Handle non-auth errors
        setError(`Chat error: ${errorMessage}`);
      }
    });

    // Add Socket.IO's own reconnection event listeners for better UI feedback
    newSocket.on('reconnect_attempt', (attempt) => {
      console.log(
        `Socket ${newSocket.id} attempting to reconnect: attempt ${attempt}`
      );
      if (socketInstanceRef.current === newSocket) {
        setError(`Connection lost. Reconnecting (attempt ${attempt})...`);
        setIsLoading(true);
        setIsConnected(false);
      }
    });

    newSocket.on('reconnect_failed', () => {
      console.error(`Socket ${newSocket.id} failed all reconnection attempts.`);
      if (socketInstanceRef.current === newSocket) {
        setError(
          'Failed to reconnect to the server. Please check your connection or try refreshing the page.'
        );
        setIsLoading(false);
        setIsConnected(false);
        // At this point, this socket instance has given up.
        // The main useEffect might eventually run again if currentUserId changes,
        // or the user navigates away and back.
      }
    });

    newSocket.on('reconnect_error', (err) => {
      console.error(
        `Socket ${newSocket.id} error during reconnection attempt:`,
        err.message
      );
      if (socketInstanceRef.current === newSocket) {
        setError(`Reconnection error: ${err.message}. Still trying...`);
        setIsLoading(true);
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(
        `Socket ${newSocket.id} successfully reconnected on attempt ${attemptNumber}!`
      );
      if (socketInstanceRef.current === newSocket) {
        // The 'connect' event should also fire, which handles setting isConnected, error, isLoading.
        // setError(null);
        // setIsLoading(false);
        // setIsConnected(true);
        console.log(
          'Reconnect event implies a connect event will follow or has just fired.'
        );
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log(
        `WebSocket disconnected: ${reason} for socket: ${newSocket.id}`
      );
      if (socketInstanceRef.current === newSocket) {
        setIsConnected(false);
        if (
          reason !== 'io client disconnect' &&
          reason !== 'io server disconnect'
        ) {
          if (
            !error ||
            (!error.includes('Session expired') &&
              !error.includes('Authentication'))
          ) {
            setError(`Disconnected: ${reason}.`);
          }
        }
        // Don't nullify socketInstanceRef.current here if Socket.IO is meant to be reconnecting this instance.
        // Only nullify if the disconnect is terminal for this instance (e.g., reconnect_failed or explicit logout).
      } else {
        console.warn(
          'disconnect event for a stale socket instance:',
          newSocket.id
        );
      }
    });

    return () => {
      console.log(
        'Running WebSocketProvider effect cleanup for socket created in this effect run:',
        newSocket.id
      );
      newSocket.offAny();
      newSocket.disconnect();

      // Only clear the ref if it's still pointing to the socket this cleanup is for.
      // This prevents a delayed cleanup from nullifying a newer, active socket.
      if (socketInstanceRef.current === newSocket) {
        console.log('Cleanup: Clearing socketInstanceRef for:', newSocket.id);
        socketInstanceRef.current = null;
        // setSocket(null); // Let the next effect run set the new socket
      }
      isRefreshingTokenRef.current = false;
    };
  }, [currentUserId, setOnSelfMessageConfirmedHandler]); // Keep dependencies minimal

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

  const requestOlderMessages = useCallback(
    async (
      roomId: number,
      beforeId: number | null,
      limit: number
    ): Promise<{
      messagesFetched: number;
      hasMore: boolean;
      error?: string;
    }> => {
      if (!socket || !isConnected) {
        console.warn(
          'requestOlderMessages: Cannot fetch, socket not connected.'
        );
        return {
          messagesFetched: 0,
          hasMore: false,
          error: 'Not connected',
        };
      }

      console.log(
        `requestOlderMessages: Requesting older messages for room ${roomId}, beforeId: ${beforeId}, limit: ${limit}`
      );

      return new Promise((resolve) => {
        socket.emit(
          'getMessages',
          { roomId, beforeId, limit },
          (response: {
            success: boolean;
            messages?: RawBackendMessage[];
            error?: string;
          }) => {
            // Check for success and presence of messages at the top level of the callback
            if (response.success && response.messages) {
              const fetchedMessages = response.messages; // Store in a new const for clarity
              const processedNewMessages = fetchedMessages
                .map(processRawMessage)
                .filter((msg): msg is BackendMessage => msg !== null);

              if (processedNewMessages.length === 0) {
                console.log(
                  'requestOlderMessages: No new older messages fetched or all failed processing.'
                );
                resolve({
                  messagesFetched: 0,
                  hasMore: false,
                });
                return;
              }

              setMessages((prevMessages) => {
                const existingRoomMessages = prevMessages[roomId] || [];
                const uniqueNewMessages = processedNewMessages.filter(
                  (newMsg) =>
                    !existingRoomMessages.some(
                      (existingMsg) => existingMsg.id === newMsg.id
                    )
                );

                if (uniqueNewMessages.length === 0) {
                  console.log(
                    'requestOlderMessages: All fetched older messages were duplicates.'
                  );
                  resolve({
                    messagesFetched: 0,
                    hasMore: fetchedMessages.length === limit, // Use checked fetchedMessages
                  });
                  return prevMessages;
                }

                const updatedRoomMessages = [
                  ...uniqueNewMessages,
                  ...existingRoomMessages,
                ].sort(
                  (a, b) => a.created_at.getTime() - b.created_at.getTime()
                );

                return {
                  ...prevMessages,
                  [roomId]: updatedRoomMessages,
                };
              });

              console.log(
                `requestOlderMessages: Successfully fetched and processed ${processedNewMessages.length} older messages for room ${roomId}.`
              );
              resolve({
                messagesFetched: processedNewMessages.length,
                hasMore: processedNewMessages.length === limit,
              });
            } else if (response.success && !response.messages) {
              // Success but no messages array, means 0 messages fetched
              console.log(
                'requestOlderMessages: Success, but no messages array returned (0 messages).'
              );
              resolve({
                messagesFetched: 0,
                hasMore: false, // No messages, so no more from this batch
              });
            } else {
              // Handles !response.success or other unexpected cases
              console.error(
                'requestOlderMessages: Failed to fetch older messages -',
                response.error
              );
              resolve({
                messagesFetched: 0,
                hasMore: false,
                error: response.error || 'Failed to fetch older messages',
              });
            }
          }
        );
      });
    },
    // Remove processRawMessage from dependencies if it's a stable import/function
    [socket, isConnected]
  );

  const createRoom = useCallback(
    async (payload: { name: string; description?: string; users: number[] }): Promise<{ success: boolean; room?: BackendRoom; error?: string; message?: string; cause?: any }> => {
      return new Promise((resolve) => {
        const currentSocket = socketInstanceRef.current;

        if (!currentSocket || !currentSocket.connected) {
          console.warn('createRoom: Socket not connected.');
          resolve({
            success: false,
            error: 'Not connected to chat server.',
            message: 'Not connected to chat server.',
          });
          return;
        }

        let settled = false;
        const REQUEST_TIMEOUT = 15000; // 15 seconds
        let timeoutId: NodeJS.Timeout | null = null;

        const doResolve = (response: { success: boolean; room?: BackendRoom; error?: string; message?: string; cause?: any }) => {
          if (!settled) {
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            currentSocket.off('exception', exceptionListenerForCreateRoom);
            resolve(response);
          }
        };

        const exceptionListenerForCreateRoom = (exceptionData: any) => {
          if (exceptionData && exceptionData.cause && exceptionData.cause.pattern === 'createRoom') {
            console.error('createRoom: Caught "exception" event relevant to createRoom:', exceptionData);
            doResolve({
              success: false,
              message: exceptionData.message || 'Server exception occurred during room creation.',
              error: exceptionData.error || exceptionData.message || 'Server exception occurred.',
              cause: exceptionData.cause,
            });
          }
        };

        const ackCallback = (ackResponse: { success: boolean; room?: BackendRoom; error?: string; message?: string; cause?: any }) => {
          console.log('createRoom ACK response:', ackResponse);

          if (ackResponse.success && ackResponse.room) {
            // Immediately update the rooms state with the new room
            setRooms((prevRooms) => {
              if (!ackResponse.room) return prevRooms; // Ensure room is defined
              return [...prevRooms, ackResponse.room];
            });
          }

          doResolve(ackResponse);
        };

        currentSocket.on('exception', exceptionListenerForCreateRoom);

        timeoutId = setTimeout(() => {
          console.error('createRoom: Request timed out. Neither ACK nor relevant exception received.');
          currentSocket.off('exception', exceptionListenerForCreateRoom);
          doResolve({
            success: false,
            error: 'Request timed out. The server did not respond in time.',
            message: 'Request timed out. The server did not respond in time.',
          });
        }, REQUEST_TIMEOUT);

        console.log('Emitting createRoom with payload:', payload);
        currentSocket.emit('createRoom', payload, ackCallback);
      });
    },
    []
  );

  const value: WebSocketContextType = useMemo(() => ({
    socket: socketInstanceRef.current, // Use the ref's current value
    isConnected,
    isLoading,
    error,
    rooms,
    messages,
    users,
    currentUserId, // Make sure currentUserId is derived and available in the provider's scope
    sendMessage,
    getMessagesForRoom,
    requestUsers,
    setOnSelfMessageConfirmedHandler,
    requestOlderMessages,
    createRoom, // Add createRoom to context value
  }), [
    isConnected, 
    isLoading, 
    error, 
    rooms, 
    messages, 
    users, 
    currentUserId, 
    sendMessage, 
    getMessagesForRoom, 
    requestUsers, 
    setOnSelfMessageConfirmedHandler, 
    requestOlderMessages, 
    createRoom
  ]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
