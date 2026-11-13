import React, { useState } from 'react';
import { Search, Loader2, Check } from 'lucide-react';
import { ReadingStatus } from '../../types';
import { api, BookSearchResult } from '../../services/api';

interface BookTabProps {
  onSubmitBook: (data: {
    name: string;
    author: string;
    image_url?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;
  onClose: () => void;
  onError: (err: string | null) => void;
}

export const BookTab: React.FC<BookTabProps> = ({ onSubmitBook, onClose, onError }) => {
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
  const [isSearchingBook, setIsSearchingBook] = useState(false);
  const [selectedBook, setSelectedBook] = useState<{
    name: string;
    author: string;
    image_url?: string;
    reading_status: ReadingStatus;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearchBook = async () => {
    if (!bookSearchQuery.trim()) return;
    setIsSearchingBook(true);
    try {
      const results = await api.searchBooks(bookSearchQuery.trim());
      setBookResults(results);
    } catch {
      setBookResults([]);
    } finally {
      setIsSearchingBook(false);
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook?.name) return;
    setLoading(true);
    onError(null);
    try {
      await onSubmitBook({
        name: selectedBook.name.trim(),
        author: selectedBook.author.trim() || 'Unknown Author',
        image_url: selectedBook.image_url,
        reading_status: selectedBook.reading_status || 'want_to_read',
      });
      setSelectedBook(null);
      setBookSearchQuery('');
      setBookResults([]);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add book');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
          Search Book Online (OpenLibrary)
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Title, author, or ISBN..."
              value={bookSearchQuery}
              onChange={(e) => setBookSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchBook();
              }}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
            />
          </div>
          <button
            type="button"
            onClick={handleSearchBook}
            disabled={isSearchingBook}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-800 text-white hover:bg-teal-700"
          >
            {isSearchingBook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
          </button>
        </div>
      </div>

      {bookResults.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {bookResults.map((b, idx) => (
            <div
              key={idx}
              onClick={() =>
                setSelectedBook({
                  name: b.title,
                  author: b.author || 'Unknown Author',
                  image_url: b.coverUrl || undefined,
                  reading_status: 'want_to_read',
                })
              }
              className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                selectedBook?.name === b.title
                  ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40'
                  : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              {b.coverUrl ? (
                <img src={b.coverUrl} alt="" className="w-9 h-12 object-cover rounded shadow-xs" />
              ) : (
                <div className="w-9 h-12 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center text-[10px] text-neutral-400">
                  No Cover
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                  {b.title}
                </p>
                <p className="text-[11px] text-neutral-500 truncate">{b.author}</p>
              </div>
              {selectedBook?.name === b.title && (
                <Check className="w-4 h-4 text-teal-700 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSaveBook} className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1">Book Title *</label>
          <input
            type="text"
            required
            placeholder="Book Title"
            value={selectedBook?.name || ''}
            onChange={(e) =>
              setSelectedBook((prev) => ({
                name: e.target.value,
                author: prev?.author || '',
                image_url: prev?.image_url,
                reading_status: prev?.reading_status || 'want_to_read',
              }))
            }
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1">Author</label>
          <input
            type="text"
            placeholder="Author Name"
            value={selectedBook?.author || ''}
            onChange={(e) =>
              setSelectedBook((prev) => ({
                name: prev?.name || '',
                author: e.target.value,
                image_url: prev?.image_url,
                reading_status: prev?.reading_status || 'want_to_read',
              }))
            }
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1">Reading Status</label>
          <select
            value={selectedBook?.reading_status || 'want_to_read'}
            onChange={(e) =>
              setSelectedBook((prev) => ({
                name: prev?.name || '',
                author: prev?.author || '',
                image_url: prev?.image_url,
                reading_status: e.target.value as ReadingStatus,
              }))
            }
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          >
            <option value="want_to_read">Want to Read</option>
            <option value="reading">Currently Reading</option>
            <option value="read">Read / Finished</option>
          </select>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading || !selectedBook?.name}
            className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-xs"
          >
            {loading ? 'Adding...' : 'Add Book to Library'}
          </button>
        </div>
      </form>
    </div>
  );
};
