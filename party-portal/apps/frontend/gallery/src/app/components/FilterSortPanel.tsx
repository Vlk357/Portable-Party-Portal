// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/frontend/gallery/src/app/components/FilterSortPanel.tsx
import { useState, useEffect } from 'react';
import { SortOptions, FilterOptions, DEFAULT_FILTER_OPTIONS } from '../hooks/useGallery';
import { SortControls } from './SortControls';
import { FilterControls } from './FilterControls';
import { FilterSortPanelProps } from '../interfaces/FilterSortPanelProps';

export function FilterSortPanel({
  isOpen,
  onClose,
  currentSortOptions,
  currentFilterOptions,
  availableUserIds,
  onApply,
  disabled,
}: FilterSortPanelProps) {
  const [pendingSortOptions, setPendingSortOptions] = useState<SortOptions>(currentSortOptions);
  const [pendingFilterOptions, setPendingFilterOptions] = useState<FilterOptions>(currentFilterOptions);

  useEffect(() => {
    // Reset pending state if the panel is reopened with new current options
    setPendingSortOptions(currentSortOptions);
    setPendingFilterOptions(currentFilterOptions);
  }, [isOpen, currentSortOptions, currentFilterOptions]);

  if (!isOpen) {
    return null;
  }

  const handleApplyChanges = () => {
    onApply(pendingSortOptions, pendingFilterOptions);
    onClose();
  };

  const handleResetPending = () => {
    setPendingSortOptions(currentSortOptions);
    setPendingFilterOptions(currentFilterOptions);
  };
  
  const handleClearAllPendingFilters = () => {
    setPendingFilterOptions(DEFAULT_FILTER_OPTIONS);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white shadow-xl p-6 overflow-y-auto z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside panel
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Sort & Filter</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex-grow">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Filters</h3>
          <FilterControls
            currentFilters={pendingFilterOptions}
            onChangeFilter={setPendingFilterOptions} // Pass setter for pending state
            onClearFilters={handleClearAllPendingFilters} // Clears pending filters
            availableUserIds={availableUserIds}
            disabled={disabled}
          />

          <hr className="my-6" />

          <h3 className="text-lg font-medium text-gray-700 mb-2">Sort</h3>
          <SortControls
            sortOptions={pendingSortOptions}
            onChangeSort={setPendingSortOptions} // Pass setter for pending state
            disabled={disabled}
          />
        </div>

        <div className="mt-auto pt-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleResetPending}
            disabled={disabled}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Reset Changes
          </button>
          <button
            onClick={handleApplyChanges}
            disabled={disabled}
            className="w-full sm:w-auto flex-grow px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}