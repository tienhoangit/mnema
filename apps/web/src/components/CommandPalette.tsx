import React, { useState, useEffect } from 'react';
import {
  Search,
  BookOpen,
  Sparkles,
  Download,
  Upload,
  Sun,
  Moon,
  Highlighter,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { Source, Highlight } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  sources: Source[];
  highlights: Highlight[];
  onSelectSource: (id: string) => void;
  onOpenAddModal: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
  onOpenReviewModal: () => void;
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  sources,
  highlights,
  onSelectSource,
  onOpenAddModal,
  onOpenImportModal,
  onOpenExportModal,
  onOpenReviewModal,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose(); // toggle
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredSources = q
    ? sources.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.author && s.author.toLowerCase().includes(q))
      ).slice(0, 5)
    : [];

  const filteredHighlights = q
    ? highlights.filter((h) => h.content.toLowerCase().includes(q)).slice(0, 3)
    : [];

  const quickActions = [
    {
      id: 'add',
      title: 'Save New Article or Video',
      icon: Plus,
      action: () => {
        onClose();
        onOpenAddModal();
      },
    },
    {
      id: 'review',
      title: 'Start Daily Review',
      icon: Sparkles,
      action: () => {
        onClose();
        onOpenReviewModal();
      },
    },
    {
      id: 'import',
      title: 'Import Kindle Clippings',
      icon: Upload,
      action: () => {
        onClose();
        onOpenImportModal();
      },
    },
    {
      id: 'export',
      title: 'Export Library to Markdown / CSV',
      icon: Download,
      action: () => {
        onClose();
        onOpenExportModal();
      },
    },
    {
      id: 'theme',
      title: 'Toggle Color Theme',
      icon: Sun,
      action: () => {
        onClose();
        onToggleTheme();
      },
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-24 p-3 sm:p-4 bg-black/50 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800 gap-3">
          <Search className="w-5 h-5 text-neutral-400" />
          <input
            type="text"
            autoFocus
            placeholder="Search articles, highlights, or commands... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-hidden text-sm text-neutral-900 dark:text-white placeholder-neutral-400 min-h-[36px]"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Matched Articles */}
          {filteredSources.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Articles & Books
              </p>
              {filteredSources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onClose();
                    onSelectSource(s.id);
                  }}
                  className="w-full text-left flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors min-h-[44px]"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <BookOpen className="w-4 h-4 text-teal-700 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                      {s.name}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Matched Highlights */}
          {filteredHighlights.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Highlights
              </p>
              {filteredHighlights.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl bg-amber-50/50 dark:bg-neutral-800/50 border border-amber-200/40 dark:border-neutral-700 text-xs space-y-1"
                >
                  <p className="font-serif italic text-neutral-800 dark:text-neutral-200 line-clamp-2">
                    “{h.content}”
                  </p>
                  <span className="text-[10px] text-neutral-400 block">
                    Source: {h.source_name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <p className="px-3 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Quick Actions
            </p>
            {quickActions
              .filter((a) => !q || a.title.toLowerCase().includes(q))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className="w-full text-left flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors min-h-[44px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                        {item.title}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

