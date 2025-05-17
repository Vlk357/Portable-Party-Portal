import React from 'react';
import { SortOptions, SortField, SortDirection } from '../hooks/useGallery';
import { SortControlsProps } from '../interfaces/SortControlsProps';

const sortableFields: { label: string; value: SortField }[] = [
  { label: 'Date Taken', value: 'takenAt' },
  { label: 'Upload Date', value: 'id' },
  // { label: 'Upload Order', value: 'id' },
  { label: 'User ID', value: 'userId' },
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
    // Adjusted for better responsiveness and single row on mobile if space allows
    <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 sm:items-center">
      <div className="flex-1 min-w-0"> {/* Added flex-1 and min-w-0 for better wrapping */}
        <label htmlFor="sortField" className="sr-only">Sort by Field</label>
        <select
          id="sortField"
          value={sortOptions.field}
          onChange={handleFieldChange}
          disabled={disabled}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          {sortableFields.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-shrink-0"> {/* flex-shrink-0 for direction selector */}
        <label htmlFor="sortDirection" className="sr-only">Sort Order</label>
        <select
          id="sortDirection"
          value={sortOptions.direction}
          onChange={handleDirectionChange}
          disabled={disabled}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  );
}
