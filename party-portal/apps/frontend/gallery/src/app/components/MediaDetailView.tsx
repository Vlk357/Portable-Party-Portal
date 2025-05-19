import React, { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { GalleryItem } from '../interfaces/GalleryItem';

// Basic Back Arrow Icon
const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

export function MediaDetailView() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Attempt to get item from location state
  const item = location.state?.item as GalleryItem | undefined;

  useEffect(() => {
    if (!item) {
      // This redirect is for direct URL access without state
      navigate('/app/gallery', { replace: true });
    }
  }, [item, itemId, navigate]);

  const handleGoBack = () => {
    // Prefer navigate(-1) if the history stack is reliable for "back" behavior
    // Otherwise, navigate to a known gallery path.
    if (location.key !== "default" && location.pathname !== "/app/gallery") { // Check if there's history to go back to
        navigate(-1);
    } else {
        navigate('/app/gallery');
    }
  };

  if (!item) {
    return (
        <div className="flex flex-col h-screen bg-black text-white items-center justify-center">
            <p>Loading details...</p>
        </div>
    );
  }

  // Optional: Validate if the item from state matches the itemId from URL
  // This can help catch inconsistencies but might be overly strict if item.id is a number and itemId is a string.
  if (String(item.id) !== itemId) {
    console.warn(
      `MediaDetailView: Item ID from state ('${item.id}') does not match URL param ('${itemId}'). Using item from state.`
    );
    // Decide if this is an error state or acceptable. For now, we proceed with the item from state.
  }

  const isImage = item.mimeType?.startsWith('image/');
  const isVideo = item.mimeType?.startsWith('video/');

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-white text-black p-4 shadow-md flex justify-between items-center flex-shrink-0 h-16 z-10">
        <button onClick={handleGoBack} className="p-2 rounded-full hover:bg-gray-200" aria-label="Go back">
          <BackArrowIcon />
        </button>
        <div className="text-center truncate mx-2 flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate" title={item.originalFilename}>
                {item.originalFilename}
            </h1>
            {item.userId && <p className="text-xs text-gray-600 truncate">Uploaded by: {item.userId}</p>}
        </div>
        {/* Placeholder for Auto-flip button */}
        <div className="w-8 h-8"></div> 
      </header>

      {/* Media Display Area */}
      <main className="flex-grow flex items-center justify-center overflow-hidden p-1 relative">
        {isImage && item.publicUrl && (
          <img
            src={item.publicUrl}
            alt={item.originalFilename || 'Gallery image'}
            className="max-w-full max-h-full object-contain"
          />
        )}
        {isVideo && item.publicUrl && (
          <video
            src={item.publicUrl}
            controls
            className="max-w-full max-h-full object-contain"
          >
            Your browser does not support the video tag.
          </video>
        )}
        {/* Handle cases where item exists but is not image/video or has no publicUrl */}
        {(!isImage && !isVideo && item.publicUrl) && (
          <div className="text-gray-400">Unsupported media type.</div>
        )}
        {!item.publicUrl && (
            <div className="text-gray-400">Media URL is not available.</div>
        )}
      </main>
    </div>
  );
}