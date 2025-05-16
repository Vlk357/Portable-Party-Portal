import { useState, useEffect } from 'react';

interface GalleryItem {
  id: number;
  userId: string;
  originalFilename: string;
  publicUrl: string; // Changed from fileUrl to publicUrl
}

export function App() {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    fetchGalleryItems();
  }, []);

  const fetchGalleryItems = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        // setError('Authentication required'); // Set error
        // setIsLoading(false); // Stop loading
        // return; // Exit
        throw new Error('Authentication required');
      }

      const response = await fetch('/gallery/api/gallery_items', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/ld+json', // Good practice to specify accept header for API Platform
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error: ${response.status}` }));
        throw new Error(errorData.message || `Error: ${response.status}`);
      }

      const data = await response.json();
      // API Platform Hydra collections are typically in 'hydra:member'
      // If not using Hydra, it might just be an array directly or under 'member'
      setGalleryItems(data['hydra:member'] || data.member || data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery items');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/gallery/api/gallery_items', true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          // Success
          setFile(null);
          setUploadProgress(null);
          fetchGalleryItems(); // Refresh the gallery
        } else {
          setError(`Upload failed: ${xhr.statusText}`);
        }
      };

      xhr.onerror = () => {
        setError('Upload failed: Network error');
      };

      xhr.send(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Gallery</h1>
      
      {/* Upload Form */}
      <div className="bg-gray-100 p-6 rounded-lg mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Upload New Image</h2>
        <form onSubmit={handleUpload} className="flex flex-col gap-4">
          <input 
            type="file" 
            onChange={handleFileChange} 
            accept="image/*, video/*"
            className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button 
            type="submit" 
            disabled={!file}
            className={`py-2 px-4 rounded-md text-white max-w-[150px] ${
              file ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Upload
          </button>
          
          {uploadProgress !== null && (
            <div className="w-full h-5 bg-gray-200 rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
              <span className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs">
                {uploadProgress}%
              </span>
            </div>
          )}
        </form>
      </div>

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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {galleryItems.length > 0 ? (
          galleryItems.map((item) => (
            <div key={item.id} className="border border-gray-200 rounded-md overflow-hidden transition-transform duration-200 hover:translate-y-[-5px] hover:shadow-lg">
              {/* Add a check to ensure item.publicUrl exists before calling .match */}
              {item.publicUrl && item.publicUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img 
                  src={item.publicUrl} 
                  alt={item.originalFilename} 
                  loading="lazy"
                  className="w-full h-48 object-cover"
                />
              ) : item.publicUrl && item.publicUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                <video controls className="w-full h-48 object-cover">
                  <source src={item.publicUrl} type={`video/${item.publicUrl.split('.').pop()}`} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-500">
                  {item.originalFilename}
                </div>
              )}
              <div className="p-2 text-center truncate bg-gray-50">
                {item.originalFilename}
              </div>
            </div>
          ))
        ) : (
          !isLoading && <p className="col-span-full text-center text-gray-500">No gallery items found.</p>
        )}
      </div>
    </div>
  );
}

export default App;