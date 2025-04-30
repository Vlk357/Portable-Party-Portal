import { Route, Routes, Navigate } from 'react-router-dom';

// Import your actual components
import ChatList from './components/ChatList';
// import ChatView from './components/ChatView'; // Example: Component for a specific chat
// import Page2 from './components/Page2'; // Example: If you keep Page 2

export function App() {
  return (
    // Remove the outer div and placeholder navigation/content
    // if they are not part of your final chat app layout.
    // Let Routes manage the main content area.
    <Routes>
      {/* Default route redirects to the chat list */}
      <Route path="/" element={<Navigate replace to="/chats" />} />

      {/* Route for the chat list */}
      <Route path="/chats" element={<ChatList />} />

      {/* Example: Route for viewing a specific chat */}
      {/* <Route path="/chat/:chatId" element={<ChatView />} /> */}

      {/* Example: If you want to keep Page 2 */}
      {/* <Route path="/page-2" element={<Page2 />} /> */}

      {/* Optional: Add a 404 Not Found route */}
      {/* <Route path="*" element={<div>404 Not Found</div>} /> */}
    </Routes>
  );
}

export default App;
