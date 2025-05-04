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
import { BackendMessage } from '../../types/BackendMessage'; // Import BackendMessage
import { PendingMessage } from '../../types/PendingMessage';

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
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentRoomId = parseInt(roomId || '0', 10);

  const currentUserId = useMemo(() => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const userId = parseInt(decoded.sub, 10);
      return isNaN(userId) ? null : userId;
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  }, []);

  const currentRoom = useMemo(() => {
    return rooms.find((room) => room.id === currentRoomId);
  }, [rooms, currentRoomId]);

  // Get confirmed messages
  const confirmedMessages = useMemo(() => {
    return getMessagesForRoom(currentRoomId);
  }, [getMessagesForRoom, currentRoomId]);

  // --- Combine and Sort Confirmed and Pending Messages ---
  const allMessages = useMemo(() => {
    // Map pending messages to a common structure (similar to BackendMessage but with status)
    const mappedPending = pendingMessages.map((p) => ({ ...p, id: p.tempId })); // Use tempId as key/id

    // Map confirmed messages (add a 'confirmed' status for consistency if needed)
    const mappedConfirmed = confirmedMessages.map((c) => ({
      ...c,
      status: 'confirmed' as const,
    }));

    // Combine, filter out any confirmed message that might still be in pending (using ID check)
    const combined = [...mappedConfirmed, ...mappedPending];

    // Sort by date
    return combined.sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime()
    );
  }, [confirmedMessages, pendingMessages]);
  // --- End Combine and Sort ---

  // --- Display only the latest N messages ---
  const displayedMessages = useMemo(() => {
    const MESSAGE_LIMIT = 50; // Show last 50 messages initially
    return allMessages.slice(-MESSAGE_LIMIT);
  }, [allMessages]);

  // --- Scroll to Bottom ---
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [displayedMessages]);

  // --- Input Change Handler ---
  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const currentText = event.target.value;
    setNewMessage(currentText);
    // Auto-resize logic...
    const textarea = event.target;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const lines = Math.ceil(scrollHeight / lineHeight);
    const newRows = Math.min(Math.max(1, lines), 4);
    setTextareaRows(newRows);
    textarea.style.height = `${scrollHeight}px`;
    if (newRows === 4) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  };

  // --- Callbacks for sendMessage ---
  const handleSendConfirm = useCallback(
    (tempId: string, confirmedMessage: BackendMessage) => {
      console.log(`Confirmed message for tempId: ${tempId}`, confirmedMessage);
      // Remove the message from pending state now that it's confirmed
      setPendingMessages((prev) => prev.filter((msg) => msg.tempId !== tempId));
      // Note: The message will appear in the list via the 'newMessage' event handler updating 'confirmedMessages'
    },
    []
  );

  const handleSendError = useCallback((tempId: string, error: string) => {
    console.error(`Failed message for tempId: ${tempId}, Error: ${error}`);
    // Update the status of the pending message to 'failed'
    setPendingMessages((prev) =>
      prev.map((msg) =>
        msg.tempId === tempId ? { ...msg, status: 'failed' } : msg
      )
    );
    // Optionally, show a more specific error to the user based on the error message
  }, []);
  // --- End Callbacks ---

  // --- Send Message Handler ---
  const handleSendMessage = useCallback(() => {
    const trimmedMessage = newMessage.trim();
    if (trimmedMessage && currentRoomId && currentUserId && isConnected) {
      // 1. Create a temporary ID
      const tempId =
        Date.now().toString() + Math.random().toString(36).substring(2, 9); // Simple unique enough ID

      // 2. Create the pending message object
      const pendingMsg: PendingMessage = {
        tempId: tempId,
        chat_room_id: currentRoomId,
        user_id: currentUserId,
        content: trimmedMessage,
        created_at: new Date(), // Use current client time
        status: 'pending',
      };

      // 3. Add to pending state
      setPendingMessages((prev) => [...prev, pendingMsg]);

      // 4. Call the context sendMessage with callbacks
      sendMessage(
        currentRoomId,
        trimmedMessage,
        tempId,
        handleSendConfirm,
        handleSendError
      );

      // 5. Clear input and reset UI
      setNewMessage('');
      setTextareaRows(1);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.overflowY = 'hidden';
        textareaRef.current.focus();
      }
    }
  }, [
    newMessage,
    currentRoomId,
    isConnected,
    sendMessage,
    currentUserId,
    handleSendConfirm,
    handleSendError,
  ]);

  // --- Key Down Handler (Send on Enter) ---
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // --- Render Logic ---
  if (isContextLoading && !currentRoom) {
    return <div className="p-4 text-center text-gray-500">Loading chat...</div>;
  }
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

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-3 sm:p-4 flex items-center shadow-sm flex-shrink-0">
        <Link
          to="/chat"
          className="mr-3 text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-gray-100"
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        {currentRoom && (
          <>
            <div className="w-10 h-10 bg-gray-300 rounded-full mr-3 flex-shrink-0 flex items-center justify-center text-lg font-semibold text-gray-600">
              {currentRoom.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-gray-800 truncate">
                {currentRoom.name}
              </h1>
            </div>
          </>
        )}
      </header>

      {/* Message List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-1">
        {displayedMessages.length === 0 && (
          <div className="text-center text-gray-500 pt-10">
            No messages yet. Start the conversation!
          </div>
        )}
        {/* Use the combined 'displayedMessages' list */}
        {displayedMessages.map((msg) => (
          <MessageBubble
            // Use tempId for pending, id for confirmed as key
            key={
              msg.status === 'pending' || msg.status === 'failed'
                ? msg.tempId
                : msg.id
            }
            // Pass the whole combined message object
            message={msg}
            isOwnMessage={msg.user_id === currentUserId}
            // Pass status to MessageBubble
            status={msg.status}
          />
        ))}
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
          disabled={!isConnected}
          style={{ maxHeight: `${4 * 24}px` }}
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || !isConnected}
          className="p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
          aria-label="Send message"
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
              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
