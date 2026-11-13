import React from 'react';
import {
  MessageSquare,
  Highlighter,
  Sparkles,
  Languages,
  X,
  Loader2,
  Check,
  BookmarkPlus,
} from 'lucide-react';
import { HighlightColor } from '../../types';

export interface GhostreaderState {
  action: 'explain' | 'translate';
  text: string;
  loading: boolean;
  result: string;
  error?: string;
  saved?: boolean;
}

interface SelectionToolbarProps {
  selectionRange: { x: number; top: number; bottom: number } | null;
  selectionPopoverRef: React.RefObject<HTMLDivElement | null>;
  highlightColor: HighlightColor;
  setHighlightColor: (c: HighlightColor) => void;
  showNoteInput: boolean;
  setShowNoteInput: (val: boolean) => void;
  highlightNote: string;
  setHighlightNote: (val: string) => void;
  onSaveHighlight: () => void;
  isSavingHighlight: boolean;
  ghostreader: GhostreaderState | null;
  onRunGhostreader: (action: 'explain' | 'translate') => void;
  onDismissGhostreader: () => void;
  onSaveGhostreaderAsNote: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectionRange,
  selectionPopoverRef,
  highlightColor,
  setHighlightColor,
  showNoteInput,
  setShowNoteInput,
  highlightNote,
  setHighlightNote,
  onSaveHighlight,
  isSavingHighlight,
  ghostreader,
  onRunGhostreader,
  onDismissGhostreader,
  onSaveGhostreaderAsNote,
}) => {
  // Final pass: measure the rendered toolbar and nudge it fully inside the viewport
  // (the toolbar wraps on narrow screens, so its real width is only known after layout).
  React.useLayoutEffect(() => {
    const el = selectionPopoverRef.current;
    if (!el || !selectionRange) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const currentLeft = parseFloat(el.style.left) || 0;
    if (rect.left < margin) {
      el.style.left = `${currentLeft + (margin - rect.left)}px`;
    } else if (rect.right > window.innerWidth - margin) {
      el.style.left = `${currentLeft - (rect.right - (window.innerWidth - margin))}px`;
    }
  });

  if (!selectionRange) return null;

  const placeBelow = selectionRange.top < (ghostreader ? 340 : 130);
  // Initial horizontal clamp so a selection at the screen edge (e.g. x=5px or x=355px on a
  // 360px phone) never anchors the centred toolbar off-screen.
  const clampedX = Math.max(160, Math.min(window.innerWidth - 160, selectionRange.x));

  return (
    <div
      ref={selectionPopoverRef}
      style={{
        position: 'fixed',
        left: `${clampedX}px`,
        top: `${placeBelow
            ? Math.min(window.innerHeight - 80, selectionRange.bottom + 10)
            : Math.max(64, selectionRange.top - 10)
          }px`,
        transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      className="z-40 bg-neutral-900 text-white rounded-2xl shadow-xl p-2 sm:p-2.5 flex flex-col gap-2 max-w-[calc(100vw-24px)] w-max border border-neutral-800 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
        {/* Color buttons with touch-friendly hit areas */}
        <div className="flex items-center gap-0.5">
          {(['yellow', 'blue', 'green', 'pink'] as HighlightColor[]).map((c) => {
            const colorBg =
              c === 'yellow'
                ? 'bg-yellow-400'
                : c === 'blue'
                  ? 'bg-sky-400'
                  : c === 'green'
                    ? 'bg-emerald-400'
                    : 'bg-pink-400';
            return (
              <button
                key={c}
                onClick={() => setHighlightColor(c)}
                aria-label={`Highlight color ${c}`}
                title={`Color ${c}`}
                className="min-w-[36px] min-h-[40px] flex items-center justify-center p-1.5 rounded-full hover:bg-neutral-800 transition-colors"
              >
                <span
                  className={`w-5 h-5 rounded-full ${colorBg} transition-transform ${highlightColor === c
                      ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-neutral-900'
                      : 'opacity-80 hover:opacity-100'
                    }`}
                />
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-neutral-700 mx-0.5" />

        <button
          onClick={() => setShowNoteInput(!showNoteInput)}
          className={`min-w-[40px] min-h-[40px] p-2 rounded-xl text-xs flex items-center justify-center transition-colors ${showNoteInput
              ? 'bg-neutral-800 text-teal-300 ring-1 ring-teal-500/40'
              : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
            }`}
          title="Add Note"
          aria-label="Add Note"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <button
          onClick={onSaveHighlight}
          disabled={isSavingHighlight}
          className="min-h-[40px] px-3 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
          title="Highlight (h)"
        >
          <Highlighter className="w-4 h-4" />
          <span>Highlight</span>
        </button>

        <div className="w-px h-5 bg-neutral-700 mx-0.5" />

        <button
          onClick={() => onRunGhostreader('explain')}
          disabled={ghostreader?.loading}
          className={`min-h-[40px] px-2.5 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${ghostreader?.action === 'explain'
              ? 'bg-amber-500/20 text-amber-300'
              : 'text-neutral-200 hover:bg-neutral-800'
            }`}
          title="Ghostreader: Explain selection"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Explain</span>
        </button>

        <button
          onClick={() => onRunGhostreader('translate')}
          disabled={ghostreader?.loading}
          className={`min-h-[40px] px-2.5 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${ghostreader?.action === 'translate'
              ? 'bg-sky-500/20 text-sky-300'
              : 'text-neutral-200 hover:bg-neutral-800'
            }`}
          title="Ghostreader: Translate (VI/EN)"
        >
          <Languages className="w-4 h-4 text-sky-400" />
          <span>Translate</span>
        </button>
      </div>

      {showNoteInput && (
        <input
          type="text"
          autoFocus
          placeholder="Add your personal note..."
          value={highlightNote}
          onChange={(e) => setHighlightNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveHighlight();
          }}
          className="w-full px-3 py-2 text-xs bg-neutral-800 rounded-xl text-white border border-neutral-700 focus:outline-hidden focus:border-teal-500"
        />
      )}

      {/* Ghostreader Inline Result Popover */}
      {ghostreader && (
        <div className="w-80 sm:w-96 max-w-[calc(100vw-32px)] bg-neutral-800/95 border border-neutral-700 rounded-xl p-3 space-y-2 text-xs font-sans">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
              {ghostreader.action === 'explain' ? (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Ghostreader • Explain</span>
                </>
              ) : (
                <>
                  <Languages className="w-4 h-4 text-sky-400" />
                  <span>Ghostreader • Translate (VI/EN)</span>
                </>
              )}
            </span>
            <button
              onClick={onDismissGhostreader}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700"
              title="Dismiss (Esc)"
              aria-label="Dismiss Ghostreader"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {ghostreader.loading ? (
            <div className="flex items-center gap-2 py-2 text-neutral-300">
              <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              <span>{ghostreader.action === 'explain' ? 'Explaining passage...' : 'Translating...'}</span>
            </div>
          ) : ghostreader.error ? (
            <p className="text-red-400 leading-relaxed">{ghostreader.error}</p>
          ) : (
            <>
              <p className="text-neutral-100 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {ghostreader.result}
              </p>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-700/70">
                {ghostreader.saved ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1 py-1">
                    <Check className="w-4 h-4" />
                    Saved as highlight note
                  </span>
                ) : (
                  <button
                    onClick={onSaveGhostreaderAsNote}
                    disabled={isSavingHighlight}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                    <span>Save as Highlight Note</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
