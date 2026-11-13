import React from 'react';
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
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-neutral-900/80 border-b border-neutral-200/60 dark:border-neutral-800/60 px-4 py-2.5 flex items-center justify-between gap-3">
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
          onClick={onOpenAi}
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
            <span className="hidden sm:inline">Notebook</span>
            {totalHighlightsCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-600 text-white font-bold">
                {totalHighlightsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
