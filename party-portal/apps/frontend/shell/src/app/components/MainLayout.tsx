import React from 'react'; // Removed useState as currentPageTitle is removed
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useShell } from '../context/ShellContext';


export function MainLayout() {
  const { user, logout } = useAuth();
  const { isDrawerOpen, closeDrawer } = useShell(); // Removed toggleDrawer if Hamburger is managed by apps

  const handleLogout = () => {
    closeDrawer();
    logout();
  };

  return (
    // The main div no longer needs to be flex h-screen if apps manage their own full height
    // It primarily serves as a container for the sidebar and the app's content (Outlet)
    <>
      {/* Sidebar */}
      <aside
        className={`bg-gray-800 text-white w-64 h-full p-4 transform transition-transform duration-300 ease-in-out
                   fixed top-0 left-0 z-30 ${
                     isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
                   }`}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Navigation</h2>
          <button
            onClick={closeDrawer}
            className="p-1 rounded-md hover:bg-gray-700"
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
            onClick={closeDrawer} // Simplified, title is managed by app
          >
            Chat
          </Link>
          <Link
            to="/app/cinema"
            className="block py-2 px-4 rounded hover:bg-gray-700"
            onClick={closeDrawer} // Simplified
          >
            Cinema
          </Link>
          <Link to="/app/gallery">Gallery</Link>
        </nav>
        <div className="mt-auto pt-4 border-t border-gray-700">
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

      {/* Overlay to close sidebar when clicking outside */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-20 bg-black opacity-50"
          onClick={closeDrawer}
          aria-hidden="true"
        ></div>
      )}

      {/* Content Area - The Outlet will render the specific app module */}
      {/* Removed the wrapping div and header from here */}
      {/* The individual apps (ChatModule, CinemaModule) will now be responsible for their own layout, including any headers */}
      <div className="flex-1"> {/* This div might need adjustment based on how apps structure themselves */}
        {/* Removed p-6 and other shell-specific main styling */}
        <Outlet /> {/* ChatModule or CinemaModule content renders here, taking full space */}
      </div>
    </> // Using React Fragment as the outermost element
  );
}