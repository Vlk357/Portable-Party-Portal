import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // For navigation

// Placeholder type for chat room data
interface ChatRoom {
  id: number;
  name: string;
  lastMessage?: string; // Optional: display last message preview
  timestamp?: string; // Optional: display last message time
  unreadCount?: number; // Optional: display unread message count
}

// Placeholder function to fetch chat rooms (replace with actual API call)
const fetchChatRooms = async (searchTerm: string): Promise<ChatRoom[]> => {
  console.log('Fetching chat rooms with search term:', searchTerm);
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Placeholder data - replace with data from your backend
  const allRooms: ChatRoom[] = [
    { id: 1, name: 'General Discussion', lastMessage: 'Sounds good!', timestamp: '10:30 AM', unreadCount: 2 },
    { id: 2, name: 'Weekend Plans', lastMessage: 'See you there!', timestamp: 'Yesterday', unreadCount: 0 },
    { id: 3, name: 'Project Alpha', lastMessage: 'Need feedback on the latest draft.', timestamp: 'Mon', unreadCount: 5 },
    { id: 4, name: 'Random Memes', lastMessage: '😂', timestamp: '1/15/25', unreadCount: 0 },
  ];

  if (!searchTerm) {
    return allRooms;
  }

  return allRooms.filter(room =>
    room.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
};


export function ChatList() {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRooms = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const rooms = await fetchChatRooms(searchTerm);
        setChatRooms(rooms);
      } catch (err) {
        setError('Failed to load chat rooms.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce search or load immediately
    const debounceTimer = setTimeout(() => {
        loadRooms();
    }, 300); // Adjust debounce delay as needed

    return () => clearTimeout(debounceTimer); // Cleanup timer on unmount or search term change

  }, [searchTerm]); // Re-run effect when searchTerm changes

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header Area */}
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-semibold">Chats</h1>
        {/* Placeholder for potential future actions like settings */}
        <button
            className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Create new chat"
            onClick={() => alert('Navigate to Create Chat screen')} // Placeholder action
        >
           {/* Plus Icon */}
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
        />
      </div>

      {/* Chat List Area */}
      <div className="flex-grow overflow-y-auto">
        {isLoading && <div className="p-4 text-center text-gray-500">Loading...</div>}
        {error && <div className="p-4 text-center text-red-500">{error}</div>}
        {!isLoading && !error && chatRooms.length === 0 && (
          <div className="p-4 text-center text-gray-500">No chats found.</div>
        )}
        {!isLoading && !error && chatRooms.length > 0 && (
          <ul>
            {chatRooms.map((room) => (
              <li key={room.id} className="border-b border-gray-200">
                {/* Use Link for navigation */}
                <Link
                  to={`/chat/${room.id}`} // Example route, adjust as needed
                  className="flex items-center p-4 hover:bg-gray-50 transition duration-150 ease-in-out"
                >
                  {/* Placeholder for Avatar */}
                  <div className="w-12 h-12 bg-gray-300 rounded-full mr-4 flex-shrink-0 flex items-center justify-center text-xl font-semibold text-gray-600">
                    {room.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-grow min-w-0"> {/* Added min-w-0 to prevent overflow */}
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800 truncate">{room.name}</span>
                      {room.timestamp && (
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{room.timestamp}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-sm text-gray-600 truncate">
                        {room.lastMessage || 'No messages yet'}
                      </p>
                      {room.unreadCount && room.unreadCount > 0 ? (
                        <span className="ml-2 bg-blue-500 text-white text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0">
                          {room.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ChatList;