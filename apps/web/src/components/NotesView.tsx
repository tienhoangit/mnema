import React, { useState } from 'react';
import {
  MessageSquare,
  Search,
  BookOpen,
  Calendar,
  Share2,
  Sparkles,
  Trash2,
  Edit3,
  ExternalLink,
  Tag,
  Check,
  FileText,
  Mail,
} from 'lucide-react';
import { Highlight, Source } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { EmptyState } from './shared/EmptyState';

interface NotesViewProps {
  highlights: Highlight[];
  sources: Source[];
  onSelectSource: (sourceId: string) => void;
  onUpdateHighlightNote: (id: string, note: string | null) => void;
  onDeleteHighlight: (id: string) => void;
  onShare?: (hl: Highlight) => void;
  onAskAi?: (hl: Highlight) => void;
  onSendEmailHighlight?: (hl: Highlight) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  highlights,
  sources,
  onSelectSource,
  onUpdateHighlightNote,
  onDeleteHighlight,
  onShare,
  onAskAi,
  onSendEmailHighlight,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'highlights' | 'sources'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 200);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // 1. Highlight notes
  const highlightNotes = highlights.filter((h) => h.note && h.note.trim().length > 0);

  // 2. Source overall notes
  const sourceNotes = sources.filter((s) => s.source_notes && s.source_notes.trim().length > 0);

  const totalNotes = highlightNotes.length + sourceNotes.length;

  // Filter highlights
  const filteredHighlightNotes = highlightNotes.filter((h) => {
    if (filterType === 'sources') return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const matchNote = h.note?.toLowerCase().includes(q);
      const matchQuote = h.content.toLowerCase().includes(q);
      const matchSource = h.source_name?.toLowerCase().includes(q);
      if (!matchNote && !matchQuote && !matchSource) return false;
    }
    return true;
  });

  // Filter sources
  const filteredSourceNotes = sourceNotes.filter((s) => {
    if (filterType === 'highlights') return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const matchNote = s.source_notes?.toLowerCase().includes(q);
      const matchSource = s.name.toLowerCase().includes(q);
      const matchAuthor = s.author?.toLowerCase().includes(q);
      if (!matchNote && !matchSource && !matchAuthor) return false;
    }
    return true;
  });

  const handleStartEdit = (id: string, currentNote: string) => {
    setEditingId(id);
    setEditingText(currentNote);
  };

  const handleSaveEdit = (id: string) => {
    onUpdateHighlightNote(id, editingText.trim() || null);
    setEditingId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#faf9f5] dark:bg-[#121214] select-none">
      {/* Header */}
      <header className="px-6 py-4 border-b border-neutral-200/70 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-bold text-xs uppercase tracking-wider mb-0.5">
            <MessageSquare className="w-4 h-4" />
            <span>Personal Thoughts</span>
          </div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
            All Notes ({totalNotes})
          </h2>
          <p className="text-xs text-neutral-500">
            A central feed of all personal reflections, margin notes, and synthesis across your library.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search thoughts & notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white border-0 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                filterType === 'all'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              All ({totalNotes})
            </button>
            <button
              onClick={() => setFilterType('highlights')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                filterType === 'highlights'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Highlight Notes ({highlightNotes.length})
            </button>
            <button
              onClick={() => setFilterType('sources')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                filterType === 'sources'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Book Syntheses ({sourceNotes.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Stream */}
      <main className="p-6 max-w-4xl mx-auto w-full space-y-6">
        {filteredHighlightNotes.length === 0 && filteredSourceNotes.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No notes found matching your filter"
            description="When you highlight text, add your reflections or margin notes to capture your synthesis!"
          />
        ) : (
          <div className="space-y-6">
            {/* 1. Source Overall Syntheses */}
            {filteredSourceNotes.map((src) => (
              <div
                key={`src-${src.id}`}
                className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-teal-200/60 dark:border-teal-900/40 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between text-xs">
                  <div
                    onClick={() => onSelectSource(src.id)}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-neutral-900 dark:text-white group-hover:text-teal-700 transition-colors">
                        {src.name}
                      </p>
                      {src.author && <p className="text-[11px] text-neutral-400">by {src.author}</p>}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[10px] font-bold text-teal-800 dark:text-teal-400 uppercase tracking-wider">
                    Source Synthesis
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {src.source_notes}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => onSelectSource(src.id)}
                    className="text-xs text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>Open Source</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* 2. Highlight Personal Reflections */}
            {filteredHighlightNotes.map((hl) => {
              const colorBorder =
                hl.color === 'yellow'
                  ? 'border-yellow-400'
                  : hl.color === 'blue'
                  ? 'border-sky-400'
                  : hl.color === 'green'
                  ? 'border-emerald-400'
                  : 'border-pink-400';

              const isEditing = editingId === hl.id;

              return (
                <div
                  key={hl.id}
                  className={`p-6 rounded-3xl bg-white dark:bg-neutral-900 border-l-4 ${colorBorder} border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-4`}
                >
                  {/* Note Header / Reflection */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-wide">
                      <MessageSquare className="w-4 h-4 text-amber-600" />
                      <span>My Thought</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(hl.id, hl.note || '')}
                        className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        title="Edit thought"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={3}
                        className="w-full p-3 text-xs sm:text-sm rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-hidden"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 text-xs text-neutral-500"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(hl.id)}
                          className="px-3 py-1 text-xs bg-teal-800 text-white rounded-lg font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm sm:text-base font-sans text-neutral-900 dark:text-neutral-100 font-medium leading-relaxed">
                      {hl.note}
                    </p>
                  )}

                  {/* Attached Highlight Quote */}
                  <div className="p-3.5 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                      In response to quote:
                    </span>
                    <blockquote className="font-serif italic text-neutral-700 dark:text-neutral-300">
                      “{hl.content}”
                    </blockquote>
                  </div>

                  {/* Attribution and actions */}
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
                    <button
                      onClick={() => onSelectSource(hl.source_id)}
                      className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 hover:text-teal-700 dark:hover:text-teal-400 font-semibold truncate max-w-xs transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span className="truncate">{hl.source_name || 'Source'}</span>
                      {hl.source_author && <span className="font-normal truncate">· {hl.source_author}</span>}
                    </button>

                    <div className="flex items-center gap-1">
                      {onAskAi && (
                        <button
                          onClick={() => onAskAi(hl)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-neutral-800 transition-colors"
                          title="Ask AI about this thought"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        </button>
                      )}

                      {onShare && (
                        <button
                          onClick={() => onShare(hl)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-neutral-800 transition-colors"
                          title="Share"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {onSendEmailHighlight && (
                        <button
                          onClick={() => onSendEmailHighlight(hl)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-neutral-800 transition-colors"
                          title="Send via Email"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (confirm('Delete this highlight and note?')) {
                            onDeleteHighlight(hl.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

