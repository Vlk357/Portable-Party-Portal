// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/frontend/chat/src/app/components/ChatRoom.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { jwtDecode } from 'jwt-decode';
import { DecodedToken } from '../../types/DecodedToken';
import { MessageBubble } from './MessageBubble';

// --- Chat Room Component ---
export function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const {
    isLoading: isContextLoading,
    error: contextError,
    isConnected,
    rooms,
    getMessagesForRoom,
    sendMessage,
  } = useWebSocket();

  const [newMessage, setNewMessage] = useState('');
  const [textareaRows, setTextareaRows] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref to scroll to bottom
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref for textarea focus

  const currentRoomId = parseInt(roomId || '0', 10);

  // --- Get Current User ID ---
  const currentUserId = useMemo(() => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const userId = parseInt(decoded.sub, 10);
      return isNaN(userId) ? null : userId;
    } catch (error) {
      console.error('Failed to decode token:', error);
      // Optionally handle logout here if token is invalid
      // handleLogout();
      return null;
    }
  }, []); // Only calculate once on mount

  // --- Find Room Details ---
  const currentRoom = useMemo(() => {
    return rooms.find((room) => room.id === currentRoomId);
  }, [rooms, currentRoomId]);

  // --- Get Messages for the Current Room (Already sorted by context) ---
  const roomMessages = useMemo(() => {
    return getMessagesForRoom(currentRoomId);
  }, [getMessagesForRoom, currentRoomId]);

  // --- Display only the latest N messages ---
  // Consider implementing "load more" later
  const displayedMessages = useMemo(() => {
    const MESSAGE_LIMIT = 50; // Show last 50 messages initially
    return roomMessages.slice(-MESSAGE_LIMIT);
  }, [roomMessages]);

  // --- Scroll to Bottom ---
  useEffect(() => {
    // Use timeout to ensure scrolling happens after DOM updates
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100); // Small delay can help
    return () => clearTimeout(timer);
  }, [displayedMessages]); // Trigger scroll when displayed messages update

  // --- Input Change Handler ---
  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const currentText = event.target.value;
    setNewMessage(currentText);

    // Auto-resize textarea based on content height, up to 4 lines
    const textarea = event.target;
    textarea.style.height = 'auto'; // Reset height to calculate scrollHeight correctly
    const scrollHeight = textarea.scrollHeight;

    // Estimate line height (adjust if needed based on your font/styling)
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const lines = Math.ceil(scrollHeight / lineHeight);

    const newRows = Math.min(Math.max(1, lines), 4); // Min 1, Max 4 rows
    setTextareaRows(newRows);
    textarea.style.height = `${scrollHeight}px`; // Set height based on content

    // Ensure height doesn't exceed max rows equivalent
    if (newRows === 4) {
      textarea.style.overflowY = 'auto'; // Allow scrolling if max rows reached
    } else {
      textarea.style.overflowY = 'hidden';
    }
  };

  // --- Send Message Handler ---
  const handleSendMessage = useCallback(() => {
    const trimmedMessage = newMessage.trim();
    if (trimmedMessage && currentRoomId && isConnected) {
      sendMessage(currentRoomId, trimmedMessage);
      setNewMessage(''); // Clear input after sending
      setTextareaRows(1); // Reset rows
      // Reset textarea height manually
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.overflowY = 'hidden';
        textareaRef.current.focus(); // Keep focus on textarea
      }
    }
  }, [newMessage, currentRoomId, isConnected, sendMessage]); // Dependencies

  // --- Key Down Handler (Send on Enter) ---
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Send message on Enter press (Shift+Enter for new line)
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default newline behavior
        handleSendMessage();
      }
    },
    [handleSendMessage]
  ); // Dependency

  // --- Render Logic ---
  if (isContextLoading && !currentRoom) {
    // Show loading only if room data isn't available yet
    return <div className="p-4 text-center text-gray-500">Loading chat...</div>;
  }

  // Show specific error if room not found after loading
  if (!isContextLoading && !currentRoom) {
    return (
      <div className="p-4 text-center text-red-500">
        Chat room not found or not accessible.
        <Link to="/chat" className="block mt-2 text-blue-600 hover:underline">
          Go back to chat list
        </Link>
      </div>
    );
  }

  // Show general context error if present (e.g., connection failed)
  if (contextError) {
    return (
      <div className="p-4 text-center text-red-500">
        Error: {contextError}
        <Link to="/chat" className="block mt-2 text-blue-600 hover:underline">
          Go back to chat list
        </Link>
      </div>
    );
  }

  // Render chat interface if room exists
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-3 sm:p-4 flex items-center shadow-sm flex-shrink-0">
        <Link
          to="/chat"
          className="mr-3 text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-gray-100"
        >
          {/* Back Arrow SVG */}
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        {/* Room Avatar/Initial */}
        {currentRoom && ( // Check if currentRoom exists before accessing properties
          <>
            <div className="w-10 h-10 bg-gray-300 rounded-full mr-3 flex-shrink-0 flex items-center justify-center text-lg font-semibold text-gray-600">
              {currentRoom.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-gray-800 truncate">
                {currentRoom.name}
              </h1>
              {/* Optional: Display user count or status */}
              {/* <p className="text-xs text-gray-500">{currentRoom.userCount} members</p> */}
            </div>
          </>
        )}
        {/* Optional: Room actions (info, settings, etc.) */}
      </header>

      {/* Message List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-1">
        {' '}
        {/* Reduced space-y */}
        {displayedMessages.length === 0 && (
          <div className="text-center text-gray-500 pt-10">
            No messages yet. Start the conversation!
          </div>
        )}
        {displayedMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwnMessage={msg.userId === currentUserId}
          />
        ))}
        {/* Element to scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Area */}
      <div className="bg-gray-50 border-t border-gray-200 p-3 flex items-end flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={newMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
          className="flex-grow p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mr-2 bg-white disabled:bg-gray-100"
          rows={textareaRows}
          disabled={!isConnected} // Disable if not connected
          style={{ maxHeight: `${4 * 24}px` }} // Approximate max height based on line height
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || !isConnected} // Disable if empty or not connected
          className="p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
          aria-label="Send message"
        >
          {/* Send Icon SVG */}
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
              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
