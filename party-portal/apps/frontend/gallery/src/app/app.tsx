import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { GalleryPageLayout } from './components/GalleryPageLayout';
import { GalleryGridDisplay } from './components/GalleryGridDisplay';
import { MediaDetailView } from './components/MediaDetailView';

/**
 * App: Defines the routes for the gallery module.
 * This is the component that should be lazy loaded by the shell.
 */
export function App() {
  return (
    <Routes>
      <Route path="*" element={<GalleryPageLayout />}> {/* Parent layout route */}
        <Route index element={<GalleryGridDisplay />} /> {/* Grid view at the base path */}
        <Route path="item/:itemId" element={<MediaDetailView />} /> {/* Detail view */}
      </Route>
    </Routes>
  );
}

export default App; // Default export App