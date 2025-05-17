import { HamburgerIcon } from '../../../../shell/src/app/components/HamburgerIcon'; // Adjust path as needed
import { GalleryHeaderProps } from '../interfaces/GalleryHeaderProps';

export function GalleryHeader({ onToggleDrawer, onOpenFileDialog, isActionDisabled }: GalleryHeaderProps) {
  return (
    <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center flex-shrink-0">
      <div className="flex items-center">
        <HamburgerIcon onClick={onToggleDrawer} className="mr-2 text-white" />
        <h1 className="text-xl font-semibold">Gallery</h1>
      </div>
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
    </header>
  );
}