import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Trash2,
  Undo2,
} from 'lucide-react';
import { ReviewAction } from '../../types';

interface ReviewFooterProps {
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onAction: (action: ReviewAction) => void | Promise<void>;
  onUndo?: () => Promise<void>;
  isUndoLoading: boolean;
}

export const ReviewFooter: React.FC<ReviewFooterProps> = ({
  currentIndex,
  onPrev,
  onNext,
  onAction,
  onUndo,
  isUndoLoading,
}) => {
  return (
    <footer className="border-t border-neutral-200/80 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-0 sm:h-20 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 shrink-0 pb-24 sm:pb-0">
      {/* Mobile Tier 1: Prev, Undo, Discard, Next (< sm) */}
      <div className="flex sm:hidden items-center justify-between w-full">
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="min-h-[44px] px-3 flex items-center gap-1 text-xs text-neutral-500 disabled:opacity-30 hover:text-neutral-900 dark:hover:text-white transition-colors rounded-xl"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <div className="flex items-center gap-1">
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={isUndoLoading}
              className="min-h-[44px] px-3 flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors rounded-xl"
              title="Undo last rating (Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          )}

          <button
            onClick={() => onAction('discard')}
            className="min-h-[44px] px-3 flex items-center gap-1 text-xs text-neutral-400 hover:text-red-600 transition-colors rounded-xl"
            title="Discard from review queue (D)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard</span>
          </button>
        </div>

        <button
          onClick={onNext}
          className="min-h-[44px] px-3 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors rounded-xl"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop Left: Prev & Undo (>= sm) */}
      <div className="hidden sm:flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="min-h-[44px] flex items-center gap-1 text-xs text-neutral-500 disabled:opacity-30 hover:text-neutral-900 dark:hover:text-white transition-colors px-3 py-2 rounded-xl"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev (←)</span>
        </button>

        {onUndo && (
          <button
            onClick={onUndo}
            disabled={isUndoLoading}
            className="min-h-[44px] flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors px-3 py-2 rounded-xl"
            title="Undo last rating (Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        )}
      </div>

      {/* Rating Buttons: Grid on mobile (< sm), Row on desktop (>= sm) */}
      <div className="grid grid-cols-4 sm:flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
        <button
          onClick={() => onAction('again')}
          className="min-h-[44px] flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 transition-colors text-center"
          title="Again — forgot / review soon (1 or ↓)"
        >
          <TrendingDown className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span>Again<span className="hidden sm:inline"> (1)</span></span>
        </button>

        <button
          onClick={() => onAction('hard')}
          className="min-h-[44px] flex items-center justify-center px-2 sm:px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors text-center"
          title="Hard — recalled with difficulty (2)"
        >
          <span>Hard<span className="hidden sm:inline"> (2)</span></span>
        </button>

        <button
          onClick={() => onAction('good')}
          className="min-h-[44px] flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors text-center"
          title="Good — standard recall (3 or ↑)"
        >
          <TrendingUp className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span>Good<span className="hidden sm:inline"> (3)</span></span>
        </button>

        <button
          onClick={() => onAction('easy')}
          className="min-h-[44px] flex items-center justify-center px-2 sm:px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition-colors text-center"
          title="Easy — effortless recall (4)"
        >
          <span>Easy<span className="hidden sm:inline"> (4)</span></span>
        </button>

        <button
          onClick={() => onAction('discard')}
          className="hidden sm:flex min-h-[44px] items-center gap-1 px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-400 hover:text-red-600 transition-colors"
          title="Discard from review queue (D)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Discard (D)</span>
        </button>
      </div>

      {/* Desktop Right: Next (>= sm) */}
      <button
        onClick={onNext}
        className="hidden sm:flex min-h-[44px] items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors px-3 py-2 rounded-xl"
      >
        <span>Next (→)</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </footer>
  );
};
