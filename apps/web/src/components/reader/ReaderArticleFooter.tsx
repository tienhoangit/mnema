import React from 'react';
import { Highlighter } from 'lucide-react';
import { Highlight } from '../../types';
import { PendingHighlight } from '../../services/offlineDb';

interface ReaderArticleFooterProps {
  highlights?: Highlight[];
  pendingHighlights?: PendingHighlight[];
}

export const ReaderArticleFooter: React.FC<ReaderArticleFooterProps> = ({
  highlights = [],
  pendingHighlights = [],
}) => {
  const totalCount = highlights.length + pendingHighlights.length;
  if (totalCount === 0) return null;

  return (
    <div className="mt-16 pt-8 border-t border-neutral-200 dark:border-neutral-800 font-sans">
      <h3 className="text-sm font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 mb-4 flex items-center gap-2">
        <Highlighter className="w-4 h-4" />
        <span>Highlights from this article ({totalCount})</span>
      </h3>

      <div className="space-y-3">
        {highlights.map((hl) => (
          <div
            key={hl.id}
            className="p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-800/40 space-y-2"
          >
            <p className="font-serif italic text-sm text-neutral-800 dark:text-neutral-200">
              “{hl.content}”
            </p>
            {hl.note && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs">
                <span className="font-semibold">Note: </span>
                {hl.note}
              </div>
            )}
          </div>
        ))}
        {pendingHighlights.map((hl) => (
          <div
            key={hl.id}
            className="p-4 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                Offline (pending sync)
              </span>
            </div>
            <p className="font-serif italic text-sm text-neutral-800 dark:text-neutral-200">
              “{hl.content}”
            </p>
            {hl.note && (
              <div className="p-2.5 rounded-xl bg-amber-100/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs">
                <span className="font-semibold">Note: </span>
                {hl.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
