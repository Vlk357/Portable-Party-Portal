import { useState, useEffect, useRef, useCallback } from 'react';
import { useShell } from '../../../shell/src/app/context/ShellContext'; // Assuming path from ChatList.tsx
import { HamburgerIcon } from '../../../shell/src/app/components/HamburgerIcon'; // Assuming path from ChatList.tsx

interface GalleryItem {
  id: number;
  userId: string;
  originalFilename: string;
  publicUrl: string;
}

export function App() {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [currentFileUpload, setCurrentFileUpload] = useState<{ name: string; progress: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toggleDrawer } = useShell();

  const fetchGalleryItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication required');

      const response = await fetch('/gallery/api/gallery_items', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/ld+json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error: ${response.status}` }));
        throw new Error(errorData.message || `Error: ${response.status}`);
      }
      const data = await response.json();
      const items = data['hydra:member'] || data.member || data || [];
      setGalleryItems(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery items');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGalleryItems();
  }, [fetchGalleryItems]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFilesToUpload(Array.from(e.target.files));
      // Automatically start upload after files are selected
      handleUpload(Array.from(e.target.files));
      // Clear the input value to allow selecting the same file(s) again
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
      }
    }
  };

  const uploadFile = (file: File): Promise<void> => {
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

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setCurrentFileUpload({ name: file.name, progress: percentComplete });
        }
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          resolve();
        } else {
          const errorText = xhr.responseText || `Upload failed: ${xhr.statusText}`;
          try {
            const errorJson = JSON.parse(xhr.responseText);
            reject(new Error(errorJson.detail || errorJson.message || errorText));
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
    let successCount = 0;

    for (const file of files) {
      try {
        await uploadFile(file);
        successCount++;
      } catch (err) {
        setError(err instanceof Error ? `Error uploading ${file.name}: ${err.message}` : `Failed to upload ${file.name}`);
        // Optionally stop on first error or continue
        // For now, we'll let it try to upload subsequent files
      }
    }

    setCurrentFileUpload(null);
    setFilesToUpload([]);
    setIsUploading(false);
    if (successCount > 0) {
      fetchGalleryItems(); // Refresh the gallery if at least one upload was successful
    }
  };
  
  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if the leave target is outside the dropzone
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDraggingOver(false);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true); // Keep it true while dragging over
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setFilesToUpload(droppedFiles);
      handleUpload(droppedFiles); // Automatically upload dropped files
      e.dataTransfer.clearData();
    }
  };

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
          <HamburgerIcon
            onClick={toggleDrawer}
            className="mr-2 text-white"
          />
          <h1 className="text-xl font-semibold">Gallery</h1>
        </div>
        <button
          onClick={openFileDialog}
          className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Upload new media"
          disabled={isUploading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </header>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple // Allow multiple file selection
        accept="image/*, video/*"
        className="hidden"
        disabled={isUploading}
      />
      
      <main className={`flex-grow p-8 overflow-y-auto relative ${isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}>
        {isDraggingOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-blue-600 text-lg font-semibold">Drop files here to upload</p>
          </div>
        )}

        {/* Upload Progress for current file */}
        {currentFileUpload && (
          <div className="bg-gray-100 p-4 rounded-lg mb-6 shadow-sm">
            <p className="text-sm mb-1">Uploading: {currentFileUpload.name}</p>
            <div className="w-full h-5 bg-gray-200 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-green-500 transition-all duration-100"
                style={{ width: `${currentFileUpload.progress}%` }}
              />
              <span className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-gray-700">
                {currentFileUpload.progress}%
              </span>
            </div>
          </div>
        )}
        
        {isUploading && !currentFileUpload && filesToUpload.length > 0 && (
           <div className="bg-gray-100 p-4 rounded-lg mb-6 shadow-sm text-center">
             <p>Preparing to upload {filesToUpload.length} file(s)...</p>
           </div>
        )}


        {/* Error Message */}
        {error && (
          <div className="text-red-700 p-4 bg-red-50 rounded-md mb-4">
            {error}
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto"></div>
            <p className="mt-2">Loading gallery items...</p>
          </div>
        )}

        {/* Gallery Grid */}
        {!isDraggingOver && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {galleryItems.length > 0 ? (
              galleryItems.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-md overflow-hidden transition-transform duration-200 hover:translate-y-[-5px] hover:shadow-lg">
                  {item.publicUrl && typeof item.publicUrl === 'string' && item.publicUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img
                      src={item.publicUrl}
                      alt={item.originalFilename}
                      loading="lazy"
                      className="w-full h-48 object-cover"
                      onError={(e) => console.error('Image load error for:', item.publicUrl, e)}
                    />
                  ) : item.publicUrl && typeof item.publicUrl === 'string' && item.publicUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                    <video controls className="w-full h-48 object-cover" onError={(e) => console.error('Video load error for:', item.publicUrl, e)}>
                      <source src={item.publicUrl} type={`video/${item.publicUrl.split('.').pop()}`} />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                      {item.publicUrl ? `Unsupported: ${item.originalFilename}` : `No URL: ${item.originalFilename}`}
                    </div>
                  )}
                  <div className="p-2 text-center truncate bg-gray-50 text-sm">
                    {item.originalFilename}
                  </div>
                </div>
              ))
            ) : (
              !isLoading && <p className="col-span-full text-center text-gray-500">No gallery items found. Drag and drop files or use the '+' button to upload.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;