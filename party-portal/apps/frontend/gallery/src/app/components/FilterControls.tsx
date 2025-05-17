import React from 'react';
import { FilterControlsProps } from '../interfaces/FilterControlsProps';

// A simple list of common MIME types for the dropdown. Expand as needed.
const commonMimeTypes = [
    { label: "All Types", value: "" },
    { label: "JPEG Image", value: "image/jpeg" },
    { label: "PNG Image", value: "image/png" },
    { label: "GIF Image", value: "image/gif" },
    { label: "WebP Image", value: "image/webp" },
    { label: "MP4 Video", value: "video/mp4" },
    { label: "QuickTime Video", value: "video/quicktime" },
    { label: "WebM Video", value: "video/webm" },
];


export function FilterControls({ currentFilters, onChangeFilter, onClearFilters, disabled }: FilterControlsProps) {
  // Use local state to manage input values to avoid re-rendering on every keystroke if desired,
  // or directly use currentFilters and call onChangeFilter on each change.
  // For simplicity, this example updates directly.

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    onChangeFilter({ [name]: value || undefined }); // Send undefined to clear the filter
  };
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Ensure empty string is treated as clearing the filter
    onChangeFilter({ [name]: value ? value : undefined });
  };


  return (
    <div className="my-4 p-3 bg-gray-50 rounded-md shadow flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">Filter by User ID:</label>
          <input
            type="text"
            id="userId"
            name="userId"
            value={currentFilters.userId || ''}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder="Enter User ID"
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>
        <div>
          <label htmlFor="mimeType" className="block text-sm font-medium text-gray-700 mb-1">Filter by Media Type:</label>
          <select
            id="mimeType"
            name="mimeType"
            value={currentFilters.mimeType || ''}
            onChange={handleInputChange}
            disabled={disabled}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            {commonMimeTypes.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
         <div>
          <label htmlFor="uploadedAtAfter" className="block text-sm font-medium text-gray-700 mb-1">Uploaded After:</label>
          <input
            type="date"
            id="uploadedAtAfter"
            name="uploadedAtAfter"
            value={currentFilters.uploadedAtAfter || ''}
            onChange={handleDateChange}
            disabled={disabled}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>
        <div>
          <label htmlFor="takenAtAfter" className="block text-sm font-medium text-gray-700 mb-1">Taken After:</label>
          <input
            type="date"
            id="takenAtAfter"
            name="takenAtAfter"
            value={currentFilters.takenAtAfter || ''}
            onChange={handleDateChange}
            disabled={disabled}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>
        <div>
          <label htmlFor="takenAtBefore" className="block text-sm font-medium text-gray-700 mb-1">Taken Before:</label>
          <input
            type="date"
            id="takenAtBefore"
            name="takenAtBefore"
            value={currentFilters.takenAtBefore || ''}
            onChange={handleDateChange}
            disabled={disabled}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>
      </div>
      <div className="mt-2">
        <button
          onClick={onClearFilters}
          disabled={disabled || Object.values(currentFilters).every(val => !val)}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
        >
          Clear All Filters
        </button>
      </div>
    </div>
  );
}