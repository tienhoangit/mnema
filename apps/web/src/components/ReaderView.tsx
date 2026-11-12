import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Type,
  Minus,
  Plus,
  Maximize2,
  Minimize2,
  Clock,
  Archive,
  Inbox,
  Trash2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Highlighter,
  MessageSquare,
  Check,
  ExternalLink,
  Sparkles,
  BookMarked,
  X,
  FileText,
  WifiOff,
  Languages,
  Loader2,
  BookmarkPlus,
} from 'lucide-react';
import { AiCopilotModal } from './AiCopilotModal';
import { TocPanel } from './TocPanel';
import { Source, Highlight, HighlightColor, ReaderSettings, ReadingStatus, TranscriptSegment, ReaderPreset } from '../types';
import { READER_PRESETS } from '../hooks/useReaderSettings';
import { saveArticleOffline, getArticleOffline, savePendingHighlight, getPendingHighlights, PendingHighlight } from '../services/offlineDb';
import { api } from '../services/api';

interface ReaderViewProps {
  source: Source;
  onBack: () => void;
  onUpdateStatus: (status: ReadingStatus) => Promise<void>;
  onDelete: () => Promise<void>;
  onCreateHighlight: (data: { content: string; note?: string; color: HighlightColor; location?: string }) => Promise<void>;
  settings: ReaderSettings;
  onUpdateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  onUpdateSourceNotes?: (notes: string) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  source,
  onBack,
  onUpdateStatus,
  onDelete,
  onCreateHighlight,
  settings,
  onUpdateSetting,
  onUpdateSourceNotes,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null);

  // Offline caching & fallback state
  const [offlineFallbackHtml, setOfflineFallbackHtml] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    if (source.content_html && source.content_html.trim().length > 0) {
      saveArticleOffline(source);
    } else {
      getArticleOffline(source.id).then((cached) => {
        if (cached?.content_html) {
          setOfflineFallbackHtml(cached.content_html);
        }
      });
    }

    const onOnline = () => setIsOffline(false);
    const onOffline = () => {
      setIsOffline(true);
      if (!source.content_html) {
        getArticleOffline(source.id).then((cached) => {
          if (cached?.content_html) setOfflineFallbackHtml(cached.content_html);
        });
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [source.id, source.content_html]);

  // Notebook Side Panel State
  const [isNotebookOpen, setIsNotebookOpen] = useState(false);
  const [notebookTab, setNotebookTab] = useState<'highlights' | 'notes'>('highlights');
  const [sourceNotes, setSourceNotes] = useState(source.source_notes || '');
  const [notesSaveStatus, setNotesSaveStatus] = useState<'saved' | 'saving' | 'idle'>('saved');
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSourceNotes(source.source_notes || '');
  }, [source.source_notes]);

  const handleNotesChange = (val: string) => {
    setSourceNotes(val);
    setNotesSaveStatus('saving');
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      if (onUpdateSourceNotes) {
        onUpdateSourceNotes(val);
      }
      setNotesSaveStatus('saved');
    }, 800);
  };

  const scrollToHighlight = (content: string) => {
    if (!contentRef.current) return;
    const snippet = content.trim().slice(0, 30);
    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(snippet)) {
        const parent = node.parentElement;
        if (parent) {
          parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
          parent.classList.add('bg-amber-100', 'dark:bg-amber-950/60', 'transition-all');
          setTimeout(() => {
            parent.classList.remove('bg-amber-100', 'dark:bg-amber-950/60');
          }, 2000);
          return;
        }
      }
    }
  };

  // Floating highlight popup state
  const [selectedText, setSelectedText] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);
  const [selectionRange, setSelectionRange] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');
  const [highlightNote, setHighlightNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isSavingHighlight, setIsSavingHighlight] = useState(false);
  const [localPendingHighlights, setLocalPendingHighlights] = useState<PendingHighlight[]>([]);
  const selectionPopoverRef = useRef<HTMLDivElement>(null);

  // Load any pending offline highlights for this source & remove those already synced to server
  useEffect(() => {
    let active = true;
    getPendingHighlights().then((all) => {
      if (!active) return;
      const syncedContents = new Set((source.highlights || []).map((h) => h.content.trim()));
      setLocalPendingHighlights(
        all.filter((p) => p.source_id === source.id && !syncedContents.has(p.content.trim()))
      );
    });
    return () => {
      active = false;
    };
  }, [source.id, source.highlights]);

  // Inline Ghostreader ("Explain / Translate") state
  const [ghostreader, setGhostreader] = useState<{
    action: 'explain' | 'translate';
    text: string;
    result?: string;
    error?: string;
    loading: boolean;
    saved?: boolean;
  } | null>(null);

  // Text-To-Speech (Web Speech API)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // AI Modal
  const [isAiOpen, setIsAiOpen] = useState(false);

  // YouTube state
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  // Parse metadata
  let metadata: any = {};
  try {
    if (source.metadata) metadata = JSON.parse(source.metadata);
  } catch {}
  const transcript: TranscriptSegment[] = metadata.transcript || [];

  // Listen to text selection
  useEffect(() => {
    const handleSelection = (e: MouseEvent) => {
      if (selectionPopoverRef.current?.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!showNoteInput && !ghostreader) {
          setSelectionRange(null);
          setSelectedText('');
        }
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 2) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        let computedLoc: string | undefined;
        if (contentRef.current && contentRef.current.contains(range.startContainer)) {
          try {
            const preRange = document.createRange();
            preRange.selectNodeContents(contentRef.current);
            preRange.setEnd(range.startContainer, range.startOffset);
            const startOffset = preRange.toString().length;
            computedLoc = `offset:${startOffset}-${startOffset + text.length}`;
          } catch {}
        }
        setSelectedText(text);
        setSelectedLocation(computedLoc);
        setGhostreader(null);
        setSelectionRange({
          x: Math.min(window.innerWidth - 190, Math.max(190, rect.left + rect.width / 2)),
          top: rect.top,
          bottom: rect.bottom,
        });
      }
    };

    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, [showNoteInput, ghostreader]);

  const handleRunGhostreader = async (action: 'explain' | 'translate') => {
    const text = selectedText.trim();
    if (!text) return;
    setGhostreader({ action, text, loading: true });

    try {
      const articleText = contentRef.current?.innerText || '';
      const idx = articleText.indexOf(text.slice(0, 40));
      const contextSnippet =
        idx >= 0
          ? articleText.slice(Math.max(0, idx - 300), Math.min(articleText.length, idx + text.length + 300))
          : articleText.slice(0, 800);

      const res = await api.inlineAiAction({
        action,
        text,
        context: contextSnippet,
      });
      setGhostreader({ action, text, result: res.result, loading: false });
    } catch (err) {
      setGhostreader({
        action,
        text,
        error: err instanceof Error ? err.message : 'Ghostreader request failed',
        loading: false,
      });
    }
  };

  const handleSaveGhostreaderAsNote = async () => {
    if (!ghostreader?.result || isSavingHighlight) return;
    setIsSavingHighlight(true);
    const prefix = ghostreader.action === 'translate' ? '[Translation]' : '[AI Explanation]';
    const noteContent = `${prefix} ${ghostreader.result}`;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const item = await savePendingHighlight({
          source_id: source.id,
          content: ghostreader.text,
          note: noteContent,
          color: highlightColor,
        });
        setLocalPendingHighlights((prev) => [...prev, item]);
      } else {
        await onCreateHighlight({
          content: ghostreader.text,
          note: noteContent,
          color: highlightColor,
        });
      }
      setGhostreader((prev) => (prev ? { ...prev, saved: true } : null));
    } catch {
      const item = await savePendingHighlight({
        source_id: source.id,
        content: ghostreader.text,
        note: noteContent,
        color: highlightColor,
      });
      setLocalPendingHighlights((prev) => [...prev, item]);
      setGhostreader((prev) => (prev ? { ...prev, saved: true } : null));
    } finally {
      setIsSavingHighlight(false);
    }
  };

  const handleSaveHighlight = async () => {
    if (!selectedText.trim() || isSavingHighlight) return;
    setIsSavingHighlight(true);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const item = await savePendingHighlight({
          source_id: source.id,
          content: selectedText.trim(),
          note: highlightNote.trim() || undefined,
          color: highlightColor,
          location: selectedLocation,
        });
        setLocalPendingHighlights((prev) => [...prev, item]);
      } else {
        await onCreateHighlight({
          content: selectedText.trim(),
          note: highlightNote.trim() || undefined,
          color: highlightColor,
          location: selectedLocation,
        });
      }

      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectionRange(null);
      setSelectedText('');
      setSelectedLocation(undefined);
      setHighlightNote('');
      setShowNoteInput(false);
    } catch (err) {
      console.warn('Highlight creation failed, saving offline fallback:', err);
      const item = await savePendingHighlight({
        source_id: source.id,
        content: selectedText.trim(),
        note: highlightNote.trim() || undefined,
        color: highlightColor,
        location: selectedLocation,
      });
      setLocalPendingHighlights((prev) => [...prev, item]);
      window.getSelection()?.removeAllRanges();
      setSelectionRange(null);
      setSelectedText('');
      setSelectedLocation(undefined);
      setHighlightNote('');
      setShowNoteInput(false);
    } finally {
      setIsSavingHighlight(false);
    }
  };

  // Keyboard-First Triage in ReaderView (e = Archive, l = Later, h = Highlight selection, Esc = Close/Back)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"], [contenteditable=""]'))
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'escape' && isAiOpen) {
        e.preventDefault();
        setIsAiOpen(false);
        return;
      }

      // Do not intercept if a modal or CommandPalette is open
      if (document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0.z-50')) {
        return;
      }

      if (key === 'escape') {
        e.preventDefault();
        if (ghostreader || selectionRange) {
          setGhostreader(null);
          setSelectionRange(null);
          setSelectedText('');
          setShowNoteInput(false);
          window.getSelection()?.removeAllRanges();
        } else {
          onBack();
        }
        return;
      }

      if (key === 'e') {
        e.preventDefault();
        void onUpdateStatus('archive').then(() => onBack());
      } else if (key === 'l') {
        e.preventDefault();
        void onUpdateStatus('later').then(() => onBack());
      } else if (key === 'h') {
        if (selectedText.trim().length > 2) {
          e.preventDefault();
          void handleSaveHighlight();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAiOpen, ghostreader, selectionRange, selectedText, onBack, onUpdateStatus]);

  // Render inline <mark> highlights in the article DOM
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    // Unwrap any previously injected highlight marks
    container.querySelectorAll('mark[data-mnema-hl]').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });

    const allToRender = [
      ...(source.highlights || []).map((h) => ({ id: h.id, content: h.content, color: h.color })),
      ...localPendingHighlights.map((h) => ({ id: h.id, content: h.content, color: h.color })),
    ];

    const colorClassMap: Record<string, string> = {
      yellow: 'bg-yellow-200/70 dark:bg-yellow-500/30 text-inherit rounded px-0.5',
      blue: 'bg-sky-200/70 dark:bg-sky-500/30 text-inherit rounded px-0.5',
      green: 'bg-emerald-200/70 dark:bg-emerald-500/30 text-inherit rounded px-0.5',
      pink: 'bg-pink-200/70 dark:bg-pink-500/30 text-inherit rounded px-0.5',
    };

    for (const hl of allToRender) {
      const snippet = hl.content.trim();
      if (snippet.length < 3) continue;
      const needle = snippet.slice(0, 80);
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (!node.nodeValue || node.parentElement?.closest('mark[data-mnema-hl]')) continue;
        const idx = node.nodeValue.indexOf(needle);
        if (idx >= 0) {
          try {
            const range = document.createRange();
            const end = Math.min(node.nodeValue.length, idx + snippet.length);
            range.setStart(node, idx);
            range.setEnd(node, end);
            const mark = document.createElement('mark');
            mark.setAttribute('data-mnema-hl', hl.id);
            mark.className = colorClassMap[hl.color] || colorClassMap.yellow;
            range.surroundContents(mark);
          } catch {
            // Skip cross-element ranges safely
          }
          break;
        }
      }
    }
  }, [source.content_html, offlineFallbackHtml, source.highlights, localPendingHighlights]);

  // Text-to-speech handler
  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Extract text content
    const text = contentRef.current?.innerText || source.name;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const presets: { id: ReaderPreset; label: string }[] = [
    { id: 'paperback', label: 'Paperback' },
    { id: 'editorial', label: 'Editorial' },
    { id: 'modern', label: 'Modern' },
    { id: 'focus', label: 'Focus' },
  ];

  const handleApplyPreset = (preset: ReaderPreset) => {
    const config = READER_PRESETS[preset];
    onUpdateSetting('theme', config.theme);
    onUpdateSetting('fontFamily', config.fontFamily);
    onUpdateSetting('fontSize', config.fontSize);
    onUpdateSetting('contentWidth', config.contentWidth);
    onUpdateSetting('lineHeight', config.lineHeight);
    onUpdateSetting('preset', preset);
  };

  const themeClass =
    settings.theme === 'sepia'
      ? 'bg-sepia-50 text-sepia-900'
      : settings.theme === 'dark'
      ? 'bg-[#18181b] text-neutral-100'
      : 'bg-[#fcfbf9] text-neutral-900';

  return (
    <div className={`min-h-screen ${themeClass} transition-colors duration-150`}>
      {/* Sticky Top Reader Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-neutral-900/80 border-b border-neutral-200/60 dark:border-neutral-800/60 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Library</span>
          </button>

          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs text-neutral-400 hover:text-teal-700 dark:hover:text-teal-400"
              title="Open Original Page"
            >
              <span>Original</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Reader Customization Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Ask AI Copilot */}
          <button
            onClick={() => setIsAiOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 text-xs font-semibold hover:bg-teal-100/50 transition-colors shadow-2xs"
            title="Ask AI about this article"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden sm:inline">Ask AI</span>
          </button>

          {/* Reader Presets */}
          <div className="hidden md:flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl text-xs">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => handleApplyPreset(p.id)}
                className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                  settings.preset === p.id
                    ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* TTS Audio */}
          <button
            onClick={toggleSpeech}
            className={`p-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 ${
              isSpeaking
                ? 'bg-teal-800 text-white animate-pulse'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            title="Read aloud"
          >
            {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Font Family (Serif / Sans) */}
          <button
            onClick={() => onUpdateSetting('fontFamily', settings.fontFamily === 'serif' ? 'sans' : 'serif')}
            className="px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Toggle Serif / Sans font"
          >
            {settings.fontFamily === 'serif' ? 'Lora (Serif)' : 'Sans'}
          </button>

          {/* Font Size decrease / increase */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-xl p-0.5">
            <button
              onClick={() => onUpdateSetting('fontSize', Math.max(14, settings.fontSize - 1))}
              className="p-1 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              title="Smaller text"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {settings.fontSize}
            </span>
            <button
              onClick={() => onUpdateSetting('fontSize', Math.min(26, settings.fontSize + 1))}
              className="p-1 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              title="Larger text"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Status switchers */}
          <div className="flex items-center gap-1 border-l border-neutral-200 dark:border-neutral-700 pl-2">
            <button
              onClick={() => onUpdateStatus('inbox')}
              className={`p-1.5 rounded-lg text-xs ${
                source.reading_status === 'inbox'
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
              title="Move to Inbox"
            >
              <Inbox className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateStatus('later')}
              className={`p-1.5 rounded-lg text-xs ${
                source.reading_status === 'later'
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
              title="Move to Later"
            >
              <Clock className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateStatus('archive')}
              className={`p-1.5 rounded-lg text-xs ${
                source.reading_status === 'archive'
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
              title="Archive"
            >
              <Archive className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-xs text-neutral-400 hover:text-red-600"
              title="Delete Article"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Toggle Notebook Button */}
            <button
              onClick={() => setIsNotebookOpen(!isNotebookOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ml-1 ${
                isNotebookOpen
                  ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
              title="Toggle Notebook Side Panel"
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Notebook</span>
              {source.highlights && source.highlights.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-600 text-white font-bold">
                  {source.highlights.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Floating Selection Tooltip + Inline Ghostreader */}
      {selectionRange && (() => {
        const placeBelow = selectionRange.top < (ghostreader ? 320 : 120);
        return (
        <div
          ref={selectionPopoverRef}
          style={{
            position: 'fixed',
            left: `${selectionRange.x}px`,
            top: `${placeBelow ? Math.min(window.innerHeight - 80, selectionRange.bottom + 10) : Math.max(80, selectionRange.top - 10)}px`,
            transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
          className="z-40 bg-neutral-900 text-white rounded-2xl shadow-xl p-2 flex flex-col gap-2 max-w-[92vw] animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Color buttons */}
            <div className="flex items-center gap-1">
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
                    className={`w-5 h-5 rounded-full ${colorBg} transition-transform ${
                      highlightColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>

            <div className="w-px h-4 bg-neutral-700" />

            <button
              onClick={() => setShowNoteInput(!showNoteInput)}
              className={`p-1 rounded-lg text-xs flex items-center gap-1 ${
                showNoteInput ? 'bg-neutral-800 text-teal-300' : 'text-neutral-300 hover:text-white'
              }`}
              title="Add Note"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => handleSaveHighlight()}
              disabled={isSavingHighlight}
              className="px-2.5 py-1 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1"
              title="Highlight (h)"
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>Highlight</span>
            </button>

            <div className="w-px h-4 bg-neutral-700" />

            <button
              onClick={() => handleRunGhostreader('explain')}
              disabled={ghostreader?.loading}
              className={`px-2 py-1 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors ${
                ghostreader?.action === 'explain'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Ghostreader: Explain selection"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Explain</span>
            </button>

            <button
              onClick={() => handleRunGhostreader('translate')}
              disabled={ghostreader?.loading}
              className={`px-2 py-1 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors ${
                ghostreader?.action === 'translate'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Ghostreader: Translate (VI/EN)"
            >
              <Languages className="w-3.5 h-3.5 text-sky-400" />
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
                if (e.key === 'Enter') handleSaveHighlight();
              }}
              className="w-full px-2.5 py-1 text-xs bg-neutral-800 rounded-lg text-white border border-neutral-700 focus:outline-hidden"
            />
          )}

          {/* Ghostreader Inline Result Popover */}
          {ghostreader && (
            <div className="w-80 sm:w-96 max-w-full bg-neutral-800/95 border border-neutral-700 rounded-xl p-3 space-y-2 text-xs font-sans">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  {ghostreader.action === 'explain' ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ghostreader • Explain</span>
                    </>
                  ) : (
                    <>
                      <Languages className="w-3.5 h-3.5 text-sky-400" />
                      <span>Ghostreader • Translate (VI/EN)</span>
                    </>
                  )}
                </span>
                <button
                  onClick={() => setGhostreader(null)}
                  className="p-0.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700"
                  title="Dismiss (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {ghostreader.loading ? (
                <div className="flex items-center gap-2 py-2 text-neutral-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
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
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Saved as highlight note
                      </span>
                    ) : (
                      <button
                        onClick={handleSaveGhostreaderAsNote}
                        disabled={isSavingHighlight}
                        className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-600 text-white font-semibold flex items-center gap-1 transition-colors"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
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
      })()}

      {/* 2. Reader Body with Collapsible Right-Side Notebook Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          <main
            style={{
              maxWidth: `${settings.contentWidth}px`,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
            className={`mx-auto px-6 py-10 ${settings.fontFamily === 'serif' ? 'font-serif' : 'font-sans'}`}
          >
            {/* Article Header */}
            <div className="mb-8 pb-6 border-b border-neutral-200/60 dark:border-neutral-800/60">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3 leading-snug">
                {source.name}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 font-sans">
                {source.author && <span className="font-semibold text-neutral-700 dark:text-neutral-300">{source.author}</span>}
                {source.reading_time > 0 && <span>{source.reading_time} min read</span>}
                {source.word_count > 0 && <span>({source.word_count} words)</span>}
              </div>
            </div>

            {/* Lead Image if available */}
            {source.image_url && (
              <div className="mb-8 rounded-2xl overflow-hidden shadow-sm">
                <img src={source.image_url} alt="" className="w-full max-h-[400px] object-cover" />
              </div>
            )}

            {/* YouTube Video Embed & Transcript Player */}
            {source.type === 'youtube' && metadata.youtube_id && (
              <div className="space-y-6 mb-8 font-sans">
                <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-md">
                  <iframe
                    ref={youtubeIframeRef}
                    src={`https://www.youtube.com/embed/${metadata.youtube_id}?enablejsapi=1`}
                    title={source.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                </div>

                {/* Transcript section */}
                {transcript.length > 0 && (
                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-800/50">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 mb-3">
                      Synchronized Transcript (Click to seek)
                    </h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2 text-sm">
                      {transcript.map((seg, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setCurrentTimeSec(seg.startSec);
                            youtubeIframeRef.current?.contentWindow?.postMessage(
                              JSON.stringify({ event: 'command', func: 'seekTo', args: [seg.startSec, true] }),
                              '*'
                            );
                          }}
                          className={`p-2 rounded-xl hover:bg-teal-50 dark:hover:bg-neutral-700/60 transition-colors cursor-pointer flex items-start gap-3 ${
                            Math.abs(currentTimeSec - seg.startSec) < 2 ? 'bg-teal-50/80 dark:bg-teal-950/30' : ''
                          }`}
                        >
                          <span className="text-xs font-mono text-neutral-400 mt-0.5 shrink-0">
                            {Math.floor(seg.startSec / 60)}:
                            {String(Math.floor(seg.startSec % 60)).padStart(2, '0')}
                          </span>
                          <p className="flex-1 leading-relaxed text-neutral-800 dark:text-neutral-200">
                            {seg.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rendered HTML Content */}
            {Boolean(offlineFallbackHtml && !source.content_html) && (
              <div className="mb-6 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 font-sans">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>Offline Mode: Displaying saved copy from local IndexedDB cache.</span>
              </div>
            )}
            {source.content_html || offlineFallbackHtml ? (
              <div
                ref={contentRef}
                className="reader-content leading-relaxed"
                dangerouslySetInnerHTML={{ __html: source.content_html || offlineFallbackHtml || '' }}
              />
            ) : (
              <div className="text-neutral-500 italic py-10 text-center">
                No text content available for this source.
              </div>
            )}

            {/* Saved Highlights List at bottom */}
            {((source.highlights && source.highlights.length > 0) || localPendingHighlights.length > 0) && (
              <div className="mt-16 pt-8 border-t border-neutral-200 dark:border-neutral-800 font-sans">
                <h3 className="text-sm font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 mb-4 flex items-center gap-2">
                  <Highlighter className="w-4 h-4" />
                  <span>Highlights from this article ({(source.highlights?.length || 0) + localPendingHighlights.length})</span>
                </h3>

                <div className="space-y-3">
                  {source.highlights?.map((hl) => (
                    <div
                      key={hl.id}
                      className="p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-800/40 space-y-2"
                    >
                      <p className="font-serif italic text-sm text-neutral-800 dark:text-neutral-200">
                        “{hl.content}”
                      </p>
                      {hl.note && (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs">
                          <span className="font-semibold">Note: </span>
                          {hl.note}
                        </div>
                      )}
                    </div>
                  ))}
                  {localPendingHighlights.map((hl) => (
                    <div
                      key={hl.id}
                      className="p-4 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                          Offline (pending sync)
                        </span>
                      </div>
                      <p className="font-serif italic text-sm text-neutral-800 dark:text-neutral-200">
                        “{hl.content}”
                      </p>
                      {hl.note && (
                        <div className="p-2.5 rounded-xl bg-amber-100/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs">
                          <span className="font-semibold">Note: </span>
                          {hl.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Collapsible Right-Side Notebook Panel */}
        {isNotebookOpen && (
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
                  Highlights ({(source.highlights?.length || 0) + localPendingHighlights.length})
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
                onClick={() => setIsNotebookOpen(false)}
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
                  {(!source.highlights || source.highlights.length === 0) && localPendingHighlights.length === 0 ? (
                    <div className="py-16 text-center text-xs text-neutral-400 space-y-1">
                      <Highlighter className="w-6 h-6 mx-auto text-neutral-300 dark:text-neutral-700" />
                      <p>No highlights in this article yet.</p>
                      <p className="text-[11px] text-neutral-400">Select any text in the article to create one.</p>
                    </div>
                  ) : (
                    <>
                    {source.highlights?.map((hl) => (
                      <div
                        key={hl.id}
                        onClick={() => scrollToHighlight(hl.content)}
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
                    {localPendingHighlights.map((hl) => (
                      <div
                        key={hl.id}
                        onClick={() => scrollToHighlight(hl.content)}
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
                    onChange={(e) => handleNotesChange(e.target.value)}
                    placeholder="Write article summary, personal reflections, or key points here (autosaves automatically)..."
                    className="flex-1 w-full p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs sm:text-sm text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 resize-none leading-relaxed"
                  />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <AiCopilotModal
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        articleTitle={source.name}
        articleContentText={contentRef.current?.innerText || source.name}
      />

      <TocPanel contentHtml={source.content_html || offlineFallbackHtml || ''} contentRef={contentRef} />
    </div>
  );
};

