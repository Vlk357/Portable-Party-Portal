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
import { PendingMessage } from '../../types/PendingMessage';
import { SimpleUser } from '../../types/SimpleUser'; // Import SimpleUser type

const MESSAGES_PER_PAGE = 20; // Number of older messages to fetch each time

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
    users, // Get users array from context
    setOnSelfMessageConfirmedHandler,
    // ---- This function is expected from your WebSocketContext ----
    requestOlderMessages,
  } = useWebSocket();

  const [newMessage, setNewMessage] = useState('');
  const [textareaRows, setTextareaRows] = useState(1);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable message list
  const scrollAnchorRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null); // For scroll preservation

  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true); // Assume true initially

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
    const mappedPending = pendingMessages.map((p) => ({ ...p, id: p.tempId }));
    const mappedConfirmed = confirmedMessages.map((c) => ({
      ...c,
      status: 'confirmed' as const,
    }));
    const combined = [...mappedConfirmed, ...mappedPending];
    return combined.sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime()
    );
  }, [confirmedMessages, pendingMessages]);
  // --- End Combine and Sort ---

  const displayedMessages = useMemo(() => {
    return allMessages; // Display all loaded messages
  }, [allMessages]);

  // --- Scroll to Bottom for new messages (revised) ---
  const [lastMessageCount, setLastMessageCount] = useState(0);
  useEffect(() => {
    if (
      allMessages.length > lastMessageCount &&
      messageContainerRef.current &&
      !isLoadingOlder // Don't auto-scroll if older messages are being loaded
    ) {
      const container = messageContainerRef.current;
      const isUserNearBottom =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + 200; // 200px tolerance

      // Only scroll if it's an initial load (lastMessageCount === 0)
      // or if a new message arrived AND the user was already near the bottom.
      if (lastMessageCount === 0 || isUserNearBottom) {
        messagesEndRef.current?.scrollIntoView({
          behavior: lastMessageCount === 0 ? 'auto' : 'smooth',
        });
      }
    }
    setLastMessageCount(allMessages.length);
  }, [allMessages, isLoadingOlder]);

  // --- Load Older Messages ---
  const loadOlderMessages = useCallback(async () => {
    if (
      isLoadingOlder ||
      !hasMoreOlderMessages ||
      !currentRoomId ||
      !requestOlderMessages
    ) {
      if (!requestOlderMessages) {
        console.warn(
          'ChatRoom: requestOlderMessages function is not available from context.'
        );
      }
      return;
    }

    // Confirmed messages should be sorted: oldest first, newest last.
    // So, confirmedMessages[0] is the oldest one currently displayed.
    const oldestConfirmedMessage =
      confirmedMessages.length > 0 ? confirmedMessages[0] : null;
    const beforeMessageId = oldestConfirmedMessage
      ? oldestConfirmedMessage.id
      : null;

    console.log(
      `Attempting to load older messages for room ${currentRoomId}, before ID: ${beforeMessageId}, limit: ${MESSAGES_PER_PAGE}`
    );
    setIsLoadingOlder(true);

    if (messageContainerRef.current) {
      scrollAnchorRef.current = {
        scrollHeight: messageContainerRef.current.scrollHeight,
        scrollTop: messageContainerRef.current.scrollTop,
      };
    }

    try {
      const result = await requestOlderMessages(
        currentRoomId,
        beforeMessageId,
        MESSAGES_PER_PAGE
      );

      console.log(
        `Fetched ${result.messagesFetched} older messages. Has more: ${result.hasMore}`
      );
      if (result.error) {
        console.error(
          'Failed to load older messages from context:',
          result.error
        );
        // Optionally set an error state here to display to the user
      }
      if (!result.hasMore) {
        setHasMoreOlderMessages(false);
      }
      // The WebSocketContext's requestOlderMessages should handle updating the
      // global message store, which will then update `confirmedMessages` via `getMessagesForRoom`.
    } catch (error) {
      console.error('Error calling requestOlderMessages:', error);
      // Optionally set an error state here
    } finally {
      setIsLoadingOlder(false);
    }
  }, [
    isLoadingOlder,
    hasMoreOlderMessages,
    currentRoomId,
    confirmedMessages,
    requestOlderMessages, // Added to dependencies
  ]);

  // --- Scroll Event Listener for Loading Older Messages ---
  useEffect(() => {
    const container = messageContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Trigger if scrolled very close to the top
      if (container.scrollTop < 50 && !isLoadingOlder && hasMoreOlderMessages) {
        loadOlderMessages();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [loadOlderMessages, isLoadingOlder, hasMoreOlderMessages]); // loadOlderMessages is stable due to useCallback

  // --- useLayoutEffect for Restoring Scroll Position ---
  React.useLayoutEffect(() => {
    if (
      scrollAnchorRef.current &&
      messageContainerRef.current &&
      !isLoadingOlder // Only adjust if not currently in the process of loading
    ) {
      const { scrollHeight: prevScrollHeight, scrollTop: prevScrollTop } =
        scrollAnchorRef.current;
      const currentScrollHeight = messageContainerRef.current.scrollHeight;

      if (currentScrollHeight > prevScrollHeight) {
        // Messages were prepended
        const heightDifference = currentScrollHeight - prevScrollHeight;
        messageContainerRef.current.scrollTop =
          prevScrollTop + heightDifference;
        console.log(
          `Restored scroll. PrevTop: ${prevScrollTop}, HeightDiff: ${heightDifference}, NewTop: ${messageContainerRef.current.scrollTop}`
        );
      }
      scrollAnchorRef.current = null; // Reset after applying
    }
  }, [allMessages, isLoadingOlder]); // Re-run when allMessages changes (new older messages added) or isLoadingOlder finishes

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
  const handleSendConfirm = useCallback((tempId: number, messageId: number) => {
    console.log(
      `ChatRoom: handleSendConfirm called for tempId: ${tempId}, messageId: ${messageId}`
    );
    setPendingMessages((prev) => prev.filter((msg) => msg.tempId !== tempId));
  }, []);

  // useEffect to register the confirmation handler with the context
  // This ensures that if a self-sent message is confirmed via broadcast (not just ACK),
  // the pending message is still removed.
  useEffect(() => {
    if (setOnSelfMessageConfirmedHandler) {
      // The handler in context expects (tempId: number) => void
      // handleSendConfirm matches this if we ignore the messageId param for this specific registration.
      const selfMessageBroadcastHandler = (tempId: number) => {
        console.log(
          `ChatRoom: Self-message broadcast confirmed by context for tempId: ${tempId}`
        );
        // Call the existing confirm handler. It's idempotent.
        handleSendConfirm(tempId, -1); // -1 as dummy messageId, it's not used by filter
      };
      setOnSelfMessageConfirmedHandler(selfMessageBroadcastHandler);
    }
    // Cleanup: unregister the handler
    return () => {
      if (setOnSelfMessageConfirmedHandler) {
        setOnSelfMessageConfirmedHandler(() => {
          /* intentionally empty */
        });
      }
    };
  }, [setOnSelfMessageConfirmedHandler, handleSendConfirm]);

  const handleSendError = useCallback((tempId: number, error: string) => {
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
      const tempId = Date.now();

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

  // --- Key Down Handler (Send on Ctrl+Enter) ---
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && event.ctrlKey && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // --- Create a map for quick user lookup ---
  const userMap = useMemo(() => {
    const map = new Map<number, SimpleUser>();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

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
      <div
        ref={messageContainerRef}
        className="flex-grow overflow-y-auto p-4 space-y-1"
      >
        {/* Load More Messages Button */}
        {!isLoadingOlder && hasMoreOlderMessages && (
          <div className="text-center py-2">
            <button
              onClick={loadOlderMessages}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              Load more messages
            </button>
          </div>
        )}
        {isLoadingOlder && (
          <div className="text-center py-3 flex justify-center items-center text-gray-500">
            <svg
              className="animate-spin h-5 w-5 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="ml-2">Loading older messages...</span>
          </div>
        )}
        {!hasMoreOlderMessages &&
          confirmedMessages.length > 0 &&
          !isLoadingOlder && (
            <div className="text-center py-3 text-gray-400 text-sm">
              You've reached the beginning of your conversation.
            </div>
          )}
        {displayedMessages.length === 0 && !isLoadingOlder && (
          <div className="text-center text-gray-500 pt-10">
            No messages yet. Start the conversation!
          </div>
        )}
        {/* Use the combined 'displayedMessages' list */}
        {displayedMessages.map((msg) => {
          // Find sender information
          const sender = msg.user_id ? userMap.get(msg.user_id) : null;
          const senderDisplayName =
            sender?.username ??
            (msg.user_id ? `User ${msg.user_id}` : 'Unknown User');

          return (
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
              // Pass the sender's name
              senderName={senderDisplayName}
            />
          );
        })}
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
