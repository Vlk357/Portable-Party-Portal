// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/frontend/gallery/src/app/app.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Outlet, useLocation, useOutletContext } from 'react-router-dom'; // Ensure all are imported
import { useShell } from '../../../shell/src/app/context/ShellContext';
import { useGallery, SortOptions, FilterOptions } from './hooks/useGallery';
import { GalleryHeader } from './components/GalleryHeader';
import { FilterSortPanel } from './components/FilterSortPanel';
import { GalleryGrid } from './components/GalleryGrid';
import { UploadFeedback } from './components/UploadFeedback';
import { MediaDetailView } from './components/MediaDetailView'; // Import MediaDetailView

// Interface for the context passed from GalleryPageLayout
interface GalleryOutletContext {
  galleryItems: ReturnType<typeof useGallery>['galleryItems'];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  nextPageUrl: string | null;
  loadMoreRef: React.RefObject<HTMLDivElement>;
  filesToUpload: ReturnType<typeof useGallery>['filesToUpload'];
  currentFileUpload: ReturnType<typeof useGallery>['currentFileUpload'];
  isUploading: boolean;
  isDraggingOver: boolean;
}

/**
 * GalleryPageLayout: Manages core gallery state, conditionally renders GalleryHeader,
 * and provides an Outlet for child routes (grid or detail view).
 */
function GalleryPageLayout() {
  const {
    galleryItems, isLoading, isLoadingMore, error, nextPageUrl, fetchGalleryItems,
    filesToUpload, currentFileUpload, isUploading, handleUpload,
    sortOptions, changeSortOptions, filterOptions, changeFilterOptions, availableUserIds,
  } = useGallery();

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toggleDrawer } = useShell();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const location = useLocation(); // Get location

  useEffect(() => { // Infinite scroll
    if (isLoading || isLoadingMore || !nextPageUrl || !loadMoreRef.current) return;
    const currentObserver = observer.current;
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && nextPageUrl && !isLoadingMore) fetchGalleryItems(false);
    });
    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef && observer.current) observer.current.observe(currentLoadMoreRef);
    return () => {
      if (currentLoadMoreRef && observer.current) observer.current.unobserve(currentLoadMoreRef);
      else if (currentLoadMoreRef && currentObserver) currentObserver.unobserve(currentLoadMoreRef);
    };
  }, [fetchGalleryItems, isLoading, isLoadingMore, nextPageUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openFileDialog = () => fileInputRef.current?.click();

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget.contains(e.relatedTarget as Node)) return; setIsDraggingOver(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const handleApplyFiltersAndSort = (newSort: SortOptions, newFilters: FilterOptions) => {
    // Check if sort options actually changed
    if (JSON.stringify(newSort) !== JSON.stringify(sortOptions)) {
      changeSortOptions(newSort);
    }
    // Check if filter options actually changed
    if (JSON.stringify(newFilters) !== JSON.stringify(filterOptions)) {
      changeFilterOptions(newFilters);
    }
    // If neither changed, but the user hit apply, we might still want to close the panel
    // or the panel's apply button could be disabled if no pending changes.
    // The useGallery hook's useEffect will trigger fetch if options changed.
  };
  
  const toggleFilterPanel = () => setIsFilterPanelOpen(prev => !prev);

  const isActionDisabled = isUploading || isLoading || isLoadingMore;

  const isOnDetailPage = location.pathname.includes('/item/');

  const outletContextData: GalleryOutletContext = {
    galleryItems, isLoading, isLoadingMore, error, nextPageUrl, loadMoreRef,
    filesToUpload, currentFileUpload, isUploading, isDraggingOver
  };

  return (
    <div
      className="flex flex-col h-screen bg-gray-50"
      onDragEnter={!isOnDetailPage ? handleDragEnter : undefined}
      onDragOver={!isOnDetailPage ? handleDragOver : undefined}
      onDragLeave={!isOnDetailPage ? handleDragLeave : undefined}
      onDrop={!isOnDetailPage ? handleDrop : undefined}
    >
      {!isOnDetailPage && (
        <>
          <GalleryHeader
            onToggleDrawer={toggleDrawer}
            onOpenFileDialog={openFileDialog}
            onToggleFilterPanel={toggleFilterPanel} // Pass handler
            isActionDisabled={isActionDisabled}
          />

          <input
            type="file" ref={fileInputRef} onChange={handleFileChange}
            multiple accept="image/*, video/*, video/x-matroska" className="hidden"
            disabled={isActionDisabled}
          />
        </>
      )}
      
      <Outlet context={outletContextData} /> {/* THIS IS WHERE MediaDetailView or GalleryGridDisplay WILL RENDER */}

      {!isOnDetailPage && (
         <FilterSortPanel
          isOpen={isFilterPanelOpen}
          onClose={() => setIsFilterPanelOpen(false)}
          currentSortOptions={sortOptions}
          currentFilterOptions={filterOptions}
          availableUserIds={availableUserIds}
          onApply={handleApplyFiltersAndSort}
          disabled={isActionDisabled}
        />
      )}
    </div>
  );
}

/**
 * GalleryGridDisplay: Renders the grid and related UI elements.
 */
function GalleryGridDisplay() {
  const { 
    galleryItems, isLoading, error, loadMoreRef, isLoadingMore, nextPageUrl,
    filesToUpload, currentFileUpload, isUploading, isDraggingOver
  } = useOutletContext<GalleryOutletContext>();
  
  return (
    <main className={`flex-grow p-4 sm:p-8 overflow-y-auto relative ${isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}>
      <UploadFeedback
        isDraggingOver={isDraggingOver}
        currentFileUpload={currentFileUpload}
        isUploading={isUploading}
        filesToUploadCount={filesToUpload.length}
      />

      {error && !isLoading && galleryItems.length === 0 && (
        <div className="text-red-600 p-3 bg-red-100 border border-red-300 rounded">Error: {error}</div>
      )}

      {isLoading && galleryItems.length === 0 && (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-3 text-gray-600">Loading gallery items...</p>
        </div>
      )}

      {!isLoading && galleryItems.length === 0 && !error && (
        <p className="col-span-full text-center text-gray-500 py-10">No gallery items found.</p>
      )}

      <GalleryGrid items={galleryItems} />

      <div ref={loadMoreRef} style={{ height: '1px' }} />

      {isLoadingMore && (
         <div className="text-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading more items...</p>
        </div>
      )}

      {!isLoadingMore && !nextPageUrl && galleryItems.length > 0 && (
        <p className="text-center text-gray-500 py-4">You've reached the end!</p>
      )}
    </main>
  );
}

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