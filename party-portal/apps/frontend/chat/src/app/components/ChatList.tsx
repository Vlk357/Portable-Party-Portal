import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

export function ChatList() {
  const { isLoading, error, rooms, getMessagesForRoom } = useWebSocket();

  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');

  const filteredRooms = useMemo(() => {
    if (!searchTerm) {
      return rooms;
    }
    return rooms.filter((room) =>
      room.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rooms, searchTerm]);

  const getRoomDisplayData = (roomId: number) => {
    console.log(`Starting Display data function for room ID: ${roomId}`); // Log room ID

    const roomMessages = getMessagesForRoom(roomId);
    // --- Add Log for roomMessages ---
    console.log(`Messages found for room ${roomId}:`, roomMessages);
    // --- End Log ---

    const lastMessage =
      roomMessages.length > 0
        ? roomMessages[roomMessages.length - 1]
        : undefined;
    // --- Add Log for lastMessage ---
    console.log(
      `Last message object for room ${roomId}:`,
      lastMessage,
      `typeof Last message: ${typeof lastMessage}`
    );
    // --- End Log ---

    let formattedTimestamp: string | null = null;
    // Check if lastMessage exists AND createdAt is a Date
    if (lastMessage && lastMessage.created_at instanceof Date) {
      try {
        formattedTimestamp = lastMessage.created_at.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        console.log(
          `Formatted timestamp for room ${roomId}: ${formattedTimestamp}`
        );
      } catch (e) {
        console.error(
          `Error formatting date for room ${roomId}:`,
          lastMessage.created_at,
          e
        );
        formattedTimestamp = 'Invalid Date';
      }
    } else {
      // Log why formatting failed
      if (!lastMessage) {
        console.log(`No last message found for room ${roomId}.`);
      } else if (!(lastMessage.created_at instanceof Date)) {
        console.log(
          `Timestamp for room ${roomId} is not a Date object. Type: ${typeof lastMessage.created_at}, Value:`,
          lastMessage.created_at
        );
      } else {
        console.log(
          `Unknown reason for timestamp issue in room ${roomId}. Last message:`,
          lastMessage
        );
      }
    }

    return {
      lastMessageContent: lastMessage?.content,
      timestamp: formattedTimestamp,
    };
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-semibold">Chats</h1>
        <button
          className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Create new chat"
          onClick={() => navigate('/chat/new')}
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

      <div className="p-4 bg-white border-b border-gray-200">
        <input
          type="text"
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading || !!error}
        />
      </div>

      <div className="flex-grow overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-gray-500">
            {error || 'Connecting...'}
          </div>
        )}
        {!isLoading && error && !error.includes('refresh') && (
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
