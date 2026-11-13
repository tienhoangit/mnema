import React, { useState } from 'react';
import { X, Highlighter, Book, Globe } from 'lucide-react';
import { Source, ReadingStatus, HighlightColor } from '../../types';
import { OcrHighlightTab } from './OcrHighlightTab';
import { BookTab } from './BookTab';
import { ArticleTab } from './ArticleTab';

interface CreateNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: Source[];
  initialTab?: 'highlight' | 'book' | 'article';
  onSubmitArticle: (data: {
    url?: string;
    html?: string;
    name?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;
  onSubmitHighlight: (data: {
    source_id: string;
    content: string;
    note?: string;
    color: HighlightColor;
    location?: string;
    tags?: string[];
  }) => Promise<void>;
  onSubmitBook: (data: {
    name: string;
    author: string;
    image_url?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;
}

export const CreateNewModal: React.FC<CreateNewModalProps> = ({
  isOpen,
  onClose,
  sources,
  initialTab = 'highlight',
  onSubmitArticle,
  onSubmitHighlight,
  onSubmitBook,
}) => {
  const [activeTab, setActiveTab] = useState<'highlight' | 'book' | 'article'>(initialTab);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Tabs */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
            <button
              onClick={() => {
                setActiveTab('highlight');
                setError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'highlight'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>Add Highlight</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('book');
                setError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'book'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Book className="w-3.5 h-3.5" />
              <span>Add Book</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('article');
                setError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'article'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Save Article</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs border border-red-200 dark:border-red-800/40">
              {error}
            </div>
          )}

          {activeTab === 'highlight' && (
            <OcrHighlightTab
              sources={sources}
              onSubmitHighlight={onSubmitHighlight}
              onClose={onClose}
              onError={setError}
            />
          )}

          {activeTab === 'book' && (
            <BookTab
              onSubmitBook={onSubmitBook}
              onClose={onClose}
              onError={setError}
            />
          )}

          {activeTab === 'article' && (
            <ArticleTab
              onSubmitArticle={onSubmitArticle}
              onClose={onClose}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
};
