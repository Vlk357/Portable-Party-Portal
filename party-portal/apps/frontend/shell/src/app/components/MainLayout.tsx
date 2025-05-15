import React, { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Assuming you have an AuthContext
import { useShell } from '../context/ShellContext'; // Import useShell

// A simple hamburger icon component
const HamburgerIcon: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className }) => (
  <button
    onClick={onClick}
    className={`p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white ${className}`}
    aria-label="Open navigation menu"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
);

export function MainLayout() {
  const { user, logout } = useAuth();
  const { isDrawerOpen, toggleDrawer, closeDrawer } = useShell(); // Use context state and functions
  const [currentPageTitle, setCurrentPageTitle] = useState('Party Portal'); // This can be improved later to reflect current page

  const handleLogout = () => {
    closeDrawer(); // Close drawer on logout
    logout();
    // navigate('/login'); // AuthProvider should handle redirect on logout
  };

  return (
    <div className="flex h-screen bg-gray-100"> {/* Changed bg for contrast if needed */}
      {/* Sidebar */}
      <aside
        className={`bg-gray-800 text-white w-64 h-full p-4 transform transition-transform duration-300 ease-in-out
                   fixed top-0 left-0 z-30 ${
                     isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
                   }`}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Navigation</h2>
          {/* Optional: Add a close button inside the sidebar for mobile */}
          <button
            onClick={closeDrawer}
            className="p-1 rounded-md hover:bg-gray-700" // Removed md:hidden
            aria-label="Close navigation menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav>
          <Link
            to="/app/chat"
            className="block py-2 px-4 rounded hover:bg-gray-700"
            onClick={() => {
              setCurrentPageTitle('Chat'); // Example: Update title
              closeDrawer();
            }}
          >
            Chat
          </Link>
          <Link
            to="/app/cinema"
            className="block py-2 px-4 rounded hover:bg-gray-700"
            onClick={() => {
              setCurrentPageTitle('Cinema'); // Example: Update title
              closeDrawer();
            }}
          >
            Cinema
          </Link>
          <Link
            to="/app/profile"
            className="block py-2 px-4 rounded hover:bg-gray-700"
            onClick={() => {
              setCurrentPageTitle('Profile'); // Example: Update title
              closeDrawer();
            }}
          >
            Profile
          </Link>
        </nav>
        <div className="mt-auto pt-4 border-t border-gray-700"> {/* Use mt-auto to push to bottom if sidebar is flex column */}
          {user ? (
            <button onClick={handleLogout} className="block w-full text-left py-2 px-3 rounded hover:bg-gray-700">
              Logout ({user.username})
            </button>
          ) : (
            <Link to="/auth/login" onClick={closeDrawer} className="block w-full text-left py-2 px-3 rounded hover:bg-gray-700">
              Login
            </Link>
          )}
        </div>
      </aside>

      {/* Content Area */}
      {/* Overlay to close sidebar when clicking outside on mobile */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-20 bg-black opacity-50" // Removed md:hidden
          onClick={closeDrawer}
          aria-hidden="true"
        ></div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-10"> {/* Lowered z-index from sidebar */}
          <div className="flex items-center">
            <button
              className="p-2 mr-2 rounded-full hover:bg-blue-700 focus:outline-none" /* Removed md:hidden */
              aria-label="Toggle menu"
              onClick={toggleDrawer} // Use toggleDrawer from context
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-4 6h4"></path>
              </svg>
            </button>
            <h1 className="text-xl font-semibold">{currentPageTitle}</h1>
          </div>
          {/* Global actions could go here */}
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 bg-white"> {/* Added bg-white to content for clarity */}
          <Outlet /> {/* ChatModule or CinemaModule content renders here */}
        </main>
      </div>
    </div>
  );
}