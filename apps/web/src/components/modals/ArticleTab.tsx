import React, { useState } from 'react';
import { ReadingStatus } from '../../types';

interface ArticleTabProps {
  onSubmitArticle: (data: {
    url?: string;
    html?: string;
    name?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;
  onClose: () => void;
  onError: (err: string | null) => void;
}

export const ArticleTab: React.FC<ArticleTabProps> = ({ onSubmitArticle, onClose, onError }) => {
  const [articleUrl, setArticleUrl] = useState('');
  const [articleStatus, setArticleStatus] = useState<ReadingStatus>('inbox');
  const [loading, setLoading] = useState(false);

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleUrl.trim()) return;
    setLoading(true);
    onError(null);
    try {
      await onSubmitArticle({
        url: articleUrl.trim(),
        reading_status: articleStatus,
      });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save article');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSaveArticle} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
          Article or YouTube URL *
        </label>
        <input
          type="url"
          required
          placeholder="https://example.com/article or https://youtu.be/..."
          value={articleUrl}
          onChange={(e) => setArticleUrl(e.target.value)}
          className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
          Save To
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setArticleStatus('inbox')}
            className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
              articleStatus === 'inbox'
                ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Inbox
          </button>
          <button
            type="button"
            onClick={() => setArticleStatus('later')}
            className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
              articleStatus === 'later'
                ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Read Later
          </button>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={loading || !articleUrl.trim()}
          className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-xs"
        >
          {loading ? 'Parsing...' : 'Save to Library'}
        </button>
      </div>
    </form>
  );
};
