import { UploadFeedbackProps } from "../interfaces/UploadFeedbackProps";

export function UploadFeedback({ isDraggingOver, currentFileUpload, isUploading, filesToUploadCount }: UploadFeedbackProps) {
  return (
    <>
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

      {isUploading && !currentFileUpload && filesToUploadCount > 0 && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-gray-700 text-white p-4 rounded-lg mb-6 shadow-lg z-50 text-center">
          <p>Preparing to upload {filesToUploadCount} file(s)...</p>
        </div>
      )}
    </>
  );
}