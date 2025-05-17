import { useState, useEffect, useCallback } from 'react';
import { GalleryItem } from '../interfaces/GalleryItem';
import { PaginatedGalleryResponse } from '../interfaces/PaginatedGalleryResponse';

export type SortField = 'takenAt' | 'uploadedAt' | 'originalFilename' | 'mimeType' | 'id';
export type SortDirection = 'asc' | 'desc';

export interface SortOptions {
  field: SortField;
  direction: SortDirection;
}

const DEFAULT_SORT_OPTIONS: SortOptions = { field: 'takenAt', direction: 'desc' };
const API_BASE_URL = '/gallery/api/gallery_items';

export function useGallery() {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
  const [sortOptions, setSortOptions] = useState<SortOptions>(DEFAULT_SORT_OPTIONS);

  const [filesToUpload, setFilesToUpload] = useState<File[]>([]); // Used for UI feedback
  const [currentFileUpload, setCurrentFileUpload] = useState<{ name: string; progress: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const buildApiUrl = useCallback((pageUrl?: string | null, isInitial = false) => {
    if (isInitial || !pageUrl) {
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append(`order[${sortOptions.field}]`, sortOptions.direction);
      return `${API_BASE_URL}?${params.toString()}`;
    }
    if (pageUrl) {
        try {
            const url = new URL(pageUrl, window.location.origin);
            url.searchParams.set(`order[${sortOptions.field}]`, sortOptions.direction);
            if (!url.searchParams.has('page')) {
                 const pathSegments = url.pathname.split('/');
                 const potentialPage = pathSegments[pathSegments.length -1];
                 if (!isNaN(parseInt(potentialPage))) {
                    url.searchParams.set('page', potentialPage);
                 } else if (!isInitial) {
                    console.warn("Next page URL doesn't seem to have a page number, defaulting to 1 for safety:", pageUrl);
                    url.searchParams.set('page', '1');
                 }
            }
            return url.pathname + url.search;
        } catch (e) {
            console.error("Error parsing nextPageUrl, falling back to initial build:", e);
             const params = new URLSearchParams();
            params.append('page', '1');
            params.append(`order[${sortOptions.field}]`, sortOptions.direction);
            return `${API_BASE_URL}?${params.toString()}`;
        }
    }
    const fallbackParams = new URLSearchParams();
    fallbackParams.append('page', '1');
    fallbackParams.append(`order[${sortOptions.field}]`, sortOptions.direction);
    return `${API_BASE_URL}?${fallbackParams.toString()}`;
  }, [sortOptions]);

  const fetchGalleryItems = useCallback(async (isInitialLoad = false) => {
    const urlToFetch = buildApiUrl(isInitialLoad ? null : nextPageUrl, isInitialLoad);

    if (isInitialLoad) {
      setIsLoading(true);
      // When it's an initial load (e.g. due to sort change),
      // we should clear existing items and reset pagination *before* fetching.
      // This is now handled in the useEffect below.
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication required');

      const response = await fetch(urlToFetch, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: { message?: string; detail?: string; title?: string } = {};
        try {
          errorData = JSON.parse(errorText || '{}');
        } catch (e) {
          console.error("Failed to parse error response JSON:", e);
          throw new Error(errorText || `Error: ${response.status}`);
        }
        throw new Error(errorData.message || errorData.detail || errorData.title || `Error: ${response.status}`);
      }

      const data: PaginatedGalleryResponse = await response.json();
      const newItems = data.member || [];

      setGalleryItems(prevItems =>
        isInitialLoad
          ? newItems // Replace items on initial load
          : [...prevItems, ...newItems.filter((newItem: GalleryItem) => !prevItems.find(item => item.id === newItem.id))] // Append for "load more"
      );
      setNextPageUrl(data.view?.next ?? null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery items');
    } finally {
      if (isInitialLoad) setIsLoading(false);
      else setIsLoadingMore(false);
    }
  }, [nextPageUrl, buildApiUrl]); // buildApiUrl depends on sortOptions

  useEffect(() => {
    // This effect runs when sortOptions change.
    // It should reset the gallery and trigger a new initial fetch.
    console.log('Sort options changed, refetching items:', sortOptions);
    setGalleryItems([]); // Clear current items
    setNextPageUrl(null); // Reset pagination
    // setIsLoading(true); // Set loading state immediately
    fetchGalleryItems(true); // Perform the initial fetch with new sort options
  }, [sortOptions]); // Only depend on sortOptions. fetchGalleryItems will use the latest sortOptions via buildApiUrl.

  const uploadFileInternal = useCallback((file: File): Promise<GalleryItem> => { // Renamed to avoid conflict if we expose a different 'uploadFile'
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('token');
      if (!token) {
        reject(new Error('Authentication required'));
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      setCurrentFileUpload({ name: file.name, progress: 0 });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE_URL, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/ld+json');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setCurrentFileUpload({ name: file.name, progress: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => {
        if (xhr.status === 201) {
          try {
            const newItemData = JSON.parse(xhr.responseText);
            resolve(newItemData as GalleryItem);
          } catch (_parseError) { // Prefixing with _ signals it's intentionally unused
            reject(new Error('Failed to parse server response.'));
          }
        } else {
          try {
            const errorJson = JSON.parse(xhr.responseText);
            reject(new Error(errorJson.detail || errorJson.message || errorJson.title || `Upload failed: ${xhr.statusText}`));
          } catch {
            reject(new Error(xhr.responseText || `Upload failed: ${xhr.statusText}`));
          }
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed: Network error'));
      xhr.send(formData);
    });
  }, []); // Empty dependency array: relies on no props or state from the hook's direct scope

  const handleUpload = useCallback(async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;
    setFilesToUpload(incomingFiles);
    setIsUploading(true);
    setError(null);
    const successfullyUploadedItems: GalleryItem[] = [];

    for (const file of incomingFiles) {
      try {
        const newItem = await uploadFileInternal(file);
        successfullyUploadedItems.push(newItem);
      } catch (err) {
        setError(prev => `${prev ? prev + '\n' : ''}Error uploading ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setCurrentFileUpload(null);
    setFilesToUpload([]);
    setIsUploading(false);

    if (successfullyUploadedItems.length > 0) {
      // Refetch to ensure new items are displayed according to current sort order
      console.log('Upload successful, refetching items to include new uploads in sorted order.');
      setGalleryItems([]); // Optional: clear items for a cleaner refresh, or let fetchGalleryItems(true) handle it
      setNextPageUrl(null);
      // setIsLoading(true);
      fetchGalleryItems(true);
    }
  }, [uploadFileInternal, fetchGalleryItems]); // fetchGalleryItems is a dependency here

  const changeSortOptions = (newSortOptions: Partial<SortOptions>) => {
    setSortOptions(prev => ({ ...prev, ...newSortOptions }));
  };

  return {
    galleryItems,
    isLoading,
    isLoadingMore,
    error,
    nextPageUrl,         // Added
    fetchGalleryItems,
    filesToUpload,       // Added (for UI count)
    currentFileUpload,
    isUploading,
    handleUpload,        // Added (this is the function app.tsx calls)
    sortOptions,
    changeSortOptions,   // Added
    // setSortOptions, // Not directly exposed, changeSortOptions is the interface
    // uploadFileInternal, // Not exposed, handleUpload is the public API
  };
}