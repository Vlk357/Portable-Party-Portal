import React from 'react';
import { BackendMessage } from '../../types/BackendMessage';

// Combine types for props - message can be BackendMessage or have status
type MessageWithStatus = (
  | BackendMessage
  | { tempId: string; status: 'pending' | 'failed' }
) & {
  content: string;
  created_at: Date;
  user_id: number | null;
  status?: 'pending' | 'failed' | 'confirmed'; // Add status
};

// --- Message Bubble Component ---
export const MessageBubble: React.FC<{
  message: MessageWithStatus; // Use combined type
  isOwnMessage: boolean;
  status?: 'pending' | 'failed' | 'confirmed'; // Receive status prop
}> = React.memo(({ message, isOwnMessage, status }) => {
  // Format the timestamp
  const formattedTime =
    message.created_at instanceof Date
      ? message.created_at.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Invalid Date';

  // Determine opacity based on status
  const opacityClass =
    status === 'pending'
      ? 'opacity-60'
      : status === 'failed'
      ? 'opacity-50'
      : 'opacity-100';
  // Determine background/text color for failed state
  const failedStyle = status === 'failed' ? 'bg-red-100 border-red-300' : '';
  const failedTextStyle =
    status === 'failed'
      ? 'text-red-600'
      : isOwnMessage
      ? 'text-blue-100'
      : 'text-gray-500';
  const failedIcon =
    status === 'failed' ? (
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
    status === 'pending' ? (
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
            ? status === 'failed'
              ? failedStyle
              : 'bg-blue-500 text-white' // Failed style for own message
            : status === 'failed'
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
