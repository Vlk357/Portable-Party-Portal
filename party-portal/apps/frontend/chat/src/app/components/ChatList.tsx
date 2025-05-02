import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { handleLogout, refreshToken } from '../../utils/apiFetch'; // Corrected path and added refreshToken

// --- Types matching backend initialData ---
interface BackendRoom {
  id: number;
  name: string;
  userCount: number;
  // Add other properties if your backend sends more room details
}

interface BackendMessage {
  id: number;
  roomId: number;
  userId: number;
  content: string;
  createdAt: string; // Assuming ISO string format
  // Add other properties like sender name if available
}

interface InitialData {
  success: boolean;
  rooms: BackendRoom[];
  roomMessages: Record<number, BackendMessage[]>; // Messages keyed by room ID
  error?: string;
}
// --- End Types ---

// --- Helper Function for Timestamp Formatting ---
const formatTimestamp = (isoString?: string): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    // Example formatting: "10:30 AM" or "Mon" or "1/15/25"
    // You might want a more robust date formatting library (like date-fns or moment)
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    // Basic check for yesterday or older - needs improvement for accuracy across timezones/day boundaries
    if (
      now.getDate() - date.getDate() === 1 &&
      now.getMonth() === date.getMonth() &&
      now.getFullYear() === date.getFullYear()
    ) {
      return 'Yesterday';
    }
    // Check if within the last week (simple check)
    if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], { weekday: 'short' }); // e.g., "Mon"
    }
    return date.toLocaleDateString(); // e.g., "1/15/25"
  } catch (e) {
    console.error('Error formatting date:', e);
    return '';
  }
};
// --- End Helper ---

export function ChatList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<BackendRoom[]>([]);
  const [messages, setMessages] = useState<Record<number, BackendMessage[]>>(
    {}
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketInstanceRef = useRef<Socket | null>(null);
  const isRefreshingTokenRef = useRef(false); // Ref to prevent multiple refresh attempts simultaneously

  // --- WebSocket Connection Effect ---
  useEffect(() => {
    if (socketInstanceRef.current) {
      console.log(
        'ChatList effect: Skipping setup, socket instance already exists in ref.'
      );
      return;
    }

    console.log('ChatList effect: Starting setup');
    let currentToken = localStorage.getItem('token'); // Use let as it might change after refresh

    if (!currentToken) {
      setError('Authentication token not found.');
      setIsLoading(false);
      handleLogout();
      return;
    }

    const wsUrl =
      import.meta.env.VITE_CHAT_WEBSOCKET_URL || 'ws://127.0.0.1:8080/chat';
    console.log('Attempting to connect to WebSocket:', wsUrl);

    setIsLoading(true);
    setError(null);

    // Create socket instance
    const newSocket = io(wsUrl, {
      auth: { token: currentToken }, // Use currentToken
      transports: ['websocket'],
      reconnection: false, // Disable automatic reconnection initially to manage refresh manually
    });

    socketInstanceRef.current = newSocket;

    // --- Event Handlers ---
    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      if (socketInstanceRef.current === newSocket) {
        setSocket(newSocket);
        setError(null);
        isRefreshingTokenRef.current = false; // Reset refresh flag on successful connect
      }
    });

    newSocket.on('initialData', (data: InitialData) => {
      console.log('Received initialData:', data);
      if (socketInstanceRef.current !== newSocket) return;

      if (data.success) {
        setRooms(data.rooms);
        setMessages(data.roomMessages);
        setError(null);
      } else {
        setError(data.error || 'Failed to load initial chat data.');
      }
      setIsLoading(false);
    });

    newSocket.on('connect_error', async (err) => { // Make handler async
      console.error('WebSocket connection error:', err.message);
      if (socketInstanceRef.current !== newSocket) return;

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

      // --- Refresh Logic ---
      if (isAuthError && !isRefreshingTokenRef.current) {
        console.log('Auth error detected, attempting token refresh...');
        isRefreshingTokenRef.current = true; // Set flag to prevent loops
        setError('Authentication expired, attempting to refresh...'); // Update UI
        setIsLoading(true);

        const refreshed = await refreshToken(); // Attempt refresh

        if (refreshed) {
          console.log('Token refresh successful. Retrying WebSocket connection...');
          currentToken = localStorage.getItem('token'); // Get the new token
          if (currentToken && socketInstanceRef.current === newSocket) {
            // Update the auth options of the existing socket instance
            newSocket.auth = { token: currentToken };
            // Attempt to reconnect the *same* socket instance
            newSocket.connect();
            // Reset error message, loading state will be handled by connect/error events
            setError(null);
          } else {
             // Should not happen if refresh succeeded, but handle defensively
             console.error("Failed to get new token after refresh or socket instance changed. Logging out.");
             handleLogout();
          }
          // Note: isRefreshingTokenRef is reset on successful 'connect' or if refresh fails below
        } else {
          console.error('Token refresh failed. Logging out.');
          setError('Session expired. Please log in again.'); // Set final error
          setIsLoading(false);
          isRefreshingTokenRef.current = false; // Reset flag
          // Clean up this specific socket instance
          if (socketInstanceRef.current === newSocket) {
             socketInstanceRef.current.disconnect();
             socketInstanceRef.current = null;
          }
          setSocket(null);
        }
      } else if (isAuthError && isRefreshingTokenRef.current) {
         console.log("Refresh already in progress, ignoring subsequent auth error.");
         // Avoid infinite loops if refresh succeeds but connection still fails
      } else {
        // --- Non-Auth Error Handling ---
        console.error('Non-authentication connection error.');
        setError(`Connection failed: ${err.message}`);
        setIsLoading(false);
        isRefreshingTokenRef.current = false; // Reset flag if it was somehow set
        // Clean up this specific socket instance
        if (socketInstanceRef.current === newSocket) {
          socketInstanceRef.current.disconnect();
          socketInstanceRef.current = null;
        }
        setSocket(null);
      }
    });

    // Generic error handler (for errors *after* connection)
    newSocket.on('error', (errorData: { message: string } | string) => {
      const errorMessage =
        typeof errorData === 'string' ? errorData : errorData.message;
      console.error('WebSocket post-connection error:', errorMessage);
      if (socketInstanceRef.current !== newSocket) return;

      // If a post-connection error indicates an auth issue, trigger logout
      // This might happen if the token expires *between* connection and an operation
      const postConnectAuthErrors = ['Invalid or expired token', 'Unauthorized'];
       if (postConnectAuthErrors.some(msg => errorMessage.includes(msg))) {
           console.error("Post-connection auth error detected. Logging out.");
           handleLogout();
           setError('Session expired. Please log in again.');
       } else {
           setError(`Chat error: ${errorMessage}`);
       }
       // Maybe disconnect? Depends on the error severity
       // newSocket.disconnect();
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${reason}`);
      if (socketInstanceRef.current === newSocket) {
         // Avoid showing reconnecting message if logout was triggered
         if (!error?.includes('Session expired')) {
            setError(`Disconnected: ${reason}.`);
         }
        setIsLoading(false);
        setSocket(null);
        socketInstanceRef.current = null;
        isRefreshingTokenRef.current = false; // Reset flag on disconnect
      }
    });

    // --- Cleanup Function ---
    return () => {
      console.log('Running ChatList effect cleanup');
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
  }, []); // Empty dependency array

  // --- Filtered Rooms based on Search Term ---
  const filteredRooms = useMemo(() => {
    if (!searchTerm) {
      return rooms;
    }
    return rooms.filter((room) =>
      room.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rooms, searchTerm]);

  // --- Derive Last Message and Timestamp for Display ---
  const getRoomDisplayData = (roomId: number) => {
    const roomMessages = messages[roomId] || [];
    // Sort messages by date descending to get the latest
    const sortedMessages = [...roomMessages].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const lastMessage = sortedMessages[0];
    return {
      lastMessageContent: lastMessage?.content,
      timestamp: formatTimestamp(lastMessage?.createdAt),
    };
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header Area */}
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-semibold">Chats</h1>
        <button
          className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Create new chat"
          onClick={() => alert('Navigate to Create Chat screen')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        </button>
      </header>

      {/* Search Bar */}
      <div className="p-4 bg-white border-b border-gray-200">
        <input
          type="text"
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading || !!error} // Disable search if loading or error
        />
      </div>

      {/* Chat List Area */}
      <div className="flex-grow overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-gray-500">{error || 'Connecting...'}</div> // Show refresh message if applicable
        )}
        {!isLoading && error && !error.includes('refresh') && ( // Don't show refresh message as final error
          <div className="p-4 text-center text-red-500">{error}</div>
        )}
        {!isLoading && !error && filteredRooms.length === 0 && (
          <div className="p-4 text-center text-gray-500">No chats found.</div>
        )}
        {!isLoading && !error && filteredRooms.length > 0 && (
          <ul>
            {filteredRooms.map((room) => {
              const displayData = getRoomDisplayData(room.id);
              return (
                <li key={room.id} className="border-b border-gray-200">
                  <Link
                    to={`/chat/${room.id}`}
                    className="flex items-center p-4 hover:bg-gray-50 transition duration-150 ease-in-out"
                  >
                    <div className="w-12 h-12 bg-gray-300 rounded-full mr-4 flex-shrink-0 flex items-center justify-center text-xl font-semibold text-gray-600">
                      {room.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-800 truncate">
                          {room.name}
                        </span>
                        {displayData.timestamp && (
                          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                            {displayData.timestamp}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-sm text-gray-600 truncate">
                          {displayData.lastMessageContent || 'No messages yet'}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ChatList;
