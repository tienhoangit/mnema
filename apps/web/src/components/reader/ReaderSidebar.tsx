import React from 'react';
import { X, Highlighter, MessageSquare, FileText } from 'lucide-react';
import { Highlight } from '../../types';
import { PendingHighlight } from '../../services/offlineDb';

interface ReaderSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  notebookTab: 'highlights' | 'notes';
  setNotebookTab: (tab: 'highlights' | 'notes') => void;
  highlightsCount: number;
  highlights: Highlight[];
  pendingHighlights: PendingHighlight[];
  onScrollToHighlight: (content: string) => void;
  sourceNotes: string;
  notesSaveStatus: 'idle' | 'saving' | 'saved';
  onNotesChange: (val: string) => void;
}

export const ReaderSidebar: React.FC<ReaderSidebarProps> = ({
  isOpen,
  onClose,
  notebookTab,
  setNotebookTab,
  highlightsCount,
  highlights,
  pendingHighlights,
  onScrollToHighlight,
  sourceNotes,
  notesSaveStatus,
  onNotesChange,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="w-80 sm:w-96 border-l border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md flex flex-col h-full shrink-0 select-none animate-in slide-in-from-right duration-150 z-20">
      {/* Notebook Tabs Header */}
      <div className="p-3 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setNotebookTab('highlights')}
            className={`px-3 py-1 rounded-lg transition-all ${
              notebookTab === 'highlights'
                ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Highlights ({highlightsCount})
          </button>
          <button
            onClick={() => setNotebookTab('notes')}
            className={`px-3 py-1 rounded-lg transition-all ${
              notebookTab === 'notes'
                ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Notes
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          title="Close Notebook"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Notebook Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notebookTab === 'highlights' ? (
          <>
            {highlights.length === 0 && pendingHighlights.length === 0 ? (
              <div className="py-16 text-center text-xs text-neutral-400 space-y-1">
                <Highlighter className="w-6 h-6 mx-auto text-neutral-300 dark:text-neutral-700" />
                <p>No highlights in this article yet.</p>
                <p className="text-[11px] text-neutral-400">Select any text in the article to create one.</p>
              </div>
            ) : (
              <>
                {highlights.map((hl) => (
                  <div
                    key={hl.id}
                    onClick={() => onScrollToHighlight(hl.content)}
                    className="p-3.5 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 hover:border-teal-700 cursor-pointer transition-all shadow-2xs space-y-2 group"
                    title="Click to scroll to this highlight in article"
                  >
                    <blockquote className="font-serif italic text-xs text-neutral-800 dark:text-neutral-200 line-clamp-3">
                      “{hl.content}”
                    </blockquote>
                    {hl.note && (
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-[11px] flex items-start gap-1.5">
                        <MessageSquare className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                        <p className="line-clamp-2">{hl.note}</p>
                      </div>
                    )}
                    <span className="text-[10px] text-neutral-400 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors block">
                      Jump to position →
                    </span>
                  </div>
                ))}
                {pendingHighlights.map((hl) => (
                  <div
                    key={hl.id}
                    onClick={() => onScrollToHighlight(hl.content)}
                    className="p-3.5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 cursor-pointer transition-all shadow-2xs space-y-2"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Offline (pending sync)
                    </span>
                    <blockquote className="font-serif italic text-xs text-neutral-800 dark:text-neutral-200 line-clamp-3">
                      “{hl.content}”
                    </blockquote>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Article Overall Notes</span>
              </span>
              <span className="text-[11px] font-mono text-neutral-400">
                {notesSaveStatus === 'saving' ? (
                  <span className="text-amber-500 animate-pulse">Saving...</span>
                ) : (
                  <span className="text-emerald-600">Saved ✓</span>
                )}
              </span>
            </div>
            <textarea
              value={sourceNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Write article summary, personal reflections, or key points here (autosaves automatically)..."
              className="flex-1 w-full p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs sm:text-sm text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 resize-none leading-relaxed"
            />
          </div>
        )}
      </div>
    </aside>
  );
};
