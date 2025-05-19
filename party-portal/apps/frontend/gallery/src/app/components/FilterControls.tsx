import React, { useState, useEffect, useCallback } from 'react';
import { FilterOptions } from '../hooks/useGallery'; // FilterOptions will now have userIds?: string[]

interface FilterControlsProps {
  currentFilters: FilterOptions;
  onChangeFilter: (newFiltersOrUpdater: FilterOptions | ((prev: FilterOptions) => FilterOptions)) => void;
  onClearFilters: () => void;
  availableUserIds: string[];
  disabled?: boolean;
  onDateRangeValidityChange: (isValid: boolean) => void;
}

const commonMimeTypes = [
  { value: '', label: 'All Types' },
  { value: 'image/', label: 'Images (All)' },
  { value: 'image/jpeg', label: 'Image (JPEG)' },
  { value: 'image/png', label: 'Image (PNG)' },
  { value: 'image/gif', label: 'Image (GIF)' },
  { value: 'video/', label: 'Videos (All)' },
  { value: 'video/mp4', label: 'Video (MP4)' },
  { value: 'video/webm', label: 'Video (WebM)' },
  { value: 'video/x-matroska', label: 'Video (MKV)'},
];


export function FilterControls({
  currentFilters,
  onChangeFilter,
  onClearFilters,
  availableUserIds,
  disabled,
  onDateRangeValidityChange,
}: FilterControlsProps) {
  const [dateError, setDateError] = useState<string | null>(null);

  const pendingUserIds = currentFilters.userIds || []; // Use currentFilters.userIds

  const handleUserCheckboxChange = (userId: string) => {
    onChangeFilter(prev => {
      const newSelectedUserIds = prev.userIds?.includes(userId)
        ? prev.userIds.filter(id => id !== userId)
        : [...(prev.userIds || []), userId];
      return { ...prev, userIds: newSelectedUserIds.length > 0 ? newSelectedUserIds : undefined }; // Set to undefined if empty to clear from URL
    });
  };

  const handleSelectAllUsers = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeFilter(prev => ({
      ...prev,
      userIds: e.target.checked && availableUserIds.length > 0 ? availableUserIds : undefined, // Set to undefined if empty
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    onChangeFilter(prev => ({ ...prev, [name]: value || undefined }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onChangeFilter(prev => {
      const newFilters = { ...prev, [name]: value ? value : undefined };
      return newFilters;
    });
  };
  
  const validateDates = useCallback((after?: string, before?: string) => {
    if (after && before && new Date(after) > new Date(before)) {
      setDateError('"Taken After" date cannot be later than "Taken Before" date.');
      onDateRangeValidityChange(false);
    } else {
      setDateError(null);
      onDateRangeValidityChange(true);
    }
  }, [onDateRangeValidityChange]);

  useEffect(() => {
    validateDates(currentFilters.takenAtAfter, currentFilters.takenAtBefore);
  }, [currentFilters.takenAtAfter, currentFilters.takenAtBefore, validateDates]);


  const isAllUsersSelected = availableUserIds.length > 0 && pendingUserIds.length === availableUserIds.length;
  const isSomeUsersSelected = pendingUserIds.length > 0 && !isAllUsersSelected;


  return (
    <div className="flex flex-col gap-6">
      {/* User ID Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by User IDs:</label>
        {/* Removed the warning paragraph */}
        {availableUserIds.length > 0 ? (
          <>
            <div className="mb-2">
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  checked={isAllUsersSelected}
                  ref={input => {
                    if (input) input.indeterminate = isSomeUsersSelected;
                  }}
                  onChange={handleSelectAllUsers}
                  disabled={disabled}
                />
                <span>Select All / Deselect All</span>
              </label>
            </div>
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
              {availableUserIds.map(id => (
                <label key={id} className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    checked={pendingUserIds.includes(id)} // Correctly check against pendingUserIds array
                    onChange={() => handleUserCheckboxChange(id)} // Pass the id
                    disabled={disabled}
                  />
                  <span>{id}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No user IDs available to filter by.</p>
        )}
      </div>

      {/* Other Filters */}
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

      {/* Date Filters - Arranged side-by-side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 items-end">
        <div>
          <label htmlFor="takenAtBefore" className="block text-sm font-medium text-gray-700 mb-1">Taken Before:</label>
          <input
            type="date"
            id="takenAtBefore"
            name="takenAtBefore"
            value={currentFilters.takenAtBefore || ''}
            onChange={handleDateChange}
            disabled={disabled}
            className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
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
            className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>
        {/* Full span for error message or other single column items */}
        {dateError && (
            <p className="sm:col-span-2 text-xs text-red-600 mt-1">{dateError}</p>
        )}
        <div>
          <label htmlFor="uploadedAtAfter" className="block text-sm font-medium text-gray-700 mb-1">Uploaded After:</label>
          <input
            type="date"
            id="uploadedAtAfter"
            name="uploadedAtAfter"
            value={currentFilters.uploadedAtAfter || ''}
            onChange={handleDateChange}
            disabled={disabled}
            className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>
      </div>
      
      <div className="mt-4">
        <button
          onClick={onClearFilters}
          disabled={disabled || Object.values(currentFilters).every(val => Array.isArray(val) ? val.length === 0 : !val)}
          className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
        >
          Clear Filter Inputs
        </button>
      </div>
    </div>
  );
}