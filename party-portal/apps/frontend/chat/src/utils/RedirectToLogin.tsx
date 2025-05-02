import { useEffect } from 'react';

export function RedirectToLogin() {
  useEffect(() => {
    // Construct the absolute URL for the login page.
    // Adjust the base URL if your auth app runs on a different port or path.
    const loginUrl = '/auth/login/'; // Assuming it's at the root level relative to the domain
    window.location.replace(loginUrl);
  }, []);

  // Render null or a loading indicator while redirecting
  return <div>Redirecting to login...</div>;
}