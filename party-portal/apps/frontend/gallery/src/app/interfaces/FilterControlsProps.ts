import { FilterOptions } from "../hooks/useGallery";

export interface FilterControlsProps {
  currentFilters: FilterOptions;
  onChangeFilter: (newFilters: Partial<FilterOptions>) => void;
  onClearFilters: () => void;
  disabled?: boolean;
}