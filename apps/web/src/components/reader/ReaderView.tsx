import React, { useState, useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { WifiOff } from 'lucide-react';
import { AiCopilotModal } from '../AiCopilotModal';
import { TocPanel } from '../TocPanel';
import {
  Source,
  HighlightColor,
  ReaderSettings,
  ReadingStatus,
  TranscriptSegment,
} from '../../types';

import { ReaderYouTube } from './ReaderYouTube';
import { ReaderEpub } from './ReaderEpub';
import { ReaderSidebar } from './ReaderSidebar';
import { SelectionToolbar } from './SelectionToolbar';
import { ReaderHeader } from './ReaderHeader';
import { ReaderArticleFooter } from './ReaderArticleFooter';
import { useReaderShortcuts } from './useReaderShortcuts';
import { useHighlightMarks } from './useHighlightMarks';
import { useOfflineArticle } from './useOfflineArticle';
import { useTextSelection } from './useTextSelection';

interface ReaderViewProps {
  source: Source;
  onBack: () => void;
  onUpdateStatus: (status: ReadingStatus) => Promise<void>;
  onDelete: () => Promise<void>;
  onCreateHighlight: (data: {
    content: string;
    note?: string;
    color: HighlightColor;
    location?: string;
  }) => Promise<void>;
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

  // Offline caching & fallback state
  const { offlineFallbackHtml, localPendingHighlights, setLocalPendingHighlights } =
    useOfflineArticle(source);

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

  // Text selection & Ghostreader
  const {
    selectedText,
    setSelectedText,
    selectedLocation,
    selectionRange,
    setSelectionRange,
    highlightColor,
    setHighlightColor,
    highlightNote,
    setHighlightNote,
    showNoteInput,
    setShowNoteInput,
    isSavingHighlight,
    selectionPopoverRef,
    ghostreader,
    setGhostreader,
    handleRunGhostreader,
    handleSaveGhostreaderAsNote,
    handleSaveHighlight,
  } = useTextSelection({
    source,
    contentRef,
    onCreateHighlight,
    setLocalPendingHighlights,
  });

  // Memoize sanitized HTML
  const sanitizedHtml = useMemo(() => {
    const raw = source.content_html || offlineFallbackHtml || '';
    if (!raw) return '';
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
    });
  }, [source.content_html, offlineFallbackHtml]);

  // Text-To-Speech (Web Speech API)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // AI Modal
  const [isAiOpen, setIsAiOpen] = useState(false);

  // Parse metadata
  let metadata: any = {};
  try {
    if (source.metadata) metadata = JSON.parse(source.metadata);
  } catch {}
  const transcript: TranscriptSegment[] = metadata.transcript || [];

  // Keyboard triage shortcuts
  useReaderShortcuts({
    isAiOpen,
    setIsAiOpen,
    ghostreader,
    setGhostreader,
    selectionRange,
    setSelectionRange,
    selectedText,
    setSelectedText,
    setShowNoteInput,
    onBack,
    onUpdateStatus,
    onSaveHighlight: handleSaveHighlight,
  });

  // Render inline <mark> highlights
  useHighlightMarks({
    contentRef,
    source,
    offlineFallbackHtml,
    localPendingHighlights,
  });

  // TTS handler
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

  const themeClass =
    settings.theme === 'sepia'
      ? 'bg-sepia-50 text-sepia-900'
      : settings.theme === 'dark'
      ? 'bg-[#18181b] text-neutral-100'
      : 'bg-[#fcfbf9] text-neutral-900';

  return (
    <div className={`min-h-screen ${themeClass} transition-colors duration-150`}>
      {/* Sticky Top Reader Bar */}
      <ReaderHeader
        source={source}
        settings={settings}
        onBack={onBack}
        onUpdateSetting={onUpdateSetting}
        onUpdateStatus={onUpdateStatus}
        onDelete={onDelete}
        onOpenAi={() => setIsAiOpen(true)}
        isSpeaking={isSpeaking}
        onToggleSpeech={toggleSpeech}
        isNotebookOpen={isNotebookOpen}
        onToggleNotebook={() => setIsNotebookOpen(!isNotebookOpen)}
        totalHighlightsCount={(source.highlights?.length || 0) + localPendingHighlights.length}
      />

      {/* Floating Selection Tooltip + Inline Ghostreader */}
      <SelectionToolbar
        selectionRange={selectionRange}
        selectionPopoverRef={selectionPopoverRef}
        highlightColor={highlightColor}
        setHighlightColor={setHighlightColor}
        showNoteInput={showNoteInput}
        setShowNoteInput={setShowNoteInput}
        highlightNote={highlightNote}
        setHighlightNote={setHighlightNote}
        onSaveHighlight={handleSaveHighlight}
        isSavingHighlight={isSavingHighlight}
        ghostreader={ghostreader}
        onRunGhostreader={handleRunGhostreader}
        onDismissGhostreader={() => {
          setGhostreader(null);
          setSelectionRange(null);
          setSelectedText('');
          setShowNoteInput(false);
          window.getSelection()?.removeAllRanges();
        }}
        onSaveGhostreaderAsNote={handleSaveGhostreaderAsNote}
      />

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
              <ReaderYouTube
                youtubeId={metadata.youtube_id}
                title={source.name}
                transcript={transcript}
              />
            )}

            {/* Rendered HTML Content */}
            {Boolean(offlineFallbackHtml && !source.content_html) && (
              <div className="mb-6 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 font-sans">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>Offline Mode: Displaying saved copy from local IndexedDB cache.</span>
              </div>
            )}
            {source.type === 'epub' ? (
              <ReaderEpub
                sourceId={source.id}
                initialProgress={source.progress || 0}
                settings={settings}
                highlights={source.highlights || []}
                onCreateHighlight={onCreateHighlight}
              />
            ) : source.content_html || offlineFallbackHtml ? (
              <div
                ref={contentRef}
                className="reader-content leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: sanitizedHtml,
                }}
              />
            ) : (
              <div className="text-neutral-500 italic py-10 text-center">
                No text content available for this source.
              </div>
            )}

            {/* Saved Highlights List at bottom */}
            <ReaderArticleFooter
              highlights={source.highlights}
              pendingHighlights={localPendingHighlights}
            />
          </main>
        </div>

        {/* Collapsible Right-Side Notebook Panel */}
        <ReaderSidebar
          isOpen={isNotebookOpen}
          onClose={() => setIsNotebookOpen(false)}
          notebookTab={notebookTab}
          setNotebookTab={setNotebookTab}
          highlightsCount={(source.highlights?.length || 0) + localPendingHighlights.length}
          highlights={source.highlights || []}
          pendingHighlights={localPendingHighlights}
          onScrollToHighlight={scrollToHighlight}
          sourceNotes={sourceNotes}
          notesSaveStatus={notesSaveStatus}
          onNotesChange={handleNotesChange}
        />
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
