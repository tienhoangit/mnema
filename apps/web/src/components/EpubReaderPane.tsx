import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Highlighter, Loader2, List, X } from 'lucide-react';
import type { Book, Rendition, NavItem } from 'epubjs';
import { Highlight, HighlightColor, ReaderSettings } from '../types';

interface EpubReaderPaneProps {
  sourceId: string;
  initialProgress: number;
  settings: ReaderSettings;
  highlights: Highlight[];
  onCreateHighlight: (data: {
    content: string;
    color: HighlightColor;
    location?: string;
  }) => Promise<void>;
  onUpdateProgress: (progress: number) => void;
}

const THEME_STYLES: Record<
  ReaderSettings['theme'],
  { bg: string; fg: string; link: string }
> = {
  light: { bg: '#ffffff', fg: '#171717', link: '#0f766e' },
  sepia: { bg: '#f6efe0', fg: '#3b2f1e', link: '#0f766e' },
  dark: { bg: '#18181b', fg: '#e5e5e5', link: '#2dd4bf' },
};

const HIGHLIGHT_FILL: Record<HighlightColor, string> = {
  yellow: 'rgba(250, 204, 21, 0.35)',
  blue: 'rgba(56, 189, 248, 0.35)',
  green: 'rgba(52, 211, 153, 0.35)',
  pink: 'rgba(244, 114, 182, 0.35)',
};

export const EpubReaderPane: React.FC<EpubReaderPaneProps> = ({
  sourceId,
  initialProgress,
  settings,
  highlights,
  onCreateHighlight,
  onUpdateProgress,
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [currentPct, setCurrentPct] = useState(Math.round((initialProgress || 0) * 100));
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    cfiRange: string;
  } | null>(null);
  const [savingHighlight, setSavingHighlight] = useState(false);

  // Apply reader theme & typography to active rendition
  const applyTheme = (rendition: Rendition, currentSettings: ReaderSettings) => {
    const palette = THEME_STYLES[currentSettings.theme] || THEME_STYLES.light;
    const fontFamily =
      currentSettings.fontFamily === 'sans'
        ? '"Figtree", system-ui, sans-serif'
        : '"Lora", Georgia, serif';

    rendition.themes.default({
      body: {
        background: `${palette.bg} !important`,
        color: `${palette.fg} !important`,
        'font-family': `${fontFamily} !important`,
        'font-size': `${currentSettings.fontSize}px !important`,
        'line-height': `${currentSettings.lineHeight} !important`,
        padding: '12px 24px !important',
      },
      'a, a:link, a:visited': {
        color: `${palette.link} !important`,
      },
    });
  };

  useEffect(() => {
    let cancelled = false;
    let book: Book | null = null;

    async function loadEpub() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/sources/${sourceId}/epub`);
        if (!res.ok) {
          throw new Error(`Failed to load EPUB (HTTP ${res.status})`);
        }
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled || !viewerRef.current) return;

        // Lazy-load epubjs only when opening an EPUB source
        const epubModule = await import('epubjs');
        const ePub = epubModule.default;
        if (cancelled || !viewerRef.current) return;

        book = ePub(arrayBuffer);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: 620,
          spread: 'none',
          flow: 'paginated',
        });
        renditionRef.current = rendition;

        applyTheme(rendition, settings);

        const savedCfi = localStorage.getItem(`mnema_epub_cfi_${sourceId}`);
        await rendition.display(savedCfi || undefined);

        // Load TOC
        book.loaded.navigation
          .then((nav) => {
            if (!cancelled && nav?.toc) {
              setToc(nav.toc);
            }
          })
          .catch(() => {});

        // Generate locations in background for percentage progress
        book.ready
          .then(() => book!.locations.generate(1600))
          .then(() => {
            if (!cancelled && !savedCfi && initialProgress > 0 && initialProgress < 1) {
              const targetCfi = book!.locations.cfiFromPercentage(initialProgress);
              if (targetCfi) {
                rendition.display(targetCfi).catch(() => {});
              }
            }
          })
          .catch(() => {});

        // Track reading progress
        rendition.on('relocated', (location: { start?: { cfi?: string; percentage?: number } }) => {
          const cfi = location?.start?.cfi;
          if (cfi) {
            try {
              localStorage.setItem(`mnema_epub_cfi_${sourceId}`, cfi);
            } catch {
              // ignore storage quota
            }
          }
          const pct = location?.start?.percentage;
          if (typeof pct === 'number' && Number.isFinite(pct)) {
            const clamped = Math.min(1, Math.max(0, pct));
            setCurrentPct(Math.round(clamped * 100));
            if (progressTimerRef.current) {
              window.clearTimeout(progressTimerRef.current);
            }
            progressTimerRef.current = window.setTimeout(() => {
              onUpdateProgress(Number(clamped.toFixed(3)));
            }, 800);
          }
        });

        // Handle text selection inside EPUB iframe
        rendition.on('selected', (cfiRange: string, contents: { window: Window }) => {
          const selection = contents?.window?.getSelection();
          const text = selection?.toString().trim() || '';
          if (text.length >= 3) {
            setPendingSelection({ text, cfiRange });
          }
        });

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to open EPUB');
          setLoading(false);
        }
      }
    }

    void loadEpub();

    return () => {
      cancelled = true;
      if (progressTimerRef.current) {
        window.clearTimeout(progressTimerRef.current);
      }
      if (book) {
        try {
          book.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [sourceId]);

  // Re-apply theme when ReaderSettings change
  useEffect(() => {
    if (renditionRef.current) {
      applyTheme(renditionRef.current, settings);
    }
  }, [settings]);

  // Render existing CFI highlights onto the EPUB rendition
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    for (const hl of highlights) {
      if (hl.location && hl.location.startsWith('epubcfi(')) {
        try {
          rendition.annotations.highlight(
            hl.location,
            {},
            undefined,
            undefined,
            { fill: HIGHLIGHT_FILL[hl.color] || HIGHLIGHT_FILL.yellow }
          );
        } catch {
          // ignore invalid or out-of-range CFIs
        }
      }
    }
  }, [highlights, loading]);

  const handleSaveHighlight = async (color: HighlightColor) => {
    if (!pendingSelection) return;
    setSavingHighlight(true);
    try {
      await onCreateHighlight({
        content: pendingSelection.text,
        color,
        location: pendingSelection.cfiRange,
      });
      if (renditionRef.current) {
        try {
          renditionRef.current.annotations.highlight(
            pendingSelection.cfiRange,
            {},
            undefined,
            undefined,
            { fill: HIGHLIGHT_FILL[color] }
          );
        } catch {
          // ignore annotation render error
        }
      }
      setPendingSelection(null);
    } finally {
      setSavingHighlight(false);
    }
  };

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-sans">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      {/* EPUB Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowToc((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-medium"
          >
            <List className="w-3.5 h-3.5" />
            <span>Chapters ({toc.length})</span>
          </button>
          <span className="text-neutral-500 font-medium">{currentPct}% read</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => renditionRef.current?.prev()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-medium"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <button
            onClick={() => renditionRef.current?.next()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-medium"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Selection Highlight Action Bar */}
      {pendingSelection && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/90 dark:bg-teal-950/40 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Highlighter className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="truncate italic text-neutral-700 dark:text-neutral-200">
              “{pendingSelection.text}”
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {(['yellow', 'blue', 'green', 'pink'] as HighlightColor[]).map((c) => (
              <button
                key={c}
                disabled={savingHighlight}
                onClick={() => void handleSaveHighlight(c)}
                className="w-5 h-5 rounded-full border border-black/15 hover:scale-110 transition-transform"
                style={{ backgroundColor: HIGHLIGHT_FILL[c].replace('0.35', '0.9') }}
                title={`Highlight ${c}`}
              />
            ))}
            <button
              onClick={() => setPendingSelection(null)}
              className="p-1 text-neutral-400 hover:text-neutral-600"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Optional Chapter Drawer */}
      {showToc && toc.length > 0 && (
        <div className="max-h-56 overflow-y-auto p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1 text-xs">
          {toc.map((item, idx) => (
            <button
              key={`${item.href}-${idx}`}
              onClick={() => {
                void renditionRef.current?.display(item.href);
                setShowToc(false);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 truncate"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* EPUB Rendition Container */}
      <div className="relative rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900 min-h-[620px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 dark:bg-neutral-900/80 text-xs text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin text-teal-700" />
            <span>Loading EPUB book...</span>
          </div>
        )}
        <div ref={viewerRef} className="w-full h-[620px]" />
      </div>
    </div>
  );
};
