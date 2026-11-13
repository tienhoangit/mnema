import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Flame, Sparkles, BookOpen, FileText, Upload } from 'lucide-react';
import { StreakStats } from '../types';

interface HeaderProps {
  onOpenCommandPalette: () => void;
  onOpenCreateHighlight: () => void;
  onOpenAddBook: () => void;
  onOpenSaveArticle: () => void;
  onOpenImport: () => void;
  streakStats?: StreakStats;
  onSelectTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCommandPalette,
  onOpenCreateHighlight,
  onOpenAddBook,
  onOpenSaveArticle,
  onOpenImport,
  streakStats,
  onSelectTab,
}) => {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 border-b border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 sticky top-0 z-40 select-none shrink-0">
      {/* Left: Brand Logo (Responsive auto width on mobile, w-60 on sm+) */}
      <div className="w-auto sm:w-60 flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          aria-label="Mnema Home"
          className="flex items-center gap-2 cursor-pointer group min-h-[44px] text-left rounded-lg focus:outline-hidden"
        >
          <img
            src="/logo.png"
            alt="Mnema"
            className="w-7 h-7 rounded-lg object-contain group-hover:scale-105 transition-transform shrink-0"
          />
          <span className="font-bold text-lg tracking-tight text-neutral-900 dark:text-white">
            Mnema
          </span>
        </button>
      </div>

      {/* Middle: Command Palette Search Bar (Icon/compact on mobile, full bar on desktop) */}
      <div className="flex-1 max-w-md mx-2 sm:mx-4 flex justify-center sm:justify-start">
        <button
          onClick={onOpenCommandPalette}
          type="button"
          aria-label="Search, navigate or type a command"
          className="w-auto sm:w-full flex items-center justify-center sm:justify-between min-h-[44px] min-w-[44px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl sm:rounded-lg bg-neutral-100/80 dark:bg-neutral-800/60 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs transition-colors border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 active:scale-95 sm:active:scale-100"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="hidden sm:inline truncate">Search, navigate or type a command...</span>
            <span className="inline sm:hidden text-xs">Search</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded border border-neutral-200 dark:border-neutral-600 shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right Controls: + New Dropdown, Streak Flame, Avatar */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* + New Dropdown Button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsNewMenuOpen((prev) => !prev)}
            type="button"
            aria-label="Create new item"
            aria-expanded={isNewMenuOpen}
            className="flex items-center gap-1 min-h-[44px] px-2.5 py-1.5 rounded-xl sm:rounded-lg border border-neutral-300/80 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-colors shadow-2xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline">New</span>
          </button>

          {isNewMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs text-neutral-700 dark:text-neutral-200">
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenCreateHighlight();
                }}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 min-h-[44px] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Add highlight</span>
              </button>
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenAddBook();
                }}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 min-h-[44px] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Add book</span>
              </button>
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenSaveArticle();
                }}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 min-h-[44px] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Save article or PDF</span>
              </button>
              <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenImport();
                }}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 min-h-[44px] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <Upload className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>Import (Kindle / Readwise)</span>
              </button>
            </div>
          )}
        </div>

        {/* Streak Flame Badge */}
        <button
          onClick={() => onSelectTab('review')}
          type="button"
          aria-label={`${streakStats?.currentStreak || 0}-day streak!`}
          className="flex items-center gap-1.5 min-h-[44px] px-2.5 py-1.5 rounded-xl sm:rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 text-xs font-semibold hover:bg-amber-100/60 transition-colors active:scale-95"
          title={`${streakStats?.currentStreak || 0}-day streak!`}
        >
          <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
          <span>{streakStats?.currentStreak || 0}d</span>
        </button>

        {/* User Account Avatar */}
        <button
          onClick={() => onSelectTab('settings')}
          type="button"
          aria-label="Account & Settings"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-hidden"
          title="Account & Settings"
        >
          <div className="w-7 h-7 rounded-full bg-indigo-700 text-white flex items-center justify-center text-xs font-semibold shadow-xs hover:ring-2 hover:ring-indigo-500/50 transition-all select-none">
            M
          </div>
        </button>
      </div>
    </header>
  );
};
