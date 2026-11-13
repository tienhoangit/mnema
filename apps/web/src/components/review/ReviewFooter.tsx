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
    <footer className="h-20 border-t border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
      {/* Prev & Undo */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 text-xs text-neutral-500 disabled:opacity-30 hover:text-neutral-900 dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Prev (←)</span>
        </button>

        {onUndo && (
          <button
            onClick={onUndo}
            disabled={isUndoLoading}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors px-2 py-1.5 rounded-lg"
            title="Undo last rating (Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>
        )}
      </div>

      {/* Rating Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAction('again')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 transition-colors"
          title="Again — forgot / review soon (1 or ↓)"
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Again (1)</span>
        </button>

        <button
          onClick={() => onAction('hard')}
          className="px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors"
          title="Hard — recalled with difficulty (2)"
        >
          Hard (2)
        </button>

        <button
          onClick={() => onAction('good')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
          title="Good — standard recall (3 or ↑)"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Good (3)</span>
        </button>

        <button
          onClick={() => onAction('easy')}
          className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition-colors"
          title="Easy — effortless recall (4)"
        >
          Easy (4)
        </button>

        <button
          onClick={() => onAction('discard')}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-400 hover:text-red-600 transition-colors"
          title="Discard from review queue (D)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Discard (D)</span>
        </button>
      </div>

      {/* Next */}
      <button
        onClick={onNext}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg"
      >
        <span>Next (→)</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </footer>
  );
};
