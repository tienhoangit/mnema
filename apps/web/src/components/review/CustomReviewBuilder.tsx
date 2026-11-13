import React from 'react';
import { Search, BookOpen, Tag as TagIcon, Sliders } from 'lucide-react';
import { Source, Tag } from '../../types';

interface CustomReviewBuilderProps {
  customTopic: string;
  setCustomTopic: (val: string) => void;
  customSourceId: string;
  setCustomSourceId: (val: string) => void;
  customTag: string;
  setCustomTag: (val: string) => void;
  customCount: number;
  setCustomCount: (val: number) => void;
  sources: Source[];
  tags: Tag[];
  isStartingCustom: boolean;
  customError: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

export const CustomReviewBuilder: React.FC<CustomReviewBuilderProps> = ({
  customTopic,
  setCustomTopic,
  customSourceId,
  setCustomSourceId,
  customTag,
  setCustomTag,
  customCount,
  setCustomCount,
  sources,
  tags,
  isStartingCustom,
  customError,
  onSubmit,
}) => {
  return (
    <div className="max-w-2xl mx-auto w-full p-6 sm:p-8 space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Custom Review Session
        </h2>
        <p className="text-xs text-neutral-500">
          Focus your review on a specific topic, book, or tag when preparing for deep work.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-5"
      >
        {/* Topic Search */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-teal-700" />
            <span>Topic or Keyword</span>
          </label>
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="e.g. mental models, habits, compounding, leadership..."
            className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700"
          />
        </div>

        {/* Source Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-teal-700" />
            <span>Filter by Source (Optional)</span>
          </label>
          <select
            value={customSourceId}
            onChange={(e) => setCustomSourceId(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 cursor-pointer"
          >
            <option value="">All Sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.author ? `(${s.author})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Tag Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
            <TagIcon className="w-3.5 h-3.5 text-teal-700" />
            <span>Filter by Tag (Optional)</span>
          </label>
          <select
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 cursor-pointer"
          >
            <option value="">All Tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.name}>
                #{t.name} ({t.count || 0})
              </option>
            ))}
          </select>
        </div>

        {/* Review Count Picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-teal-700" />
            <span>Batch Size</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCustomCount(num)}
                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                  customCount === num
                    ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
              >
                {num} Quotes
              </button>
            ))}
          </div>
        </div>

        {customError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-600">
            {customError}
          </div>
        )}

        <button
          type="submit"
          disabled={isStartingCustom}
          className="w-full py-3 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
        >
          {isStartingCustom ? 'Loading Session...' : 'Start Custom Review'}
        </button>
      </form>
    </div>
  );
};
