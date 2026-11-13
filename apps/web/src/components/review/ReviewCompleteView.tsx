import React from 'react';
import { Flame, RotateCcw } from 'lucide-react';
import { StreakStats } from '../../types';

interface ReviewCompleteViewProps {
  reviewedCount: number;
  streakStats?: StreakStats;
  onReviewAgain: () => void;
  onClose: () => void;
}

export const ReviewCompleteView: React.FC<ReviewCompleteViewProps> = ({
  reviewedCount,
  streakStats,
  onReviewAgain,
  onClose,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-900 shadow-sm">
        <Flame className="w-8 h-8 fill-amber-500" />
      </div>

      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
        Review Complete!
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        You reviewed <strong className="text-teal-700">{reviewedCount}</strong> highlights in this session.
      </p>

      {/* Streak Mini Box */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs mb-8 flex items-center gap-6">
        <div className="text-left">
          <p className="text-xs text-neutral-400">Current Streak</p>
          <p className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-1">
            <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span>{streakStats?.currentStreak || 0} Days</span>
          </p>
        </div>
        <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800" />
        <div className="text-left">
          <p className="text-xs text-neutral-400">Best Streak</p>
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {streakStats?.longestStreak || 1} Days
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onReviewAgain}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Review Again</span>
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
