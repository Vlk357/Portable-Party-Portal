export interface GalleryItem {
  '@id'?: string; 
  id: number;
  userId: string;
  originalFilename: string;
  publicUrl: string;
  mimeType?: string; 
  uploadedAt?: string; 
  takenAt?: string;
}