import React, { useState, useEffect } from 'react';
import { List, X, ChevronRight } from 'lucide-react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TocPanelProps {
  contentHtml: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export const TocPanel: React.FC<TocPanelProps> = ({ contentHtml, contentRef }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [headings, setHeadings] = useState<TocItem[]>([]);

  useEffect(() => {
    if (!contentRef.current) return;

    // Extract headings from the live rendered DOM
    const elements = contentRef.current.querySelectorAll('h1, h2, h3');
    const items: TocItem[] = [];

    elements.forEach((el, index) => {
      const text = el.textContent?.trim();
      if (!text) return;

      let id = el.id;
      if (!id) {
        id = `heading-${index}`;
        el.id = id;
      }

      const level = el.tagName === 'H1' ? 1 : el.tagName === 'H2' ? 2 : 3;
      items.push({ id, text, level });
    });

    setHeadings(items);
  }, [contentHtml, contentRef]);

  if (headings.length === 0) return null;

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 mb-[env(safe-area-inset-bottom)] md:mb-0 z-30 flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-md text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all hover:scale-105"
        title="Table of Contents / Outline"
      >
        <List className="w-4 h-4 text-teal-700 dark:text-teal-400" />
        <span>Outline ({headings.length})</span>
      </button>

      {/* Drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-40 w-[85vw] max-w-72 bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl p-5 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-2 font-bold text-sm text-neutral-800 dark:text-white">
              <List className="w-4 h-4 text-teal-700" />
              <span>Table of Contents</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close table of contents"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-1">
            {headings.map((h) => (
              <button
                key={h.id}
                onClick={() => scrollToHeading(h.id)}
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                className="w-full text-left py-2.5 md:py-1.5 pr-2 rounded-lg text-xs hover:bg-teal-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-teal-900 dark:hover:text-teal-300 transition-colors truncate block"
              >
                {h.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

