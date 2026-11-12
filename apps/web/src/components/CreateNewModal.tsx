import React, { useState } from 'react';
import {
  X,
  Highlighter,
  Book,
  Globe,
  Search,
  Sparkles,
  Loader2,
  Check,
  Camera,
} from 'lucide-react';
import { Source, ReadingStatus, HighlightColor } from '../types';
import { api, BookSearchResult } from '../services/api';

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

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Highlight Form
  const [hlContent, setHlContent] = useState('');
  const [hlNote, setHlNote] = useState('');
  const [hlSourceId, setHlSourceId] = useState('');
  const [hlLocation, setHlLocation] = useState('');
  const [hlColor, setHlColor] = useState<HighlightColor>('yellow');
  const [hlTags, setHlTags] = useState('');
  const [isTidying, setIsTidying] = useState(false);

  // OCR Book Page Scan State
  const [showOcrPanel, setShowOcrPanel] = useState(false);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrMode, setOcrMode] = useState<'highlights_only' | 'full_page'>('highlights_only');
  const [ocrPassages, setOcrPassages] = useState<string[]>([]);
  const [isRunningOcr, setIsRunningOcr] = useState(false);

  // Book Form
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
  const [isSearchingBook, setIsSearchingBook] = useState(false);
  const [selectedBook, setSelectedBook] = useState<{
    name: string;
    author: string;
    image_url?: string;
    reading_status: ReadingStatus;
  } | null>(null);

  // Article Form
  const [articleUrl, setArticleUrl] = useState('');
  const [articleStatus, setArticleStatus] = useState<ReadingStatus>('inbox');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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

  const handleTidyUp = async () => {
    if (!hlContent.trim() || isTidying) return;
    setIsTidying(true);
    setError(null);
    try {
      const apiKey = localStorage.getItem('mnema_gemini_api_key') || undefined;
      const tidied = await api.tidyUpText(hlContent, apiKey);
      setHlContent(tidied);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidy up failed');
    } finally {
      setIsTidying(false);
    }
  };

  const handleOcrImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setOcrPassages([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === 'string') {
        setOcrPreviewUrl(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunOcr = async () => {
    if (!ocrPreviewUrl) return;
    setIsRunningOcr(true);
    setError(null);
    setOcrPassages([]);
    try {
      const apiKey = localStorage.getItem('mnema_gemini_api_key') || undefined;
      const res = await api.ocrBookPage({
        imageBase64: ocrPreviewUrl,
        mode: ocrMode,
        apiKey,
      });
      setOcrPassages(res.passages);
      if (res.passages.length === 1 || ocrMode === 'full_page') {
        setHlContent(res.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setIsRunningOcr(false);
    }
  };

  const handleSaveHighlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hlContent.trim()) return;

    let targetSourceId = hlSourceId;
    if (!targetSourceId) {
      const personal = sources.find((s) => s.type === 'custom' || s.name === 'Personal Notes');
      targetSourceId = personal ? personal.id : sources[0]?.id || '';
    }

    if (!targetSourceId) {
      setError('Please create or select a source first');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const tagsArray = hlTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSubmitHighlight({
        source_id: targetSourceId,
        content: hlContent.trim(),
        note: hlNote.trim() || undefined,
        color: hlColor,
        location: hlLocation.trim() || undefined,
        tags: tagsArray,
      });
      setHlContent('');
      setHlNote('');
      setOcrPreviewUrl(null);
      setOcrPassages([]);
      setShowOcrPanel(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save highlight');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook?.name) return;

    setLoading(true);
    setError(null);
    try {
      await onSubmitBook(selectedBook);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add book');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleUrl.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await onSubmitArticle({
        url: articleUrl.trim(),
        reading_status: articleStatus,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save article');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Tabs */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('highlight')}
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
              onClick={() => setActiveTab('book')}
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
              onClick={() => setActiveTab('article')}
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

          {/* TAB 1: ADD HIGHLIGHT + OCR BOOK SCANNER */}
          {activeTab === 'highlight' && (
            <form onSubmit={handleSaveHighlight} className="space-y-4">
              {/* OCR Toggle Banner */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/40">
                <div className="flex items-center gap-2 text-xs text-teal-900 dark:text-teal-200">
                  <Camera className="w-4 h-4 text-teal-700" />
                  <span className="font-semibold">Reading a physical book?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOcrPanel((prev) => !prev)}
                  className="px-2.5 py-1 rounded-lg bg-teal-800 hover:bg-teal-700 text-white text-[11px] font-semibold"
                >
                  {showOcrPanel ? 'Hide OCR' : 'Scan Page (OCR)'}
                </button>
              </div>

              {showOcrPanel && (
                <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-xs font-semibold cursor-pointer hover:border-teal-700">
                      <Camera className="w-3.5 h-3.5 text-teal-700" />
                      <span>Upload / Take Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleOcrImageSelect}
                        className="hidden"
                      />
                    </label>

                    <select
                      value={ocrMode}
                      onChange={(e) =>
                        setOcrMode(e.target.value as 'highlights_only' | 'full_page')
                      }
                      className="text-xs px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700"
                    >
                      <option value="highlights_only">Underlined / Highlighted Quotes</option>
                      <option value="full_page">Full Book Page Text</option>
                    </select>
                  </div>

                  {ocrPreviewUrl && (
                    <div className="space-y-2">
                      <img
                        src={ocrPreviewUrl}
                        alt="Book page preview"
                        className="max-h-40 w-full object-contain rounded-xl border border-neutral-200 dark:border-neutral-700 bg-black/5"
                      />
                      <button
                        type="button"
                        onClick={handleRunOcr}
                        disabled={isRunningOcr}
                        className="w-full py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isRunningOcr ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Scanning Book Page with Gemini Vision...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                            <span>Extract Text from Photo</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {ocrPassages.length > 1 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-neutral-500">
                        Extracted passages (click one to insert):
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {ocrPassages.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setHlContent(p)}
                            className="w-full text-left p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 hover:border-teal-700 text-[11px] line-clamp-2"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Quote / Highlight Text *
                  </label>
                  <button
                    type="button"
                    onClick={handleTidyUp}
                    disabled={isTidying || !hlContent.trim()}
                    className="flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-400 font-semibold hover:underline disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isTidying ? 'Cleaning...' : 'Tidy up text (AI)'}</span>
                  </button>
                </div>
                <textarea
                  required
                  rows={4}
                  placeholder="Paste, write, or OCR-scan the quote here..."
                  value={hlContent}
                  onChange={(e) => setHlContent(e.target.value)}
                  className="w-full font-serif text-sm px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-700/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                  Personal Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Why this quote matters to you..."
                  value={hlNote}
                  onChange={(e) => setHlNote(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                    Source / Book
                  </label>
                  <select
                    value={hlSourceId}
                    onChange={(e) => setHlSourceId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="">Select source...</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                    Page / Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Page 42, Loc 150"
                    value={hlLocation}
                    onChange={(e) => setHlLocation(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                    Tags (Comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. habits, psychology"
                    value={hlTags}
                    onChange={(e) => setHlTags(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                    Color
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    {(['yellow', 'blue', 'green', 'pink'] as HighlightColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setHlColor(c)}
                        className={`w-6 h-6 rounded-full transition-all ${
                          c === 'yellow'
                            ? 'bg-yellow-400'
                            : c === 'blue'
                            ? 'bg-sky-400'
                            : c === 'green'
                            ? 'bg-emerald-400'
                            : 'bg-pink-400'
                        } ${hlColor === c ? 'ring-2 ring-teal-800 ring-offset-2 scale-110' : 'opacity-70'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={loading || !hlContent.trim()}
                  className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-xs"
                >
                  {loading ? 'Saving...' : 'Save Highlight'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ADD BOOK */}
          {activeTab === 'book' && (
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
          )}

          {/* TAB 3: SAVE ARTICLE */}
          {activeTab === 'article' && (
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
          )}
        </div>
      </div>
    </div>
  );
};
