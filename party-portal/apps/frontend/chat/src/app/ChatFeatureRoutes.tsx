import { Route, Routes, Navigate } from 'react-router-dom';
import { ChatList } from './components/ChatList';
import { WebSocketProvider } from './context/WebSocketContext';
import { ChatRoom } from './components/ChatRoom';
import { CreateChatRoom } from './components/CreateChatRoom';
import './../styles.css';

// This component now defines routes relative to where it's mounted.
// The WebSocketProvider wraps these routes.
export function ChatFeatureRoutes() {
  // Authentication is handled by the shell's ProtectedRoute.
  // WebSocketProvider will internally get the token from localStorage.
  return (
    <WebSocketProvider>
      <Routes>
        {/* Default route for the chat module (e.g., /app/chat/ -> renders ChatList) */}
        <Route path="/" element={<ChatList />} />
        {/* Route for creating a new chat (e.g., /app/chat/new) */}
        <Route path="new" element={<CreateChatRoom />} />
        {/* Route for a specific chat room (e.g., /app/chat/:roomId) */}
        <Route path=":roomId" element={<ChatRoom />} />
        {/* Optional: Fallback for any unmatched sub-routes within chat, redirect to chat list */}
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </WebSocketProvider>
  );
}

export default ChatFeatureRoutes;
