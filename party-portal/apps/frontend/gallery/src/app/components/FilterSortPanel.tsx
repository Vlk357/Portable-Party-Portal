import { useState, useEffect, useRef, useCallback } from 'react';
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
  onClearAllInPanel,
}: FilterSortPanelProps) {
  const [pendingSortOptions, setPendingSortOptions] = useState<SortOptions>(currentSortOptions);
  const [pendingFilterOptions, setPendingFilterOptions] = useState<FilterOptions>(currentFilterOptions);
  const [isDateRangeValid, setIsDateRangeValid] = useState(true);

  // This state (`isPanelVisible`) will control the CSS classes for animation
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      // When parent wants to open, reset pending options
      setPendingSortOptions(currentSortOptions);
      setPendingFilterOptions(currentFilterOptions);
      // Use a micro-delay to ensure "enter" animation plays
      const timer = setTimeout(() => {
        setIsPanelVisible(true);
      }, 10); // Small delay for CSS transition to pick up initial state
      return () => clearTimeout(timer);
    } else {
      // If parent wants to close (isOpen becomes false), ensure our animation state reflects that
      setIsPanelVisible(false);
    }
  }, [isOpen, currentSortOptions, currentFilterOptions]);

  const handleTriggerClose = useCallback(() => {
    if (!isOpen) return; // If already told to be closed by parent, do nothing more

    setIsPanelVisible(false); // Start the exit animation

    // Clear any existing timer
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
    }
    // Call the parent's onClose after the animation duration
    animationTimerRef.current = setTimeout(() => {
      onClose(); // This will cause the parent to set isOpen=false
    }, 300); // Must match animation duration (e.g., duration-300)
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleTriggerClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, [isOpen, handleTriggerClose]);

  const handleApplyChanges = () => {
    if (!isDateRangeValid) {
      alert("Please correct the date range before applying.");
      return;
    }
    onApply(pendingSortOptions, pendingFilterOptions);
    handleTriggerClose();
  };

  const handleClearAllPendingFilters = () => {
    setPendingFilterOptions(DEFAULT_FILTER_OPTIONS);
    setIsDateRangeValid(true);
    if (onClearAllInPanel) {
      onClearAllInPanel();
    }
  };

  // Render null if the parent indicates it's closed AND our internal animation state is also closed.
  // This allows the component to stay mounted during the exit animation.
  if (!isOpen && !isPanelVisible) {
    return null;
  }

  return (
    <>
      {/* Overlay: Sibling to the panel. Its visibility is tied to isPanelVisible for animation. */}
      <div
        className={`fixed inset-0 z-40 bg-black transition-opacity duration-300 ease-in-out ${
          isPanelVisible ? 'opacity-50' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleTriggerClose}
        aria-hidden={!isPanelVisible}
      />

      {/* Panel: Sibling to the overlay. Slides from the right. */}
      <div
        className={`fixed top-0 right-0 w-full max-w-md h-full bg-white shadow-xl p-6 overflow-y-auto z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isPanelVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        // onClick={(e) => e.stopPropagation()} // Not needed if overlay is a sibling
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Sort & Filter</h2>
          <button
            onClick={handleTriggerClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex-grow space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-3">Sort</h3>
            <SortControls
              sortOptions={pendingSortOptions}
              onChangeSort={setPendingSortOptions}
              disabled={disabled}
            />
          </div>
          <hr className="my-4" />
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-3">Filters</h3>
            <FilterControls
              currentFilters={pendingFilterOptions}
              onChangeFilter={setPendingFilterOptions}
              onClearFilters={handleClearAllPendingFilters}
              availableUserIds={availableUserIds}
              disabled={disabled}
              onDateRangeValidityChange={setIsDateRangeValid}
            />
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleApplyChanges}
            disabled={disabled || !isDateRangeValid}
            className={`w-full sm:w-auto flex-grow px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              !isDateRangeValid ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}