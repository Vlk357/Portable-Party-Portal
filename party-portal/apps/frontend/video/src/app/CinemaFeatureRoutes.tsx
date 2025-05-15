import React from 'react';
import { Route, Routes } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer'; // Assuming VideoPlayer is the main component for this route
import './app.module.css'; // Keep app-specific styles

// This component now defines routes relative to where it's mounted.
export function CinemaFeatureRoutes() {
  // Authentication is handled by the shell's ProtectedRoute.
  // Any video-specific providers would go here if needed.
  return (
    <Routes>
      {/* Default route for the cinema module (e.g., /app/cinema/ -> renders VideoPlayer) */}
      <Route path="/" element={<VideoPlayer />} />
      {/* Add other cinema-specific routes here if you have them */}
      {/* Example: <Route path="library" element={<VideoLibrary />} /> */}
      {/* Example: <Route path="watch/:videoId" element={<AnotherVideoPlayer />} /> */}
    </Routes>
  );
}

export default CinemaFeatureRoutes;
