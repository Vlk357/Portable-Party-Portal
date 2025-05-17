import { GalleryItem } from '../interfaces/GalleryItem';
import { GalleryItemCard } from './GalleryItemCard';

interface GalleryGridProps {
  items: GalleryItem[];
}

export function GalleryGrid({ items }: GalleryGridProps) {
  if (items.length === 0) return null; // Or a "no items" message if not handled by parent

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {items.map((item) => (
        <GalleryItemCard key={item['@id'] || `gallery-item-${item.id}`} item={item} />
      ))}
    </div>
  );
}