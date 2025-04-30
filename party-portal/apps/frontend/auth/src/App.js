import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
function App() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Login failed');
            }
            const data = await response.json();
            // Store token in localStorage or secure storage
            localStorage.setItem('token', data.token);
            // Redirect or update UI state
            //TODO: Redirect to {chat, dashboard, ...}
            console.log('Login successful', data);
            window.location.href = '/chat-app/';
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        }
        finally {
            setIsLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50 p-4", children: _jsxs("form", { onSubmit: handleSubmit, className: "w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-4", children: [_jsx("h1", { className: "text-2xl font-bold text-center text-gray-800", children: "Sign In" }), error && (_jsx("div", { className: "bg-red-50 text-red-600 p-3 rounded-md text-sm", children: error })), _jsxs("div", { className: "space-y-2", children: [_jsx("input", { type: "text", value: username, onChange: (e) => setUsername(e.target.value), placeholder: "Username", className: "w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800", required: true }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Password", className: "w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800", required: true })] }), _jsx("button", { type: "submit", disabled: isLoading, className: `w-full p-2 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
            ${isLoading
                        ? 'bg-blue-400 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600'}`, children: isLoading ? 'Signing in...' : 'Sign In' })] }) }));
}
export default App;
