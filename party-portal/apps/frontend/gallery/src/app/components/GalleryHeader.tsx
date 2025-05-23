import { HamburgerIcon } from '../../../../shell/src/app/components/HamburgerIcon'; // Adjust path as needed
import { GalleryHeaderProps } from '../interfaces/GalleryHeaderProps';

// Placeholder for a Filter Icon, replace with your actual icon component or SVG
const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.573a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
  </svg>
);

export function GalleryHeader({
  onToggleDrawer,
  onOpenFileDialog,
  onToggleFilterPanel, // Added prop
  isActionDisabled
}: GalleryHeaderProps) {
  return (
    <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center flex-shrink-0">
      <div className="flex items-center">
        <HamburgerIcon onClick={onToggleDrawer} className="mr-2 text-white" />
        <h1 className="text-xl font-semibold">Gallery</h1>
      </div>
      <div className="flex items-center space-x-2 sm:space-x-3"> {/* Added a div to group action buttons */}
        <button
          onClick={onToggleFilterPanel}
          className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Toggle sort and filter panel"
          disabled={isActionDisabled}
        >
          <FilterIcon />
        </button>
        <button
          onClick={onOpenFileDialog}
          className="p-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Upload new media"
          disabled={isActionDisabled}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    </header>
  );
}