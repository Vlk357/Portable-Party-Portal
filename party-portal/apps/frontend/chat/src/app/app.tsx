import { Route, Routes, Navigate } from 'react-router-dom';

// Import your actual components
import { ChatList } from './components/ChatList';
import { WebSocketProvider } from './context/WebSocketContext';
import { ChatRoom } from './components/ChatRoom';
import { RedirectToLogin } from '../utils/RedirectToLogin';
// import ChatView from './components/ChatView'; // Example: Component for a specific chat
// import Page2 from './components/Page2'; // Example: If you keep Page 2

export function App() {
  const hasToken = !!localStorage.getItem('token');
  return (
    <WebSocketProvider>
      <Routes>
        {/* Default route redirects to the chat list */}
        <Route
          path="/"
          element={
            hasToken ? <Navigate to="/chat" replace /> : <RedirectToLogin />
          }
        />

        {/* Route for the chat list */}
        <Route
          path="/chat"
          element={hasToken ? <ChatList /> : <RedirectToLogin />}
        />

        {/* Example: Route for viewing a specific chat */}
        <Route
          path="/chat/:roomId" // Use a parameter for room ID
          element={hasToken ? <ChatRoom /> : <RedirectToLogin />}
        />
        {/* Example: If you want to keep Page 2 */}
        {/* <Route path="/page-2" element={<Page2 />} /> */}

        {/* Optional: Add a 404 Not Found route */}
        {/* <Route path="*" element={<div>404 Not Found</div>} /> */}
      </Routes>
    </WebSocketProvider>
  );
}

export default App;
