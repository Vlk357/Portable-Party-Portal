import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useShell } from '../../../../shell/src/app/context/ShellContext';
import { useGallery, SortOptions, FilterOptions } from '../hooks/useGallery';
import { GalleryHeader } from './GalleryHeader';
import { FilterSortPanel } from './FilterSortPanel';

// Export the context type so it can be imported where needed
export interface GalleryOutletContext {
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
export function GalleryPageLayout() {
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