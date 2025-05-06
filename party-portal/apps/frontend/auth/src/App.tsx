import { useState, FormEvent } from 'react';
import type { LoginResponse } from './types/LoginResponse'; // Ensure this type includes refresh_token and expiration
import type { ErrorResponse } from './types/ErrorResponse';

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Use VITE_API_URL for consistency if defined, otherwise fallback
      const apiUrl = `${window.location.origin}/auth/api`;
      console.log(`Origin url: ${window.location.origin}`);
      const response = await fetch(`${apiUrl}/login`, { // Use apiUrl
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

      // --- Store all token data ---
      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refresh_token);
      // Store expiration as a string; parse it when needed
      localStorage.setItem('refreshTokenExpiration', data.refresh_token_expiration.toString());
      // --- End storing token data ---

      console.log('Login successful', data);
      // Redirect to the chat application base path
      window.location.href = '/chat-app/'; // Adjust if your chat app base route is different
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

export default App;
