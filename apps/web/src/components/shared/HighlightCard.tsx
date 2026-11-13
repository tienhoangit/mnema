import React, { useState } from 'react';
import {
  Heart,
  Sparkles,
  Share2,
  Trash2,
  MessageSquare,
  Edit3,
  Check,
  X,
  Tag as TagIcon,
  BookOpen,
  Mail,
} from 'lucide-react';
import { Highlight, Source } from '../../types';

interface HighlightCardProps {
  highlight: Highlight;
  source?: Source | null;
  onSelectSource?: (sourceId: string) => void;
  onToggleFavorite?: (hl: Highlight) => void;
  onAskAi?: (hl: Highlight) => void;
  onShare?: (hl: Highlight) => void;
  onSendEmail?: (hl: Highlight) => void;
  onDelete?: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  hideSourceHeader?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  className?: string;
}

export const HighlightCard: React.FC<HighlightCardProps> = ({
  highlight,
  source,
  onSelectSource,
  onToggleFavorite,
  onAskAi,
  onShare,
  onSendEmail,
  onDelete,
  onUpdateNote,
  hideSourceHeader = false,
  isSelected = false,
  onToggleSelect,
  className = '',
}) => {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(highlight.note || '');

  // Color border indicator
  const colorBorderClass =
    highlight.color === 'yellow'
      ? 'border-l-amber-400'
      : highlight.color === 'blue'
      ? 'border-l-sky-400'
      : highlight.color === 'green'
      ? 'border-l-emerald-400'
      : 'border-l-pink-400';

  const authorName = source?.author || highlight.source_author || 'Unknown Author';
  const sourceTitle = source?.name || highlight.source_name || 'Untitled Source';
  const sourceImage = source?.image_url;

  const handleSaveNote = () => {
    if (onUpdateNote) {
      onUpdateNote(highlight.id, noteText.trim() ? noteText.trim() : null);
    }
    setIsEditingNote(false);
  };

  const handleCancelNote = () => {
    setNoteText(highlight.note || '');
    setIsEditingNote(false);
  };

  return (
    <article
      className={`p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs hover:shadow-xs transition-all border-l-4 ${colorBorderClass} group ${className}`}
    >
      {/* 1. Source Header (Optional) */}
      {!hideSourceHeader && (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
          <div
            onClick={() => onSelectSource && onSelectSource(highlight.source_id)}
            className={`flex items-center gap-2.5 min-w-0 ${
              onSelectSource ? 'cursor-pointer hover:opacity-90' : ''
            }`}
          >
            {/* Avatar thumbnail */}
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
              {sourceImage ? (
                <img src={sourceImage} alt={sourceTitle} className="w-full h-full object-cover" />
              ) : (
                sourceTitle.slice(0, 1) || 'S'
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold text-teal-800 dark:text-teal-400 truncate hover:underline">
                {authorName}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {sourceTitle}
              </p>
            </div>
          </div>

          {/* Action Pills */}
          <div className="flex items-center gap-1 opacity-100 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity shrink-0 flex-wrap">
            {onToggleSelect && (
              <label className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={onToggleSelect}
                  className="w-4 h-4 rounded text-teal-800 focus:ring-teal-700"
                />
              </label>
            )}

            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(highlight)}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs transition-colors ${
                  highlight.favorite
                    ? 'text-red-500 fill-red-500'
                    : 'text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
                title="Favorite"
              >
                <Heart
                  className={`w-4 h-4 ${highlight.favorite ? 'fill-red-500 text-red-500' : ''}`}
                />
              </button>
            )}

            {onAskAi && (
              <button
                onClick={() => onAskAi(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Ask AI Copilot"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}

            {onShare && (
              <button
                onClick={() => onShare(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Share Quote Card"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}

            {onSendEmail && (
              <button
                onClick={() => onSendEmail(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Send Highlight via Email"
              >
                <Mail className="w-4 h-4" />
              </button>
            )}

            {onUpdateNote && (
              <button
                onClick={() => setIsEditingNote((prev) => !prev)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-amber-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Edit Personal Note"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            {onDelete && (
              <button
                onClick={() => {
                  if (confirm('Delete this highlight?')) onDelete(highlight.id);
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* When hideSourceHeader is true (e.g. inside SourceView), show minimal action bar */}
      {hideSourceHeader && (
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          {highlight.location ? (
            <span className="text-[11px] font-mono text-neutral-400">Loc {highlight.location}</span>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-1 opacity-100 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity flex-wrap">
            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Favorite"
              >
                <Heart
                  className={`w-4 h-4 ${highlight.favorite ? 'fill-red-500 text-red-500' : ''}`}
                />
              </button>
            )}
            {onAskAi && (
              <button
                onClick={() => onAskAi(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-teal-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Ask AI"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}
            {onShare && (
              <button
                onClick={() => onShare(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
            {onSendEmail && (
              <button
                onClick={() => onSendEmail(highlight)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-teal-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Send Highlight via Email"
              >
                <Mail className="w-4 h-4" />
              </button>
            )}
            {onUpdateNote && (
              <button
                onClick={() => setIsEditingNote((prev) => !prev)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-amber-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Edit Note"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  if (confirm('Delete this highlight?')) onDelete(highlight.id);
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs text-neutral-400 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Quote Body */}
      <blockquote className="text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200 font-serif italic mb-2.5">
        "{highlight.content}"
      </blockquote>

      {/* 3. Personal Note Display or Inline Note Editor */}
      {isEditingNote ? (
        <div className="mt-3 p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add your reflections, thoughts or action items..."
            rows={2}
            className="w-full p-2 text-xs bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-lg border border-amber-200 dark:border-amber-800 focus:outline-hidden focus:border-amber-500 resize-none"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleCancelNote}
              className="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              className="flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              <Check className="w-3 h-3" />
              <span>Save Note</span>
            </button>
          </div>
        </div>
      ) : (
        highlight.note && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold mr-1.5">Note:</span>
              <span>{highlight.note}</span>
            </div>
          </div>
        )
      )}

      {/* 4. Tags List */}
      {highlight.tags && highlight.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {highlight.tags.map((t) => (
            <span
              key={t.id || t.name}
              className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
            >
              #{t.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};

