import React, { useEffect } from 'react';
import {
  X,
  FolderClosed,
  MessageSquare,
  Tag,
  BarChart2,
  Compass,
  Trash2,
  Plug,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
import { TabType } from './BottomNav';

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

interface DrawerNavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const LIBRARY_NAV: DrawerNavItem[] = [
  { id: 'sources', label: 'Sources', icon: FolderClosed },
  { id: 'notes', label: 'Notes', icon: MessageSquare },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'stats', label: 'Stats', icon: BarChart2 },
];

const DISCOVER_NAV: DrawerNavItem[] = [
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
  theme,
  onToggleTheme,
}) => {
  // Close on Escape key and lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (tab: TabType) => {
    onSelectTab(tab);
    onClose();
  };

  return (
    <div
      data-testid="mobile-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation Menu"
      className="md:hidden fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white dark:bg-neutral-900 shadow-2xl flex flex-col h-full z-10 border-l border-neutral-200/80 dark:border-neutral-800 transition-transform duration-300 ease-in-out">
        {/* Drawer Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Mnema"
              className="w-7 h-7 rounded-lg object-contain"
            />
            <span className="font-bold text-base tracking-tight text-neutral-900 dark:text-white">
              Mnema Menu
            </span>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Library Section */}
          <div>
            <h3 className="px-3 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">
              Library
            </h3>
            <div className="space-y-1">
              {LIBRARY_NAV.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    type="button"
                    aria-label={item.label}
                    className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        active
                          ? 'text-teal-800 dark:text-teal-400'
                          : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discover & Settings Section */}
          <div>
            <h3 className="px-3 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">
              Discover & Settings
            </h3>
            <div className="space-y-1">
              {DISCOVER_NAV.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    type="button"
                    aria-label={item.label}
                    className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        active
                          ? 'text-teal-800 dark:text-teal-400'
                          : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Drawer Footer: Theme Toggle & Info */}
        <div className="p-4 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={onToggleTheme}
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="w-full flex items-center justify-between px-3 min-h-[44px] rounded-xl text-sm font-medium bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5 text-indigo-500" />
              )}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-normal">
              {theme === 'dark' ? 'Dark active' : 'Light active'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
