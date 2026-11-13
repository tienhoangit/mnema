import React, { useState } from 'react';
import {
  ArrowLeft,
  Minus,
  Plus,
  Clock,
  Archive,
  Inbox,
  Trash2,
  Volume2,
  VolumeX,
  ExternalLink,
  Sparkles,
  BookMarked,
  X,
} from 'lucide-react';
import { getSafeHttpUrl } from '../../utils/url';
import { Source, ReaderSettings, ReadingStatus, ReaderPreset } from '../../types';
import { READER_PRESETS } from '../../hooks/useReaderSettings';

interface ReaderHeaderProps {
  source: Source;
  settings: ReaderSettings;
  onBack: () => void;
  onUpdateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  onUpdateStatus: (status: ReadingStatus) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpenAi: () => void;
  isSpeaking: boolean;
  onToggleSpeech: () => void;
  isNotebookOpen: boolean;
  onToggleNotebook: () => void;
  totalHighlightsCount: number;
}

export const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  source,
  settings,
  onBack,
  onUpdateSetting,
  onUpdateStatus,
  onDelete,
  onOpenAi,
  isSpeaking,
  onToggleSpeech,
  isNotebookOpen,
  onToggleNotebook,
  totalHighlightsCount,
}) => {
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

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

  const safeUrl = getSafeHttpUrl(source.url);

  return (
    <>
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-neutral-900/80 border-b border-neutral-200/60 dark:border-neutral-800/60 px-3 sm:px-4 py-2 sm:py-2.5">
        {/* Mobile Header: Distraction-Free (< 768px / md:hidden) */}
        <div className="flex md:hidden items-center justify-between gap-2 w-full">
          {/* Back button with >= 44x44px touch target */}
          <button
            onClick={onBack}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
            title="Back to Library"
            aria-label="Back to Library"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Truncated Article Title */}
          <div className="flex-1 min-w-0 mx-1">
            <h1 className="text-xs sm:text-sm font-semibold truncate text-neutral-800 dark:text-neutral-200">
              {source.name}
            </h1>
            {source.reading_time > 0 && (
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block truncate">
                {source.reading_time} min read {source.author ? `• ${source.author}` : ''}
              </span>
            )}
          </div>

          {/* Right Mobile Actions: TTS, Appearance (Aa), Notebook */}
          <div className="flex items-center gap-1 shrink-0">
            {/* TTS Audio toggle */}
            <button
              onClick={onToggleSpeech}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl transition-colors ${
                isSpeaking
                  ? 'bg-teal-800 text-white animate-pulse'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title="Read aloud"
              aria-label="Read aloud"
            >
              {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Appearance settings button ('Aa') */}
            <button
              onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                isAppearanceOpen
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent shadow-xs'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300'
              }`}
              title="Reading Appearance & Triage"
              aria-label="Reading Appearance & Triage"
            >
              <span className="font-serif text-sm tracking-tight">Aa</span>
            </button>

            {/* Notebook button */}
            <button
              onClick={onToggleNotebook}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center relative p-2 rounded-xl border text-xs transition-all ${
                isNotebookOpen
                  ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300'
              }`}
              title="Toggle Notebook"
              aria-label="Toggle Notebook"
            >
              <BookMarked className="w-4 h-4" />
              {totalHighlightsCount > 0 && (
                <span className="absolute -top-1 -right-1 text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-teal-600 text-white font-bold shadow-2xs">
                  {totalHighlightsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Desktop Header: Full Controls (>= 768px / hidden md:flex) */}
        <div className="hidden md:flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Library</span>
            </button>

            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-teal-700 dark:hover:text-teal-400"
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
              onClick={onOpenAi}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 text-xs font-semibold hover:bg-teal-100/50 transition-colors shadow-2xs"
              title="Ask AI about this article"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Ask AI</span>
            </button>

            {/* Reader Presets */}
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl text-xs">
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
              onClick={onToggleSpeech}
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
                onClick={onToggleNotebook}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ml-1 ${
                  isNotebookOpen
                    ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
                title="Toggle Notebook Side Panel"
              >
                <BookMarked className="w-3.5 h-3.5" />
                <span>Notebook</span>
                {totalHighlightsCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-600 text-white font-bold">
                    {totalHighlightsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Slide-Up Appearance & Actions Bottom Sheet (< 768px / md:hidden) */}
      {isAppearanceOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsAppearanceOpen(false)}
            aria-hidden="true"
          />

          <div
            className="fixed inset-x-0 bottom-0 z-50 md:hidden bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 rounded-t-3xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 animate-in slide-in-from-bottom duration-200 select-none max-h-[85vh] overflow-y-auto"
          >
            {/* Sheet Handle & Header */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-neutral-900 dark:text-white">
                  Reading Appearance & Triage
                </span>
                <span className="text-[11px] text-neutral-400">
                  Customize font, size, and triage reading status
                </span>
              </div>
              <button
                onClick={() => setIsAppearanceOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Typography Section: Serif / Sans Toggle */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Typeface
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateSetting('fontFamily', 'serif')}
                  className={`min-h-[44px] py-2 px-3 rounded-xl border text-sm font-serif font-medium flex items-center justify-center gap-1.5 transition-all ${
                    settings.fontFamily === 'serif'
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 text-teal-800 dark:text-teal-300 font-bold shadow-2xs'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  Lora (Serif)
                </button>
                <button
                  onClick={() => onUpdateSetting('fontFamily', 'sans')}
                  className={`min-h-[44px] py-2 px-3 rounded-xl border text-sm font-sans font-medium flex items-center justify-center gap-1.5 transition-all ${
                    settings.fontFamily === 'sans'
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 text-teal-800 dark:text-teal-300 font-bold shadow-2xs'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  System (Sans)
                </button>
              </div>
            </div>

            {/* Font Size Stepper */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Font Size
              </span>
              <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800 p-1.5 rounded-2xl">
                <button
                  onClick={() => onUpdateSetting('fontSize', Math.max(14, settings.fontSize - 1))}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 shadow-2xs active:scale-95 transition-all"
                  title="Smaller text"
                  aria-label="Smaller text"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <div className="text-center">
                  <span className="text-base font-semibold font-mono text-neutral-800 dark:text-neutral-200 block">
                    {settings.fontSize}px
                  </span>
                  <span className="text-[10px] text-neutral-400">Default: 18px</span>
                </div>
                <button
                  onClick={() => onUpdateSetting('fontSize', Math.min(26, settings.fontSize + 1))}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 shadow-2xs active:scale-95 transition-all"
                  title="Larger text"
                  aria-label="Larger text"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Reader Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Reading Presets
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyPreset(p.id)}
                    className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-medium flex items-center justify-center transition-all ${
                      settings.preset === p.id
                        ? 'bg-teal-800 text-white font-bold shadow-xs'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/70 dark:hover:bg-neutral-700/70'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Triage with Safe Separation for Trash */}
            <div className="space-y-1.5 pt-1 border-t border-neutral-200/60 dark:border-neutral-800">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Reading Status Triage
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onUpdateStatus('inbox')}
                    className={`min-h-[44px] px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      source.reading_status === 'inbox'
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 text-teal-800 dark:text-teal-300 font-bold shadow-2xs'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    <Inbox className="w-4 h-4" />
                    <span className="text-[10px]">Inbox</span>
                  </button>
                  <button
                    onClick={() => onUpdateStatus('later')}
                    className={`min-h-[44px] px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      source.reading_status === 'later'
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 text-teal-800 dark:text-teal-300 font-bold shadow-2xs'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-[10px]">Later</span>
                  </button>
                  <button
                    onClick={() => onUpdateStatus('archive')}
                    className={`min-h-[44px] px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      source.reading_status === 'archive'
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 text-teal-800 dark:text-teal-300 font-bold shadow-2xs'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    <Archive className="w-4 h-4" />
                    <span className="text-[10px]">Archive</span>
                  </button>
                </div>

                {/* Safe spacing divider before destructive Trash action */}
                <div className="w-px h-10 bg-neutral-200 dark:border-neutral-800 mx-1" />

                <button
                  onClick={onDelete}
                  className="min-w-[52px] min-h-[44px] px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex flex-col items-center justify-center gap-1 transition-colors"
                  title="Delete Article"
                  aria-label="Delete Article"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-[10px]">Trash</span>
                </button>
              </div>
            </div>

            {/* Quick Actions: Ask AI & Original Link */}
            <div className="pt-2 space-y-2 border-t border-neutral-200/60 dark:border-neutral-800">
              <button
                onClick={() => {
                  setIsAppearanceOpen(false);
                  onOpenAi();
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-teal-100/50 transition-colors shadow-2xs"
              >
                <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Ask AI Copilot about this article</span>
              </button>

              {safeUrl && (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 text-xs text-neutral-400 hover:text-teal-700 dark:hover:text-teal-400"
                >
                  <span>Open Original Web Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
