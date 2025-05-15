import { AuthForm as ImportedAuthForm } from '../../../../auth/src/AuthForm'; // Use the path alias
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

// Define the expected props structure for AuthForm here for testing
interface ExpectedAuthFormProps {
  onLoginSuccess: (
    token: string,
    refreshToken: string,
    refreshTokenExpiration: string
  ) => void;
}

const AuthForm: React.FC<ExpectedAuthFormProps> = ImportedAuthForm as any; // Cast for now

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleLoginSuccess = (
    token: string,
    refreshToken: string,
    refreshTokenExpiration: string
  ) => {
    login(token, refreshToken, refreshTokenExpiration);
    // Navigation will be handled by the effect below or ProtectedRoute
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/app', { replace: true }); // Navigate to the main app area after login
    }
  }, [isAuthenticated, isLoading, navigate]);

  // If already authenticated and not loading, redirect away from login
  // This handles cases where user might navigate to /login manually while already logged in
  if (!isLoading && isAuthenticated) {
     // Or return null, or a redirect component, effect will handle navigation
    return null;
  }
  
  // If loading, you might want to show a spinner, or let AuthForm handle its own loading state
  if (isLoading) {
    return <div>Loading...</div>; // Or a more sophisticated loading indicator
  }

  return <AuthForm onLoginSuccess={handleLoginSuccess} />;
}