import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { CreateRoomDto } from '../../types/CreateRoomDto';

export function CreateChatRoom() {
  // Destructure createRoom and ensure currentUserId is correctly obtained
  const {
    users: allUsers,
    createRoom: contextCreateRoom,
    currentUserId: contextUserId,
  } = useWebSocket();
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Use currentUserId from context directly if available and valid
  const currentUserId = useMemo(() => {
    if (typeof contextUserId === 'number') return contextUserId;
    // Fallback to decoding token if contextUserId is not available/valid
    // This fallback might indicate an issue with how currentUserId is set in the context
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      // const decoded = jwtDecode<DecodedToken>(token); // If you still need jwt-decode
      // const userId = parseInt(decoded.sub, 10);
      // return isNaN(userId) ? null : userId;
      return null; // Or handle appropriately if contextUserId is the source of truth
    } catch (err) {
      console.error(
        'Failed to decode token in CreateChatRoom (fallback):',
        err
      );
      return null;
    }
  }, [contextUserId]);

  const availableUsers = useMemo(() => {
    if (typeof currentUserId !== 'number') return allUsers; // Show all if current user unknown
    return allUsers.filter((user) => user.id !== currentUserId);
  }, [allUsers, currentUserId]);

  const handleUserSelection = (userId: number) => {
    setSelectedUserIds((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(userId)) {
        newSelected.delete(userId);
      } else {
        newSelected.add(userId);
      }
      return newSelected;
    });
  };

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      if (!roomName.trim()) {
        setError('Room name is required.');
        return;
      }
      if (selectedUserIds.size === 0) {
        setError('You must invite at least one user.');
        return;
      }
      // contextCreateRoom will handle socket connection check internally
      // if (!socket || !socket.connected) {
      //   setError('Not connected to chat server. Please try again.');
      //   return;
      // }

      setIsCreating(true);
      const roomData: CreateRoomDto = {
        // Or use CreateRoomPayload type from context
        name: roomName.trim(),
        description: description.trim() || undefined,
        users: Array.from(selectedUserIds),
      };

      console.log(
        'Attempting to create room with data (via context):',
        roomData
      );

      try {
        // Use the createRoom function from the context
        const response = await contextCreateRoom(roomData);
        setIsCreating(false);

        if (response.success && response.room) {
          console.log(
            'Room created successfully (via context):',
            response.room
          );
          navigate(`/chat/${response.room.id}`);
        } else {
          // Handle error messages, including the "Forbidden" one
          const errorMessage =
            response.message ||
            response.error ||
            'Failed to create room. Please try again.';
          console.error(
            'Failed to create room (via context):',
            errorMessage,
            response.cause
          );
          setError(errorMessage);
        }
      } catch (err) {
        setIsCreating(false);
        console.error(
          'Exception when trying to create room (via context):',
          err
        );
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred.'
        );
      }
    },
    [roomName, description, selectedUserIds, contextCreateRoom, navigate]
  );

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4 shadow-md flex items-center">
        <Link to="/chat" className="mr-3 p-1 rounded-full hover:bg-blue-700">
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
        <h1 className="text-xl font-semibold">Create New Chat Room</h1>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex-grow p-4 space-y-6 overflow-y-auto"
      >
        <div>
          <label
            htmlFor="roomName"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Room Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="roomName"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isCreating}
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description (Optional)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isCreating}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Invite Users <span className="text-red-500">*</span> (select at
            least one)
          </h3>
          {availableUsers.length === 0 && (
            <p className="text-sm text-gray-500">
              No other users available to invite.
            </p>
          )}
          <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-md p-2 space-y-2 bg-white">
            {availableUsers.map((user) => (
              <div key={user.id} className="flex items-center">
                <input
                  type="checkbox"
                  id={`user-${user.id}`}
                  checked={selectedUserIds.has(user.id)}
                  onChange={() => handleUserSelection(user.id)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isCreating}
                />
                <label
                  htmlFor={`user-${user.id}`}
                  className="ml-2 text-sm text-gray-700"
                >
                  {user.username} (ID: {user.id})
                </label>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end space-x-3 pt-4">
          <Link
            to="/chat"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-disabled={isCreating}
            onClick={(e) => isCreating && e.preventDefault()}
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Room'}
          </button>
        </div>
      </form>
    </div>
  );
}
