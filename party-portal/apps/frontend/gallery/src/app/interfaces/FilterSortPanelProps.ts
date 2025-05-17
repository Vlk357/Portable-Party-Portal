import { FilterOptions, SortOptions } from "../hooks/useGallery";

export interface FilterSortPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentSortOptions: SortOptions;
  currentFilterOptions: FilterOptions;
  availableUserIds: string[];
  onApply: (newSort: SortOptions, newFilters: FilterOptions) => void;
  disabled?: boolean; // To disable controls while parent is loading
}