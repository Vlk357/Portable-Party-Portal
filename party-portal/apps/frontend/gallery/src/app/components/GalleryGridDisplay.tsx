import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { GalleryGrid } from './GalleryGrid';
import { UploadFeedback } from './UploadFeedback';
import { GalleryOutletContext } from './GalleryPageLayout';

/**
 * GalleryGridDisplay: Renders the grid and related UI elements.
 */
export function GalleryGridDisplay() {
  const {
    galleryItems,
    isLoading,
    error,
    loadMoreRef,
    isLoadingMore,
    nextPageUrl,
    filesToUpload,
    currentFileUpload,
    isUploading,
    isDraggingOver,
  } = useOutletContext<GalleryOutletContext>();

  return (
    <main
      className={`flex-grow p-4 sm:p-8 overflow-y-auto relative ${
        isDraggingOver
          ? 'bg-blue-50 border-2 border-dashed border-blue-400'
          : ''
      }`}
    >
      <UploadFeedback
        isDraggingOver={isDraggingOver}
        currentFileUpload={currentFileUpload}
        isUploading={isUploading}
        filesToUploadCount={filesToUpload.length}
      />

      {error && !isLoading && galleryItems.length === 0 && (
        <div className="text-red-600 p-3 bg-red-100 border border-red-300 rounded">
          Error: {error}
        </div>
      )}

      {isLoading && galleryItems.length === 0 && (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-3 text-gray-600">Loading gallery items...</p>
        </div>
      )}

      {!isLoading && galleryItems.length === 0 && !error && (
        <p className="col-span-full text-center text-gray-500 py-10">
          No gallery items found.
        </p>
      )}

      <GalleryGrid items={galleryItems} />

      <div
        ref={loadMoreRef}
        data-testid="load-more-trigger"
        style={{ height: '0px', width: '0%' }}
      >
        LOAD MORE TRIGGER
      </div>

      {isLoadingMore && (
        <div className="text-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading more items...</p>
        </div>
      )}

      {!isLoadingMore && !nextPageUrl && galleryItems.length > 0 && (
        <p className="text-center text-gray-500 py-4">
          You've reached the end!
        </p>
      )}
    </main>
  );
}
