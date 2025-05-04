import React from 'react';
import { BackendMessage } from '../../types/BackendMessage';
import { PendingMessage } from '../../types/PendingMessage'; // Import PendingMessage

// Define the possible shapes for a message in the bubble
type ConfirmedMessageForBubble = BackendMessage & { status: 'confirmed' };
type PendingMessageForBubble = PendingMessage & { id: number }; // Add 'id' mapped from tempId

// Use a Union type for MessageWithStatus
type MessageWithStatus = ConfirmedMessageForBubble | PendingMessageForBubble;

// --- Message Bubble Component ---
export const MessageBubble: React.FC<{
  message: MessageWithStatus; // Use the new Union type
  isOwnMessage: boolean;
  status?: 'pending' | 'failed' | 'confirmed'; // Status is already part of the message type shapes
}> = React.memo(({ message, isOwnMessage, status }) => {
  // status prop might be redundant now but keep for clarity if needed

  // Format the timestamp (present in both shapes)
  const formattedTime =
    message.created_at instanceof Date
      ? message.created_at.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Invalid Date';

  // Determine status directly from the message object
  const currentStatus = message.status; // 'confirmed', 'pending', or 'failed'

  // Determine opacity based on status
  const opacityClass =
    currentStatus === 'pending'
      ? 'opacity-60'
      : currentStatus === 'failed'
      ? 'opacity-50'
      : 'opacity-100';
  // Determine background/text color for failed state
  const failedStyle =
    currentStatus === 'failed' ? 'bg-red-100 border-red-300' : '';
  const failedTextStyle =
    currentStatus === 'failed'
      ? 'text-red-600'
      : isOwnMessage
      ? 'text-blue-100'
      : 'text-gray-500';
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
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
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
    <div
      className={`flex mb-2 ${
        isOwnMessage ? 'justify-end' : 'justify-start'
      } ${opacityClass}`} // Apply opacity
    >
      <div
        className={`rounded-lg px-3 py-2 max-w-xs lg:max-w-md shadow-sm ${
          isOwnMessage
            ? currentStatus === 'failed'
              ? failedStyle
              : 'bg-blue-500 text-white' // Failed style for own message
            : currentStatus === 'failed'
            ? failedStyle
            : 'bg-white text-gray-800 border border-gray-200' // Failed style for others
        }`}
      >
        <p className="text-sm break-words">{message.content}</p>
        <div
          className={`text-xs mt-1 ${failedTextStyle} text-right`} // Apply failed text style
        >
          {formattedTime}
          {/* Show pending/failed icon */}
          {pendingIcon}
          {failedIcon}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';
