import React from 'react';
import { SortOptions, SortField, SortDirection } from '../hooks/useGallery'; // Ensure SortOptions is imported
import { SortControlsProps } from '../interfaces/SortControlsProps';

// Updated sortableFields
const sortableFields: { label: string; value: SortField }[] = [
  { label: 'Date Taken', value: 'takenAt' },
  { label: 'Upload Date', value: 'uploadedAt' },
  { label: 'Upload Order', value: 'id' }, // Renamed from 'ID'
  { label: 'User ID', value: 'userId' },   // Added User ID
  { label: 'Filename', value: 'originalFilename' },
  { label: 'Type', value: 'mimeType' },
];

export function SortControls({
  sortOptions,
  onChangeSort,
  disabled,
}: SortControlsProps) {
  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChangeSort((prev: SortOptions) => ({ ...prev, field: e.target.value as SortField }));
  };

  const handleDirectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChangeSort((prev: SortOptions) => ({ ...prev, direction: e.target.value as SortDirection }));
  };

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-center">
      <span className="text-sm font-medium text-gray-700">Sort by:</span>
      <div className="flex items-center gap-2">
        <label htmlFor="sortField" className="sr-only">
          Field
        </label>
        <select
          id="sortField"
          value={sortOptions.field}
          onChange={handleFieldChange}
          disabled={disabled}
          className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          {sortableFields.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="sortDirection" className="sr-only">
          Order
        </label>
        <select
          id="sortDirection"
          value={sortOptions.direction}
          onChange={handleDirectionChange}
          disabled={disabled}
          className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  );
}
