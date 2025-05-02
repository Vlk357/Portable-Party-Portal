import { useState, useMemo } from 'react'; // Removed useEffect, useRef, Socket related imports
import { Link } from 'react-router-dom';
// Removed io, Socket, handleLogout, refreshToken imports (handled by context)
import { BackendMessage } from '../../types/BackendMessage'; // Keep type imports if needed here
import { BackendRoom } from '../../types/BackendRoom';
// Removed InitialData import
import { useWebSocket } from '../context/WebSocketContext'; // Import the context hook
import { formatTimestamp } from '../../utils/formatTimestamp'; // Import the utility

// Removed the standalone formatTimestamp function from here

export function ChatList() {
  // Get data and state from context instead of local state/refs
  const {
    isLoading, // Use loading state from context
    error,     // Use error state from context
    rooms,     // Use rooms state from context
    getMessagesForRoom, // Use function from context
  } = useWebSocket();

  const [searchTerm, setSearchTerm] = useState('');

  // Removed local state for socket, messages, isLoading, error, refs

  // Removed the WebSocket Connection useEffect block entirely

  // --- Filtered Rooms based on Search Term (Uses rooms from context) ---
  const filteredRooms = useMemo(() => {
    if (!searchTerm) {
      return rooms;
    }
    return rooms.filter((room) =>
      room.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rooms, searchTerm]);

  // --- Derive Last Message and Timestamp for Display (Uses getMessagesForRoom from context) ---
  const getRoomDisplayData = (roomId: number) => {
    const roomMessages = getMessagesForRoom(roomId); // Get messages via context function
    // Find the latest message (messages from context are already sorted)
    const lastMessage = roomMessages.length > 0 ? roomMessages[roomMessages.length - 1] : undefined;
    return {
      lastMessageContent: lastMessage?.content,
      timestamp: formatTimestamp(lastMessage?.createdAt), // Use the utility
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
          onClick={() => alert('Navigate to Create Chat screen')} // Replace with actual navigation/action
        >
          {/* SVG Icon */}
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
             <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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
          disabled={isLoading || !!error} // Use context's isLoading and error
        />
      </div>

      {/* Chat List Area */}
      <div className="flex-grow overflow-y-auto">
        {/* Use context's isLoading and error states */}
        {isLoading && (
          <div className="p-4 text-center text-gray-500">{error || 'Connecting...'}</div>
        )}
        {/* Display error only if not loading and it's not just a refresh message */}
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
                    to={`/chat/${room.id}`} // Link to the specific chat room
                    className="flex items-center p-4 hover:bg-gray-50 transition duration-150 ease-in-out"
                  >
                    {/* Room Avatar/Initial */}
                    <div className="w-12 h-12 bg-gray-300 rounded-full mr-4 flex-shrink-0 flex items-center justify-center text-xl font-semibold text-gray-600">
                      {room.name.charAt(0).toUpperCase()}
                    </div>
                    {/* Room Name & Last Message */}
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
                        {/* Optional: Unread count badge */}
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

// Remove export default if you only use the named export
// export default ChatList;
