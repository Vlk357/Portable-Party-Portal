import { SortOptions } from "../hooks/useGallery";

export interface SortControlsProps {
  sortOptions: SortOptions;
  onChangeSort: (newSortOptionsOrUpdater: SortOptions | ((prev: SortOptions) => SortOptions)) => void;
  disabled?: boolean;
}