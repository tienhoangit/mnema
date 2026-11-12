import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Flame, User, Sparkles, BookOpen, FileText, Upload } from 'lucide-react';
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
    <header className="h-14 border-b border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-40 select-none shrink-0">
      {/* Left: Brand Logo (Width 256px aligned with sidebar) */}
      <div className="w-56 sm:w-60 flex items-center gap-3">
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => onSelectTab('home')}
        >
          <img
            src="/logo.png"
            alt="Mnema"
            className="w-7 h-7 rounded-lg object-contain group-hover:scale-105 transition-transform"
          />
          <span className="font-bold text-lg tracking-tight text-neutral-900 dark:text-white">
            Mnema
          </span>
        </div>
      </div>

      {/* Middle: Command Palette Search Bar */}
      <div className="flex-1 max-w-md mx-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/60 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs transition-colors border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Search, navigate or type a command...</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded border border-neutral-200 dark:border-neutral-600 shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right Controls: + New Dropdown, Streak Flame, Avatar */}
      <div className="flex items-center gap-2.5">
        {/* + New Dropdown Button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsNewMenuOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-300/80 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-colors shadow-2xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>

          {isNewMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs text-neutral-700 dark:text-neutral-200">
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenCreateHighlight();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Add highlight</span>
              </button>
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenAddBook();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <BookOpen className="w-4 h-4 text-teal-600" />
                <span>Add book</span>
              </button>
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenSaveArticle();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>Save article or PDF</span>
              </button>
              <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
              <button
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onOpenImport();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors"
              >
                <Upload className="w-4 h-4 text-neutral-400" />
                <span>Import (Kindle / Readwise)</span>
              </button>
            </div>
          )}
        </div>

        {/* Streak Flame Badge */}
        <button
          onClick={() => onSelectTab('review')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 text-xs font-semibold hover:bg-amber-100/60 transition-colors"
          title={`${streakStats?.currentStreak || 0}-day streak!`}
        >
          <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
          <span>{streakStats?.currentStreak || 0}d</span>
        </button>

        {/* User Account Avatar */}
        <div
          onClick={() => onSelectTab('settings')}
          className="w-7 h-7 rounded-full bg-indigo-700 text-white flex items-center justify-center text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-all select-none"
          title="Account & Settings"
        >
          M
        </div>
      </div>
    </header>
  );
};

