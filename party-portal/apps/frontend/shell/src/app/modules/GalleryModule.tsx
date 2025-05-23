import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Lazy load the Gallery app
const GalleryApp = lazy(() => import('../../../../gallery/src/app/app'));

export function GalleryModule() {
  return (
    <Suspense fallback={<div>Loading Gallery Module...</div>}>
      <Routes>
        <Route path="*" element={<GalleryApp />} />
      </Routes>
    </Suspense>
  );
}