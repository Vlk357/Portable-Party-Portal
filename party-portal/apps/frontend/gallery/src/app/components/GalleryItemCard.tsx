import { GalleryItem } from "../interfaces/GalleryItem";

interface GalleryItemCardProps {
  item: GalleryItem;
}

export function GalleryItemCard({ item }: GalleryItemCardProps) {
  return (
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
  );
}