import { Link } from 'react-router-dom'; // Import Link!
import { GalleryItem } from "../interfaces/GalleryItem";

interface GalleryItemCardProps {
  item: GalleryItem;
}

export function GalleryItemCard({ item }: GalleryItemCardProps) {
  const detailUrl = `item/${item.id}`; // Relative path for the link

  return (
    <Link
      to={detailUrl}
      state={{ item: item }} // Pass the item data in location.state
      className="block border border-gray-200 rounded-md overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
      // Add a key here if GalleryItemCard is directly mapped in GalleryGrid without a parent div per item
      key={item['@id'] || `gallery-item-link-${item.id}`}
    >
      {/* The visual content of the card remains the same */}
      {item.publicUrl && item.mimeType && item.mimeType.startsWith('image/') ? (
        <img
          src={item.publicUrl} alt={item.originalFilename} loading="lazy"
          className="w-full h-48 object-cover"
          onError={(e) => console.error('Image load error for:', item.publicUrl, e)}
        />
      ) : item.publicUrl && item.mimeType && item.mimeType.startsWith('video/') ? (
        <div className="w-full h-48 bg-black relative">
            <video preload="metadata" className="w-full h-full object-cover" muted loop playsInline>
              <source src={`${item.publicUrl}#t=0.1`} type={item.mimeType} />
            </video>
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 24 24" strokeWidth={1.5} stroke="white" className="w-12 h-12 opacity-80">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            </div>
          </div>
      ) : (
        <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-500 text-xs p-2 text-center">
          {item.originalFilename || 'Media preview unavailable'}
        </div>
      )}
      <div className="p-2 text-center truncate bg-gray-50 text-sm text-gray-700" title={item.originalFilename}>
        {item.originalFilename}
      </div>
    </Link>
  );
}