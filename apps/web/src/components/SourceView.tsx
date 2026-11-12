import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  MessageSquare,
  Plus,
  Save,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  X,
  Check,
  Tag as TagIcon,
  FileText,
  Mail,
  Globe,
  Copy,
  Link2,
  Loader2,
} from 'lucide-react';
import { Source, Highlight, ReadingStatus, HighlightColor, SourceType, PublicShare } from '../types';
import { HighlightCard } from './shared/HighlightCard';
import { EmptyState } from './shared/EmptyState';
import { api } from '../services/api';

interface SourceViewProps {
  source: Source;
  onBack: () => void;
  onUpdateSource: (updates: Partial<Source>) => void;
  onDeleteSource: () => Promise<void>;
  onCreateHighlight: (data: {
    content: string;
    note?: string;
    color: HighlightColor;
    location?: string;
  }) => Promise<void>;
  onUpdateHighlight: (id: string, updates: Partial<Highlight>) => void;
  onDeleteHighlight: (id: string) => void;
  onOpenReader?: () => void;
  onAskAi?: (hl: Highlight) => void;
  onShare?: (hl: Highlight) => void;
  onSendEmailSource?: (source: Source) => void;
  onSendEmailHighlight?: (hl: Highlight) => void;
}

export const SourceView: React.FC<SourceViewProps> = ({
  source,
  onBack,
  onUpdateSource,
  onDeleteSource,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onOpenReader,
  onAskAi,
  onShare,
  onSendEmailSource,
  onSendEmailHighlight,
}) => {
  // Source Notes autosave state
  const [sourceNotes, setSourceNotes] = useState(source.source_notes || '');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('saved');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if source changes externally
  useEffect(() => {
    setSourceNotes(source.source_notes || '');
  }, [source.source_notes]);

  const handleNotesChange = (val: string) => {
    setSourceNotes(val);
    setSaveStatus('saving');

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      onUpdateSource({ source_notes: val });
      setSaveStatus('saved');
    }, 800);
  };

  // Highlights state
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'location'>('newest');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [isAddingHighlight, setIsAddingHighlight] = useState(false);
  const [newQuoteText, setNewQuoteText] = useState('');
  const [newQuoteLocation, setNewQuoteLocation] = useState('');
  const [newQuoteNote, setNewQuoteNote] = useState('');
  const [newQuoteColor, setNewQuoteColor] = useState<HighlightColor>('yellow');

  // Inline editing note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Public share state for this Source
  const [sourceShare, setSourceShare] = useState<PublicShare | null>(null);
  const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [copiedSourceShare, setCopiedSourceShare] = useState(false);

  useEffect(() => {
    api
      .getShareForTarget('source', source.id)
      .then((res) => setSourceShare(res))
      .catch(() => setSourceShare(null));
  }, [source.id]);

  const handleToggleSourceShare = async () => {
    setIsSharePanelOpen((prev) => !prev);
  };

  const handleCreateSourceShare = async () => {
    setIsShareLoading(true);
    try {
      const share = await api.createShareLink('source', source.id);
      setSourceShare(share);
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleRevokeSourceShare = async () => {
    if (!sourceShare) return;
    setIsShareLoading(true);
    try {
      await api.revokeShareLink(sourceShare.slug);
      setSourceShare(null);
    } finally {
      setIsShareLoading(false);
    }
  };

  const highlights = source.highlights || [];

  const filteredHighlights = highlights
    .filter((hl) => {
      if (colorFilter !== 'all' && hl.color !== colorFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchQuote = hl.content.toLowerCase().includes(q);
        const matchNote = hl.note?.toLowerCase().includes(q);
        if (!matchQuote && !matchNote) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'location') {
        return (a.location || '').localeCompare(b.location || '', undefined, { numeric: true });
      }
      return 0;
    });

  const handleCreateHighlightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuoteText.trim()) return;

    await onCreateHighlight({
      content: newQuoteText.trim(),
      note: newQuoteNote.trim() || undefined,
      location: newQuoteLocation.trim() || undefined,
      color: newQuoteColor,
    });

    setNewQuoteText('');
    setNewQuoteLocation('');
    setNewQuoteNote('');
    setIsAddingHighlight(false);
  };

  const handleSaveInlineNote = (hlId: string) => {
    onUpdateHighlight(hlId, { note: editingNoteText.trim() || null });
    setEditingNoteId(null);
  };

  const canReadArticle = Boolean(source.content_html && source.content_html.trim().length > 0);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-[#faf9f5] dark:bg-[#121214] overflow-y-auto">
      {/* Top Sticky Header */}
      <div className="sticky top-0 z-20 px-6 py-3.5 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400">
            {source.type}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canReadArticle && onOpenReader && (
            <button
              onClick={onOpenReader}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Read Full Article</span>
            </button>
          )}

          {onSendEmailSource && (
            <button
              onClick={() => onSendEmailSource(source)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors"
              title="Email Book / Source Summary"
            >
              <Mail className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span className="hidden sm:inline">Email Summary</span>
            </button>
          )}

          <div className="relative">
            <button
              onClick={handleToggleSourceShare}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                sourceShare
                  ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100'
              }`}
              title="Public Read-Only Share Link"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{sourceShare ? 'Shared' : 'Share Link'}</span>
            </button>

            {isSharePanelOpen && (
              <div className="absolute right-0 mt-2 w-80 p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl z-30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-teal-700" />
                    Public Read-Only Link
                  </span>
                  <button
                    onClick={() => setIsSharePanelOpen(false)}
                    className="p-1 text-neutral-400 hover:text-neutral-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {sourceShare ? (
                  <div className="space-y-2.5">
                    <p className="text-[11px] font-mono bg-neutral-50 dark:bg-neutral-800 p-2 rounded-lg truncate text-neutral-600 dark:text-neutral-300">
                      {`${window.location.origin}/share/${sourceShare.slug}`}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/share/${sourceShare.slug}`
                          );
                          setCopiedSourceShare(true);
                          setTimeout(() => setCopiedSourceShare(false), 2000);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-teal-800 text-white text-xs font-semibold hover:bg-teal-700"
                      >
                        {copiedSourceShare ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSourceShare ? 'Copied!' : 'Copy URL'}</span>
                      </button>
                      <a
                        href={`/share/${sourceShare.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-200"
                      >
                        Open
                      </a>
                      <button
                        onClick={handleRevokeSourceShare}
                        disabled={isShareLoading}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                        title="Revoke share link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-neutral-500">
                      Create a read-only link for this book/article with all its highlights and notes.
                    </p>
                    <button
                      onClick={handleCreateSourceShare}
                      disabled={isShareLoading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {isShareLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Link2 className="w-3.5 h-3.5" />
                      )}
                      <span>Generate Public Link</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Open external source URL"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            onClick={() => {
              if (confirm(`Delete "${source.name}" and all its highlights?`)) {
                onDeleteSource();
              }
            }}
            className="p-2 rounded-xl text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete this source"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full p-6 sm:p-8 space-y-8">
        {/* Hero Section: Cover, Title, Metadata & Status */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row items-start gap-6">
          {/* Cover Display */}
          <div className="shrink-0 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden shadow-md border border-black/10 dark:border-white/10 bg-gradient-to-br from-teal-800 via-teal-900 to-neutral-950 flex flex-col justify-between p-3 text-white">
            {source.image_url ? (
              <img
                src={source.image_url}
                alt={source.name}
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <div className="h-full flex flex-col justify-between text-left">
                <span className="text-[10px] uppercase font-bold tracking-widest text-teal-300 opacity-80">
                  {source.type}
                </span>
                <p className="font-serif font-bold text-sm leading-snug line-clamp-4">
                  {source.name}
                </p>
                <p className="text-[10px] text-teal-200/80 truncate">
                  {source.author || 'Mnema Library'}
                </p>
              </div>
            )}
          </div>

          {/* Details & Reading Status */}
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-serif text-neutral-900 dark:text-white leading-tight">
                {source.name}
              </h1>
              {source.author && (
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-1">
                  By <strong className="text-neutral-700 dark:text-neutral-200">{source.author}</strong>
                </p>
              )}
            </div>

            {/* Reading Status Selector & Pills */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 font-medium">Status:</span>
                <select
                  value={source.reading_status}
                  onChange={(e) =>
                    onUpdateSource({ reading_status: e.target.value as ReadingStatus })
                  }
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 cursor-pointer"
                >
                  <option value="want_to_read">Want to Read</option>
                  <option value="reading">Currently Reading</option>
                  <option value="read">Finished / Read</option>
                  <option value="inbox">Inbox</option>
                  <option value="later">Read Later</option>
                  <option value="archive">Archive</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-xl">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>{highlights.length} Highlights</span>
              </div>

              {source.word_count > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-xl">
                  <Clock className="w-3.5 h-3.5 text-teal-600" />
                  <span>{source.reading_time || Math.round(source.word_count / 200)} min read</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Source Notes Section with Autosave */}
        <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-neutral-900 dark:text-white">
              <FileText className="w-4 h-4 text-teal-700" />
              <span>Source Notes & Synthesis</span>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">
              {saveStatus === 'saving' ? (
                <span className="text-amber-500 animate-pulse">Saving...</span>
              ) : (
                <span className="text-emerald-600">Saved ✓</span>
              )}
            </span>
          </div>

          <textarea
            value={sourceNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Write key takeaways, synthesis, book review, or summary here (autosaves automatically)..."
            rows={5}
            className="w-full p-4 text-xs sm:text-sm rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden focus:border-teal-700 font-sans leading-relaxed resize-y"
          />
        </div>

        {/* Highlights Section */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <span>Highlights</span>
                <span className="text-xs font-normal text-neutral-400">
                  ({filteredHighlights.length} of {highlights.length})
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddingHighlight((prev) => !prev)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Quote</span>
              </button>
            </div>
          </div>

          {/* Search, Sort and Filter Bar */}
          <div className="p-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search quotes in this source..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800 border-0 text-neutral-900 dark:text-white focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Color filter */}
              <select
                value={colorFilter}
                onChange={(e) => setColorFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
              >
                <option value="all">All Colors</option>
                <option value="yellow">Yellow</option>
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="pink">Pink</option>
              </select>

              {/* Sort by */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="location">By Location (Page / Pos)</option>
              </select>
            </div>
          </div>

          {/* New Highlight Manual Input Form */}
          {isAddingHighlight && (
            <form
              onSubmit={handleCreateHighlightSubmit}
              className="p-5 rounded-3xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60 shadow-xs space-y-4 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-900 dark:text-teal-300">
                  New Highlight Quote
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingHighlight(false)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                value={newQuoteText}
                onChange={(e) => setNewQuoteText(e.target.value)}
                placeholder="Paste or write the quote here..."
                required
                rows={3}
                className="w-full p-3 text-xs sm:text-sm rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-teal-700 focus:outline-hidden"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newQuoteLocation}
                  onChange={(e) => setNewQuoteLocation(e.target.value)}
                  placeholder="Location (e.g. Page 42, Chapter 3)"
                  className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-teal-700 focus:outline-hidden"
                />
                <input
                  type="text"
                  value={newQuoteNote}
                  onChange={(e) => setNewQuoteNote(e.target.value)}
                  placeholder="Personal reflection or note (optional)"
                  className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-teal-700 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {/* Color swatches */}
                <div className="flex items-center gap-1.5">
                  {(['yellow', 'blue', 'green', 'pink'] as HighlightColor[]).map((c) => {
                    const bgClass =
                      c === 'yellow'
                        ? 'bg-yellow-400'
                        : c === 'blue'
                        ? 'bg-sky-400'
                        : c === 'green'
                        ? 'bg-emerald-400'
                        : 'bg-pink-400';
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setNewQuoteColor(c)}
                        className={`w-5 h-5 rounded-full ${bgClass} transition-transform ${
                          newQuoteColor === c ? 'ring-2 ring-teal-700 scale-110' : 'opacity-70'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingHighlight(false)}
                    className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs"
                  >
                    Save Quote
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Highlights List */}
          {filteredHighlights.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 text-neutral-400 space-y-2">
              <p className="text-xs">No highlights match the current filters.</p>
              <button
                onClick={() => setIsAddingHighlight(true)}
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                + Add a highlight
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHighlights.map((hl) => (
                <HighlightCard
                  key={hl.id}
                  highlight={hl}
                  source={source}
                  hideSourceHeader={true}
                  onToggleFavorite={() => onUpdateHighlight(hl.id, { favorite: !hl.favorite })}
                  onAskAi={onAskAi}
                  onShare={onShare}
                  onSendEmail={onSendEmailHighlight}
                  onUpdateNote={(id, note) => onUpdateHighlight(id, { note })}
                  onDelete={onDeleteHighlight}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
