import React, { createContext, useState, useContext, ReactNode } from 'react';
import { ShellContextType } from '../../types/ShellContextType';

const ShellContext = createContext<ShellContextType | undefined>(undefined);

export const useShell = (): ShellContextType => {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return context;
};

export const ShellProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const toggleDrawer = () => setIsDrawerOpen(!isDrawerOpen);
  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  return (
    <ShellContext.Provider value={{ isDrawerOpen, toggleDrawer, openDrawer, closeDrawer }}>
      {children}
    </ShellContext.Provider>
  );
};