import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { useAuth } from '../../shell/src/app/context/AuthContext'; // Adjust path to your shell's AuthContext
import type { LoginResponse } from './types/LoginResponse';
import type { ErrorResponse } from './types/ErrorResponse';
import './index.css';

interface AuthFormProps {
  onLoginSuccess: (
    token: string,
    refreshToken: string,
    refreshTokenExpiration: string
  ) => void;
}

export function AuthForm({ onLoginSuccess }: AuthFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const apiUrl = `${window.location.origin}/auth/api`;
      const response = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data: LoginResponse = await response.json();

      // Call the callback provided by the shell instead of direct manipulation
      onLoginSuccess(
        data.token,
        data.refresh_token,
        data.refresh_token_expiration.toString()
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center text-gray-800">
          Sign In
        </h1>
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full p-2 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
            ${
              isLoading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

function AuthApp() { // Renamed to avoid confusion if this file is directly used as LoginPage
  const navigate = useNavigate(); // Hook for navigation
  const auth = useAuth(); // Get the auth context

  const handleLoginSuccess = (
    token: string,
    refreshToken: string,
    refreshTokenExpiration: string
  ) => {
    auth.login(token, refreshToken, refreshTokenExpiration);
    console.log('Login successful via AuthContext');
    navigate('/app/chat'); // Or '/app' to let the default route in shell handle it
  };

  return <AuthForm onLoginSuccess={handleLoginSuccess} />;
}

export default AuthApp; // Export the component
