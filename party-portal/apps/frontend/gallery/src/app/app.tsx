import { useState, useEffect, useRef, useCallback } from 'react';
import { useShell } from '../../../shell/src/app/context/ShellContext';
import { HamburgerIcon } from '../../../shell/src/app/components/HamburgerIcon';

interface GalleryItem {
  '@id'?: string; 
  id: number;
  userId: string;
  originalFilename: string;
  publicUrl: string;
  mimeType?: string; 
  uploadedAt?: string; 
}

// Updated to match actual API response
interface View { // Renamed from HydraView for clarity, as prefixes are not consistently used
  '@id': string;
  '@type': string;
  first?: string; // No 'hydra:' prefix
  last?: string;  // No 'hydra:' prefix
  previous?: string; // No 'hydra:' prefix
  next?: string;  // No 'hydra:' prefix
}

interface PaginatedGalleryResponse {
  '@context'?: string;
  '@id'?: string;
  '@type'?: string;
  member: GalleryItem[];         // No 'hydra:' prefix
  totalItems?: number;          // No 'hydra:' prefix
  view?: View;                  // No 'hydra:' prefix, and uses the updated View interface
}


export function App() {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true); 
  const [isLoadingMore, setIsLoadingMore] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [currentFileUpload, setCurrentFileUpload] = useState<{ name: string; progress: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toggleDrawer } = useShell();

  const [nextPageUrl, setNextPageUrl] = useState<string | null>('/gallery/api/gallery_items?page=1');
  const observer = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null); 

  const fetchGalleryItems = useCallback(async (url: string, isInitialLoad = false) => {
    console.log(`[fetchGalleryItems] Called with URL: ${url}, isInitialLoad: ${isInitialLoad}`); 
    if (!url) {
      console.warn('[fetchGalleryItems] URL is null, returning.');
      return;
    }

    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication required');

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/ld+json', 
        }
      });

      console.log(`[fetchGalleryItems] Response status: ${response.status}`);
      console.log(`[fetchGalleryItems] Response Content-Type: ${response.headers.get('Content-Type')}`);

      if (!response.ok) {
        const errorText = await response.text(); 
        console.error('[fetchGalleryItems] Response not OK. Raw error response:', errorText);
        const errorData = JSON.parse(errorText || '{}'); 
        throw new Error(errorData.message || errorData.detail || errorData.title || `Error: ${response.status}`);
      }

      const rawText = await response.text();
      console.log('[fetchGalleryItems] Raw response text:', rawText);

      const data: PaginatedGalleryResponse = JSON.parse(rawText);
      console.log('[fetchGalleryItems] Parsed data object:', data); 

      // CORRECTED PROPERTY ACCESS:
      const newItems = data.member || []; 
      
      console.log('[fetchGalleryItems] Extracted new items:', newItems); 
      
      setGalleryItems(prevItems => {
        if (isInitialLoad) {
          console.log('[fetchGalleryItems] Updating galleryItems state (initial load). New/Updated length:', newItems.length);
          return newItems; // For initial load, just set the new items
        } else {
          // For subsequent loads (infinite scroll), filter out duplicates based on item.id
          const existingIds = new Set(prevItems.map(item => item.id)); // Consistently use item.id
          const uniqueNewItems = newItems.filter(newItem => !existingIds.has(newItem.id)); // Consistently use newItem.id
          
          if (uniqueNewItems.length < newItems.length) {
            // Added more detailed logging for duplicates
            const newItemsIds = newItems.map(i => i.id);
            const duplicateIdsInNewBatch = newItemsIds.filter(id => existingIds.has(id));
            console.warn(
              `[fetchGalleryItems] Filtered out duplicate items. Original new: ${newItems.length}, Unique new: ${uniqueNewItems.length}. IDs of all fetched new items: [${newItemsIds.join(', ')}]. IDs of duplicates already in galleryItems: [${duplicateIdsInNewBatch.join(', ')}]`
            );
          }

          const updatedItems = [...prevItems, ...uniqueNewItems];
          console.log('[fetchGalleryItems] Updating galleryItems state (load more). Prev length:', prevItems.length, 'Unique new added:', uniqueNewItems.length, 'New/Updated length:', updatedItems.length); 
          return updatedItems;
        }
      });

      // CORRECTED PROPERTY ACCESS:
      const nextUrl = data.view && data.view.next ? data.view.next : null;
      setNextPageUrl(nextUrl);
      console.log('[fetchGalleryItems] Next page URL set to:', nextUrl); 


    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load gallery items';
      setError(errorMessage);
      console.error('[fetchGalleryItems] Error in catch block:', errorMessage, err); 
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
        console.log('[fetchGalleryItems] setIsLoading(false) for initial load.'); 
      } else {
        setIsLoadingMore(false);
        console.log('[fetchGalleryItems] setIsLoadingMore(false) for subsequent load.'); 
      }
    }
  }, []); 

  useEffect(() => {
    // Fetch initial items if:
    // 1. We have the initial page URL.
    // 2. There are no items yet.
    // 3. We are not currently in any loading state (isLoading or isLoadingMore).
    // This check is primarily for subsequent calls if items were cleared, etc.

    // For the very first mount, isLoading is true. We want to fetch in this case.
    const isFirstPage = nextPageUrl === '/gallery/api/gallery_items?page=1';
    const noItemsLoaded = galleryItems.length === 0;

    if (isFirstPage && noItemsLoaded) {
      // If isLoading is true, it means this is the very first attempt to load.
      // If isLoading is false, it means something else might have set it to false,
      // and we should only refetch if not already loading more.
      if (isLoading || (!isLoading && !isLoadingMore)) {
        console.log(`[useEffect initialLoad] Conditions met (isFirstPage: ${isFirstPage}, noItemsLoaded: ${noItemsLoaded}, isLoading: ${isLoading}, isLoadingMore: ${isLoadingMore}). Calling fetchGalleryItems.`);
        fetchGalleryItems('/gallery/api/gallery_items?page=1', true);
      }
    }
  }, [fetchGalleryItems, nextPageUrl, galleryItems.length, isLoading, isLoadingMore]);


  useEffect(() => {
    console.log(`[useEffect observerSetup] isLoading: ${isLoading}, isLoadingMore: ${isLoadingMore}, nextPageUrl: ${nextPageUrl}, loadMoreRef.current: ${!!loadMoreRef.current}`); 
    if (isLoading || isLoadingMore || !nextPageUrl || !loadMoreRef.current) return;

    const currentObserver = observer.current; 

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && nextPageUrl && !isLoadingMore) { 
        console.log('[IntersectionObserver] Triggered, fetching next page:', nextPageUrl); 
        fetchGalleryItems(nextPageUrl, false); 
      }
    });

    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef) {
      observer.current.observe(currentLoadMoreRef);
      console.log('[useEffect observerSetup] Observer attached.'); 
    }

    return () => {
      if (currentLoadMoreRef && observer.current) {
        observer.current.unobserve(currentLoadMoreRef);
        console.log('[useEffect observerSetup] Observer detached (observer.current).'); 
      } else if (currentLoadMoreRef && currentObserver) { 
        currentObserver.unobserve(currentLoadMoreRef);
        console.log('[useEffect observerSetup] Observer detached (currentObserver).'); 
      }
    };
  }, [fetchGalleryItems, isLoading, isLoadingMore, nextPageUrl]); 


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFilesToUpload(prevFiles => [...prevFiles, ...newFiles]); 
      handleUpload(newFiles); 
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
      }
    }
  };

  const uploadFile = (file: File): Promise<GalleryItem> => { 
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
      xhr.open('POST', '/gallery/api/gallery_items', true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/ld+json'); 

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setCurrentFileUpload({ name: file.name, progress: percentComplete });
        }
      };
      xhr.onload = () => {
        if (xhr.status === 201) { 
          try {
            const newItemData = JSON.parse(xhr.responseText);
            // Ensure the resolved object matches GalleryItem structure
            const newItem: GalleryItem = {
              id: newItemData.id,
              userId: newItemData.userId,
              originalFilename: newItemData.originalFilename,
              publicUrl: newItemData.publicUrl,
              mimeType: newItemData.mimeType,
              uploadedAt: newItemData.uploadedAt,
              '@id': newItemData['@id'],
            };
            resolve(newItem); 
          } catch (parseError) {
            reject(new Error('Failed to parse server response after upload.'));
          }
        } else {
          const errorText = xhr.responseText || `Upload failed: ${xhr.statusText}`;
          try {
            const errorJson = JSON.parse(xhr.responseText);
            reject(new Error(errorJson.detail || errorJson.message || errorJson.title || errorText));
          } catch {
            reject(new Error(errorText));
          }
        }
      };
      xhr.onerror = () => {
        reject(new Error('Upload failed: Network error'));
      };
      xhr.send(formData);
    });
  };

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    const successfullyUploadedItems: GalleryItem[] = [];

    for (const file of files) {
      try {
        const newItem = await uploadFile(file); 
        if (newItem) { 
          successfullyUploadedItems.push(newItem);
        }
      } catch (err) {
        setError(prevError => 
          prevError 
          ? `${prevError}\nError uploading ${file.name}: ${err instanceof Error ? err.message : String(err)}`
          : `Error uploading ${file.name}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    setCurrentFileUpload(null);
    setFilesToUpload([]); 
    setIsUploading(false);

    if (successfullyUploadedItems.length > 0) {
      setGalleryItems(prevItems => [...successfullyUploadedItems, ...prevItems]);
    }
  };
  
  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); 
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setFilesToUpload(prev => [...prev, ...droppedFiles]);
      handleUpload(droppedFiles);
      e.dataTransfer.clearData();
    }
  };

  console.log(`[Render] isLoading: ${isLoading}, galleryItems.length: ${galleryItems.length}, error: ${error}, nextPageUrl: ${nextPageUrl}`); 

  return (
    <div 
      className="flex flex-col h-screen"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center flex-shrink-0">
        <div className="flex items-center">
          <HamburgerIcon onClick={toggleDrawer} className="mr-2 text-white" />
          <h1 className="text-xl font-semibold">Gallery</h1>
        </div>
        <button
          onClick={openFileDialog}
          className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Upload new media"
          disabled={isUploading || isLoading || isLoadingMore} 
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </header>

      <input
        type="file" ref={fileInputRef} onChange={handleFileChange}
        multiple accept="image/*, video/*, video/x-matroska" className="hidden" disabled={isUploading || isLoading || isLoadingMore}
      />
      
      <main className={`flex-grow p-4 sm:p-8 overflow-y-auto relative ${isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}>
        {isDraggingOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <p className="text-blue-600 text-lg font-semibold bg-white p-4 rounded-md shadow-lg">Drop files here to upload</p>
          </div>
        )}

        {currentFileUpload && (
          <div className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-gray-700 text-white p-4 rounded-lg mb-6 shadow-lg z-50 w-11/12 max-w-md">
            <p className="text-sm mb-1">Uploading: {currentFileUpload.name}</p>
            <div className="w-full h-5 bg-gray-600 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-green-500 transition-all duration-100"
                style={{ width: `${currentFileUpload.progress}%` }}
              />
              <span className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-gray-100">
                {currentFileUpload.progress}%
              </span>
            </div>
          </div>
        )}
        
        {isUploading && !currentFileUpload && filesToUpload.length > 0 && (
           <div className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-gray-700 text-white p-4 rounded-lg mb-6 shadow-lg z-50 text-center">
             <p>Preparing to upload {filesToUpload.length} file(s)...</p>
           </div>
        )}

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

        {galleryItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {galleryItems.map((item) => (
              <div key={item['@id'] || `gallery-item-${item.id}`} className="border border-gray-200 rounded-md overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg">
                {item.publicUrl && item.mimeType && item.mimeType.startsWith('image/') ? (
                  <img
                    src={item.publicUrl} alt={item.originalFilename} loading="lazy"
                    className="w-full h-48 object-cover"
                    onError={(e) => console.error('Image load error for:', item.publicUrl, e)}
                  />
                ) : item.publicUrl && item.mimeType && item.mimeType.startsWith('video/') ? (
                  <video controls preload="metadata" className="w-full h-48 object-cover bg-black" onError={(e) => console.error('Video load error for:', item.publicUrl, e)}>
                    <source src={item.publicUrl} type={item.mimeType} />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                    {item.originalFilename || 'Media preview unavailable'}
                  </div>
                )}
                <div className="p-2 text-center truncate bg-gray-50 text-sm text-gray-700" title={item.originalFilename}>
                  {item.originalFilename}
                </div>
              </div>
            ))}
          </div>
        )}
        
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
    </div>
  );
}

export default App;