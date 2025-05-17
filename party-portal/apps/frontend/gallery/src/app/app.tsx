// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/frontend/gallery/src/app/app.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useShell } from '../../../shell/src/app/context/ShellContext';
import { useGallery, SortOptions, FilterOptions } from './hooks/useGallery'; // Import types
import { GalleryHeader } from './components/GalleryHeader';
// SortControls and FilterControls are now used inside FilterSortPanel
// import { SortControls } from './components/SortControls';
// import { FilterControls } from './components/FilterControls';
import { FilterSortPanel } from './components/FilterSortPanel'; // Import the new panel
import { GalleryGrid } from './components/GalleryGrid';
import { UploadFeedback } from './components/UploadFeedback';

export function App() {
  const {
    galleryItems,
    isLoading,
    isLoadingMore,
    error,
    nextPageUrl,
    fetchGalleryItems,
    filesToUpload,
    currentFileUpload,
    isUploading,
    handleUpload,
    sortOptions,
    changeSortOptions,
    filterOptions,
    changeFilterOptions,
    clearFilters, // This will be used by the panel to signal clearing global filters
    availableUserIds,
  } = useGallery();

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toggleDrawer } = useShell();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false); // State for panel visibility

  // Infinite scroll observer setup (remains the same)
  useEffect(() => {
    if (isLoading || isLoadingMore || !nextPageUrl || !loadMoreRef.current) return;
    const currentObserver = observer.current;
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && nextPageUrl && !isLoadingMore) {
        fetchGalleryItems(false);
      }
    });
    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef && observer.current) { // Check if observer.current is not null
        observer.current.observe(currentLoadMoreRef);
    }
    return () => {
      if (currentLoadMoreRef && observer.current) { // Check if observer.current is not null
        observer.current.unobserve(currentLoadMoreRef);
      } else if (currentLoadMoreRef && currentObserver) {
        currentObserver.unobserve(currentLoadMoreRef);
      }
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

  return (
    <div
      className="flex flex-col h-screen"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      <main className={`flex-grow p-4 sm:p-8 overflow-y-auto relative ${isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}>
        <UploadFeedback
          isDraggingOver={isDraggingOver}
          currentFileUpload={currentFileUpload}
          isUploading={isUploading}
          filesToUploadCount={filesToUpload.length}
        />

        {/* FilterControls and SortControls are now inside FilterSortPanel */}
        {/* No longer directly rendered here */}

        {error && (
          <div className="my-4 text-red-700 p-4 bg-red-100 border border-red-300 rounded-md mb-4">
            <p className="font-semibold">Error:</p>
            <pre className="whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {isLoading && galleryItems.length === 0 && (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
            <p className="mt-3 text-gray-600">Loading gallery items...</p>
          </div>
        )}

        {!isLoading && galleryItems.length === 0 && !error && (
          <p className="col-span-full text-center text-gray-500 py-10">No gallery items found. Drag and drop files or use the '+' button to upload.</p>
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
          <p className="text-center text-gray-500 py-6">You've reached the end!</p>
        )}
      </main>

      <FilterSortPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        currentSortOptions={sortOptions}
        currentFilterOptions={filterOptions}
        availableUserIds={availableUserIds}
        onApply={handleApplyFiltersAndSort}
        disabled={isActionDisabled}
      />
    </div>
  );
}

export default App;