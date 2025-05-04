// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/frontend/chat/src/app/components/MessageBubble.tsx
import React from 'react';
import { BackendMessage } from '../../types/BackendMessage';

// --- Message Bubble Component ---
export const MessageBubble: React.FC<{
  message: BackendMessage;
  isOwnMessage: boolean;
}> = React.memo(({ message, isOwnMessage }) => {

  // Format the timestamp
  const formattedTime = message.created_at instanceof Date
    ? message.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Invalid Date'; // Fallback if createdAt is not a Date

  return (
    <div
      className={`flex mb-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`rounded-lg px-3 py-2 max-w-xs lg:max-w-md shadow-sm ${
          isOwnMessage
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-800 border border-gray-200'
        }`}
      >
        {/* Optional: Display sender name for group chats */}
        {/* {!isOwnMessage && <div className="text-xs text-gray-600 mb-1 font-medium">{message.senderName || `User ${message.userId}`}</div>} */}
        <p className="text-sm break-words">{message.content}</p>
        <div
          className={`text-xs mt-1 ${
            isOwnMessage ? 'text-blue-100' : 'text-gray-500'
          } text-right`}
        >
          {/* Render the formatted string */}
          {formattedTime}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble'; // Keep display name