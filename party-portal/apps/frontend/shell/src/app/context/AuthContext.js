import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode'; // For decoding token to get user info or expiration
const AuthContext = createContext(undefined);
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
// This would be your actual API call to refresh the token
// For now, it's a placeholder. You'll need to implement this.
async function apiRefreshToken(currentRefreshToken) {
    console.log('Attempting to refresh token with:', currentRefreshToken);
    // Replace with your actual API call
    // Example:
    const response = await fetch('/auth/api/token/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    if (response.ok) {
        const data = await response.json();
        return { token: data.token, refreshToken: data.refreshToken, refreshTokenExpiration: data.refreshTokenExpiration };
    }
    return null;
}
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(null);
    const [refreshTokenVal, setRefreshTokenVal] = useState(null);
    const [refreshTokenExpiration, setRefreshTokenExpiration] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Start as true
    const decodeAndSetUser = useCallback((currentToken) => {
        if (currentToken) {
            try {
                const decoded = jwtDecode(currentToken);
                setUser({ id: decoded.sub, username: decoded.username });
                return decoded;
            }
            catch (e) {
                console.error("Failed to decode token:", e);
                setUser(null);
                return null;
            }
        }
        else {
            setUser(null);
            return null;
        }
    }, []);
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        const storedRefreshTokenExp = localStorage.getItem('refreshTokenExpiration');
        if (storedToken) {
            const decoded = decodeAndSetUser(storedToken);
            if (decoded && decoded.exp * 1000 > Date.now()) {
                setToken(storedToken);
                setRefreshTokenVal(storedRefreshToken);
                setRefreshTokenExpiration(storedRefreshTokenExp);
            }
            else {
                // Token exists but is expired or invalid
                localStorage.removeItem('token');
                localStorage.removeItem('user'); // if you store user object separately
                // Optionally attempt refresh here if refresh token exists and is valid
            }
        }
        setIsLoading(false);
    }, [decodeAndSetUser]);
    const login = (newToken, newRefreshToken, newRefreshTokenExp) => {
        localStorage.setItem('token', newToken);
        if (newRefreshToken)
            localStorage.setItem('refreshToken', newRefreshToken);
        if (newRefreshTokenExp)
            localStorage.setItem('refreshTokenExpiration', newRefreshTokenExp);
        setToken(newToken);
        if (newRefreshToken)
            setRefreshTokenVal(newRefreshToken);
        if (newRefreshTokenExp)
            setRefreshTokenExpiration(newRefreshTokenExp);
        decodeAndSetUser(newToken);
    };
    const logout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('refreshTokenExpiration');
        localStorage.removeItem('user'); // if you store user object separately
        setToken(null);
        setRefreshTokenVal(null);
        setRefreshTokenExpiration(null);
        setUser(null);
        // Here you might want to navigate to the login page
        // This is often handled by the ProtectedRoute component or similar logic.
    }, [decodeAndSetUser]);
    const triggerTokenRefresh = useCallback(async () => {
        const currentRefreshToken = localStorage.getItem('refreshToken');
        const currentRefreshTokenExp = localStorage.getItem('refreshTokenExpiration');
        if (!currentRefreshToken || !currentRefreshTokenExp) {
            console.log('No refresh token or expiration found.');
            logout(); // No way to refresh
            return false;
        }
        if (parseFloat(currentRefreshTokenExp) * 1000 <= Date.now()) {
            console.log('Refresh token expired.');
            logout(); // Refresh token itself is expired
            return false;
        }
        setIsLoading(true);
        try {
            const response = await apiRefreshToken(currentRefreshToken);
            if (response && response.token) {
                login(response.token, response.refreshToken, response.refreshTokenExpiration);
                console.log('Token refresh successful.');
                setIsLoading(false);
                return true;
            }
            else {
                console.log('Token refresh failed (API did not return new token).');
                logout();
                setIsLoading(false);
                return false;
            }
        }
        catch (error) {
            console.error('Error during token refresh:', error);
            logout(); // Critical error during refresh
            setIsLoading(false);
            return false;
        }
    }, [login, logout]);
    // Optional: Check token expiration periodically or on certain actions
    useEffect(() => {
        if (token) {
            const decoded = jwtDecode(token);
            const expiresIn = decoded.exp * 1000 - Date.now();
            if (expiresIn < 0) { // Token is expired
                console.log("Token expired, attempting refresh or logout.");
                if (refreshTokenVal && refreshTokenExpiration && parseFloat(refreshTokenExpiration) * 1000 > Date.now()) {
                    triggerTokenRefresh();
                }
                else {
                    logout();
                }
            }
            else {
                // Optional: Set a timer to refresh token before it expires
                // const refreshTimeout = expiresIn - (5 * 60 * 1000); // 5 minutes before expiry
                // if (refreshTimeout > 0) {
                //   const timerId = setTimeout(() => triggerTokenRefresh(), refreshTimeout);
                //   return () => clearTimeout(timerId);
                // }
            }
        }
    }, [token, refreshTokenVal, refreshTokenExpiration, logout, triggerTokenRefresh]);
    const isAuthenticated = !!token;
    const contextValue = {
        token,
        refreshTokenVal,
        isAuthenticated,
        isLoading,
        user,
        login,
        logout,
        triggerTokenRefresh,
    };
    return (_jsx(AuthContext.Provider, { value: contextValue, children: children }));
};
