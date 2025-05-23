import React from 'react';
import { BackendMessage } from '../../types/BackendMessage';
import { PendingMessage } from '../../types/PendingMessage';

// Define the possible shapes for a message in the bubble
type ConfirmedMessageForBubble = BackendMessage & { status: 'confirmed' };
type PendingMessageForBubble = PendingMessage & { id: number };

// Use a Union type for MessageWithStatus
type MessageWithStatus = ConfirmedMessageForBubble | PendingMessageForBubble;

// --- Message Bubble Component ---
export const MessageBubble: React.FC<{
  message: MessageWithStatus;
  isOwnMessage: boolean;
  senderName?: string; // Add senderName prop
}> = React.memo(({ message, isOwnMessage, senderName }) => {
  // Format the timestamp in 24-hour format
  const formattedTime = React.useMemo(() => {
    if (!(message.created_at instanceof Date)) {
      return 'Invalid Date';
    }
    
    const now = new Date();
    const messageDate = message.created_at;
    
    // Check if message is from today
    const isToday = 
      messageDate.getDate() === now.getDate() &&
      messageDate.getMonth() === now.getMonth() &&
      messageDate.getFullYear() === now.getFullYear();
    
    // Check if message is from yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = 
      messageDate.getDate() === yesterday.getDate() &&
      messageDate.getMonth() === yesterday.getMonth() &&
      messageDate.getFullYear() === yesterday.getFullYear();
    
    // Format just the time part (used for all cases)
    const timeString = messageDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    if (isToday) {
      return `Today, ${timeString}`;
    } else if (isYesterday) {
      return `Yesterday, ${timeString}`;
    } else {
      // Different year
      if (messageDate.getFullYear() !== now.getFullYear()) {
        return messageDate.toLocaleDateString([], {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }) + `, ${timeString}`;
      }
      // Same year but different day
      return messageDate.toLocaleDateString([], {
        day: '2-digit',
        month: 'short'
      }) + `, ${timeString}`;
    }
  }, [message.created_at]);

  // Determine status directly from the message object
  const currentStatus = message.status;

  // Determine opacity based on status
  const opacityClass =
    currentStatus === 'pending'
      ? 'opacity-60'
      : currentStatus === 'failed'
      ? 'opacity-50'
      : 'opacity-100';
  const failedStyle =
    currentStatus === 'failed' ? 'bg-red-100 border-red-300' : '';
  const failedIcon =
    currentStatus === 'failed' ? (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-3 h-3 inline-block ml-1 text-red-500"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1-18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
    ) : null;
  const pendingIcon =
    currentStatus === 'pending' ? (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-3 h-3 inline-block ml-1 animate-spin opacity-70"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    ) : null;

  return (
    // --- Outer container for potential name + bubble ---
    <div
      className={`flex flex-col ${
        isOwnMessage ? 'items-end' : 'items-start'
      } mb-2`}
    >
      {/* Conditionally render sender name ABOVE the bubble */}
      {!isOwnMessage && senderName && (
        <div className="text-xs text-gray-600 mb-0.5 ml-2 font-medium">
          {' '}
          {/* Adjust margin/padding as needed */}
          {senderName}
        </div>
      )}

      {/* --- Original bubble structure --- */}
      <div
        className={`flex ${
          isOwnMessage ? 'justify-end' : 'justify-start'
        } w-full`} // Ensure bubble takes width for alignment
      >
        <div
          className={`rounded-lg px-3 py-2 max-w-xs lg:max-w-md shadow-sm ${opacityClass} ${
            isOwnMessage
              ? currentStatus === 'failed'
                ? failedStyle
                : 'bg-blue-500 text-white'
              : currentStatus === 'failed'
              ? failedStyle
              : 'bg-white text-gray-800 border border-gray-200'
          }`}
          title={`${formattedTime}`}
        >
          {/* REMOVED sender name from inside */}

          {/* Message content */}
          <p className="text-sm break-words whitespace-pre-wrap">
            {message.content}
          </p>

          {/* Icons container */}
          {(pendingIcon || failedIcon) && (
            <div className="text-xs mt-1 text-right h-3">
              {pendingIcon}
              {failedIcon}
            </div>
          )}
        </div>
      </div>
      {/* --- End original bubble structure --- */}
    </div>
    // --- End outer container ---
  );
});

MessageBubble.displayName = 'MessageBubble';
