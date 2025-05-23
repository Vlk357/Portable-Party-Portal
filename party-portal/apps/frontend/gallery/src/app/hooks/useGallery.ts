import { useState, useEffect, useCallback } from 'react';
import { GalleryItem } from '../interfaces/GalleryItem';
import { PaginatedGalleryResponse } from '../interfaces/PaginatedGalleryResponse';

// Updated SortField to include userId
export type SortField = 'takenAt' | 'uploadedAt' | 'originalFilename' | 'mimeType' | 'id' | 'userId';
export type SortDirection = 'asc' | 'desc';

export interface SortOptions {
  field: SortField;
  direction: SortDirection;
}

// Define types for filter values
export interface FilterOptions {
  userIds?: string[]; // Changed from userId to userIds
  uploadedAtAfter?: string; // YYYY-MM-DD
  takenAtBefore?: string;   // YYYY-MM-DD
  takenAtAfter?: string;    // YYYY-MM-DD
  mimeType?: string;
}

const DEFAULT_SORT_OPTIONS: SortOptions = { field: 'takenAt', direction: 'desc' };
export const DEFAULT_FILTER_OPTIONS: FilterOptions = { userIds: [] }; // Updated for userIds
const API_BASE_URL = '/gallery/api/gallery_items';

export function useGallery() {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
  const [sortOptions, setSortOptions] = useState<SortOptions>(DEFAULT_SORT_OPTIONS);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(DEFAULT_FILTER_OPTIONS);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [currentFileUpload, setCurrentFileUpload] = useState<{ name: string; progress: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [availableUserIds, setAvailableUserIds] = useState<string[]>([]);

  const buildApiUrl = useCallback((pageUrl?: string | null, isInitial = false) => {
    const baseUrl = pageUrl ? new URL(pageUrl, window.location.origin) : new URL(API_BASE_URL, window.location.origin);
    const params = baseUrl.searchParams;

    if (isInitial || !pageUrl) {
      params.set('page', '1');
    }

    // Always apply current sort options
    params.set(`order[${sortOptions.field}]`, sortOptions.direction);

    // Apply filter options
    // Handle userIds filter first
    params.delete('userId[]'); // Clear any existing userId[] params from previous state or pageUrl
    if (filterOptions.userIds && filterOptions.userIds.length > 0) {
      filterOptions.userIds.forEach(uid => params.append('userId[]', uid));
    }

    // Handle other filters
    Object.entries(filterOptions).forEach(([key, value]) => {
      if (key === 'userIds') return; // Already handled

      if (value) { // Only add filter if value is present
        if (key === 'uploadedAtAfter') params.set('uploadedAt[after]', String(value));
        else if (key === 'takenAtBefore') params.set('takenAt[before]', String(value));
        else if (key === 'takenAtAfter') params.set('takenAt[after]', String(value));
        else params.set(key, String(value));
      } else { // Remove filter if value is cleared
        if (key === 'uploadedAtAfter') params.delete('uploadedAt[after]');
        else if (key === 'takenAtBefore') params.delete('takenAt[before]');
        else if (key === 'takenAtAfter') params.delete('takenAt[after]');
        else params.delete(key);
      }
    });
    
    // Clean up order params if pageUrl already had them
    for (const k of Array.from(params.keys())) {
        if (k.startsWith('order[') && k !== `order[${sortOptions.field}]`) {
            params.delete(k);
        }
    }

    return `${baseUrl.pathname}?${params.toString()}`;
  }, [sortOptions, filterOptions]);

  const fetchGalleryItems = useCallback(async (isInitialLoad = false) => {
    // buildApiUrl now incorporates sort and filter options
    const urlToFetch = buildApiUrl(isInitialLoad ? null : nextPageUrl, isInitialLoad);

    if (isInitialLoad) setIsLoading(true);
    else setIsLoadingMore(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication required');

      console.log('Fetching gallery items from URL:', urlToFetch); // For debugging
      const response = await fetch(urlToFetch, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: { message?: string; detail?: string; title?: string } = {};
        try { errorData = JSON.parse(errorText || '{}'); }
        catch (e) { throw new Error(errorText || `Error: ${response.status}`); }
        throw new Error(errorData.message || errorData.detail || errorData.title || `Error: ${response.status}`);
      }

      const data: PaginatedGalleryResponse = await response.json();
      const newItems = data.member || [];

      setGalleryItems(prevItems =>
        isInitialLoad
          ? newItems
          : [...prevItems, ...newItems.filter((newItem: GalleryItem) => !prevItems.find(item => item.id === newItem.id))]
      );
      setNextPageUrl(data.view?.next ?? null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery items');
      console.error("Error fetching gallery items:", err); // For debugging
    } finally {
      if (isInitialLoad) setIsLoading(false);
      else setIsLoadingMore(false);
    }
  }, [nextPageUrl, buildApiUrl]);

  useEffect(() => {
    // This effect runs when sortOptions or filterOptions change.
    console.log('Sort or Filter options changed, refetching items. Sort:', sortOptions, "Filters:", filterOptions);
    setGalleryItems([]);
    setNextPageUrl(null);
    fetchGalleryItems(true);
  }, [sortOptions, filterOptions]);

  const uploadFileInternal = useCallback(/* ... unchanged ... */ (file: File): Promise<GalleryItem> => {
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
          } catch (_parseError) { 
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
  }, []);


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
      console.log('Upload successful, refetching items.');
      setGalleryItems([]); 
      setNextPageUrl(null);
      fetchGalleryItems(true);
    }
  }, [uploadFileInternal, fetchGalleryItems]);

  const changeSortOptions = (newSortOptions: Partial<SortOptions>) => {
    setSortOptions(prev => ({ ...prev, ...newSortOptions }));
  };

  // New function to change filter options
  const changeFilterOptions = (newFilters: Partial<FilterOptions>) => {
    setFilterOptions(prev => ({ ...prev, ...newFilters }));
  };
  
  // clearFilters should also reset userIds correctly
  const clearFilters = () => {
    setFilterOptions(DEFAULT_FILTER_OPTIONS); // This now correctly sets userIds: []
  };

  const fetchAvailableUserIds = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token found, cannot fetch user IDs.');
        return;
      }
      // Adjust API_BASE_URL or use a full path if necessary
      const response = await fetch(`${API_BASE_URL}/user_ids`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch user IDs: ${response.statusText}`);
      }
      const data: string[] = await response.json();
      setAvailableUserIds(data);
    } catch (error) {
      console.error("Error fetching available user IDs:", error);
      // Optionally set an error state here
    }
  }, []);

  useEffect(() => {
    fetchAvailableUserIds();
  }, [fetchAvailableUserIds]);


  return {
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
    clearFilters,
    availableUserIds,
  };
}