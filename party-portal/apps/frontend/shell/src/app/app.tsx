import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { ShellProvider } from './context/ShellContext'; // Import ShellProvider
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './modules/LoginPage';
import { ChatModule } from './modules/ChatModule';
import { CinemaModule } from './modules/CinemaModule';
import { GalleryModule } from './modules/GalleryModule';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Show a loading spinner or placeholder while authentication is being validated
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: window.location.pathname }} />;
  }

  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ShellProvider>
          {' '}
          {/* Wrap with ShellProvider */}
          <Routes>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="chat/*" element={<ChatModule />} />
              <Route path="cinema/*" element={<CinemaModule />} />
              <Route path="gallery/*" element={<GalleryModule />} /> {/* Add this route */}
              <Route index element={<Navigate to="chat" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/app/chat" replace />} />
          </Routes>
        </ShellProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
