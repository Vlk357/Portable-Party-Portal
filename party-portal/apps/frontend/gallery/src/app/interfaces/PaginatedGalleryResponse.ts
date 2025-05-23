import { GalleryItem } from "./GalleryItem";
import { View } from "./View";

export interface PaginatedGalleryResponse {
  '@context'?: string;
  '@id'?: string;
  '@type'?: string;
  member: GalleryItem[];
  totalItems?: number;
  view?: View;
}