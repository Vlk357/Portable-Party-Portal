import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react'; // Added useEffect and useRef
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shell/src/app/context/AuthContext';
import './index.css';
export function AuthForm({ onLoginSuccess }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const usernameInputRef = useRef(null); // Ref for username input
    useEffect(() => {
        // Focus the username input when the component mounts
        if (usernameInputRef.current) {
            usernameInputRef.current.focus();
        }
    }, []); // Empty dependency array ensures this runs only once on mount
    const handleSubmit = async (e) => {
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
                const errorData = await response.json();
                throw new Error(errorData.message || 'Login failed');
            }
            const data = await response.json();
            onLoginSuccess(data.token, data.refresh_token, data.refresh_token_expiration.toString());
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        }
        finally {
            setIsLoading(false);
        }
    };
    return (_jsx("div", { className: "h-screen flex items-center justify-center bg-gray-50 p-4 overflow-hidden", children: _jsxs("form", { onSubmit: handleSubmit, className: "w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-6", children: [_jsx("h1", { className: "text-2xl font-bold text-center text-gray-800", children: "Sign In" }), error && (_jsx("div", { className: "bg-red-50 text-red-600 p-3 rounded-md text-sm", children: error })), _jsxs("div", { className: "space-y-4", children: [_jsx("input", { ref: usernameInputRef, type: "text", value: username, onChange: (e) => setUsername(e.target.value), placeholder: "Username", className: "w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800", required: true, autoComplete: "username" //{/* Autocomplete for username */}
                         }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: showPassword ? 'text' : 'password', value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Password", className: "w-full p-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800", required: true, autoComplete: "current-password" //{/* Autocomplete for password */}
                                 }), _jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), className: "absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700", "aria-label": showPassword ? "Hide password" : "Show password", children: showPassword ? (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-5 h-5", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" }) })) : (_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-5 h-5", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" })] })) })] })] }), _jsx("button", { type: "submit", disabled: isLoading, className: `w-full p-2 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
            ${isLoading
                        ? 'bg-blue-400 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600'}`, children: isLoading ? 'Signing in...' : 'Sign In' })] }) }));
}
function AuthApp() {
    const navigate = useNavigate(); // Hook for navigation
    const auth = useAuth(); // Get the auth context
    const handleLoginSuccess = (token, refreshToken, refreshTokenExpiration) => {
        auth.login(token, refreshToken, refreshTokenExpiration);
        console.log('Login successful via AuthContext');
        navigate('/app/chat'); // Or '/app' to let the default route in shell handle it
    };
    return _jsx(AuthForm, { onLoginSuccess: handleLoginSuccess });
}
export default AuthApp; // Export the component
