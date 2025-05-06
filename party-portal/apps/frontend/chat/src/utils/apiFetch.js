const API_BASE_URL = `${window.location.origin}${import.meta.env.VITE_API_URL}` ||
    `${window.location.origin}/auth/api`; // Auth API base
// Function to get tokens from storage
export const getAuthTokens = () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    const expirationString = localStorage.getItem('refreshTokenExpiration');
    const refreshTokenExpiration = expirationString
        ? parseInt(expirationString, 10)
        : null;
    return { token, refreshToken, refreshTokenExpiration };
};
// Function to set tokens in storage
const setAuthTokens = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refresh_token);
    localStorage.setItem('refreshTokenExpiration', data.refresh_token_expiration.toString());
};
// Function to clear tokens and redirect to login
const handleLogout = () => {
    console.error('HandleLogout has been called!');
    // localStorage.removeItem('token');
    // localStorage.removeItem('refreshToken');
    // localStorage.removeItem('refreshTokenExpiration');
    // Redirect to login page (adjust path as needed)
    // window.location.href = '/auth/login/'; // Or use React Router navigate
};
// Function to attempt token refresh
const refreshToken = async () => {
    const { refreshToken: currentRefreshToken } = getAuthTokens(); // Renamed variable to avoid conflict
    if (!currentRefreshToken) {
        console.error('No refresh token available.');
        return false;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/token/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: currentRefreshToken }), // Use renamed variable
        });
        if (!response.ok) {
            console.error('Refresh token failed:', response.status, await response.text());
            // If refresh token itself is invalid (e.g., 401/403), logout
            if (response.status === 401 || response.status === 403) {
                console.log('Refresh token invalid or expired. Logging out.');
                handleLogout();
            }
            return false;
        }
        const data = await response.json();
        setAuthTokens(data);
        console.log('Token refreshed successfully.');
        return true;
    }
    catch (error) {
        console.error('Error during token refresh:', error);
        return false;
    }
};
// The wrapped fetch function
export const apiFetch = async (url, options = {}) => {
    // Use const here as 'token' itself isn't reassigned in this block
    const { token } = getAuthTokens(); // Changed let to const
    // Ensure headers object exists
    const headers = new Headers(options.headers || {});
    // Add Authorization header if token exists
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    // Make the initial request
    // 'response' needs to be 'let' because it might be reassigned after refresh
    let response = await fetch(url, {
        ...options,
        headers,
    });
    // Check if the response is Unauthorized (401)
    if (response.status === 401) {
        console.log('Received 401 Unauthorized. Attempting token refresh...');
        const refreshed = await refreshToken();
        if (refreshed) {
            // Retry the request with the new token
            const { token: newToken } = getAuthTokens(); // Get the newly stored token
            if (newToken) {
                headers.set('Authorization', `Bearer ${newToken}`);
            }
            console.log('Retrying original request with new token.');
            response = await fetch(url, {
                // Reassign response
                ...options,
                headers,
            });
        }
        else {
            // Refresh failed, logout the user (already implemented)
            console.error('Token refresh failed. Logging out.');
            handleLogout(); // This function redirects to login
            // Return the original 401 response or throw an error
            // Returning the response allows the caller to potentially handle 401 if needed,
            // but the user is already being redirected by handleLogout.
        }
    }
    return response;
};
// Export handleLogout AND refreshToken
export { handleLogout, refreshToken }; // Modified export
export default apiFetch;
