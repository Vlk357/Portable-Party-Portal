export interface UploadFeedbackProps {
  isDraggingOver: boolean;
  currentFileUpload: { name: string; progress: number } | null;
  isUploading: boolean;
  filesToUploadCount: number;
}