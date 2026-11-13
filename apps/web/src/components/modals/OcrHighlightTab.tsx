import React, { useState } from 'react';
import { Camera, Sparkles, Loader2 } from 'lucide-react';
import { Source, HighlightColor } from '../../types';
import { api } from '../../services/api';

interface OcrHighlightTabProps {
  sources: Source[];
  onSubmitHighlight: (data: {
    source_id: string;
    content: string;
    note?: string;
    color: HighlightColor;
    location?: string;
    tags?: string[];
  }) => Promise<void>;
  onClose: () => void;
  onError: (err: string | null) => void;
}

export const OcrHighlightTab: React.FC<OcrHighlightTabProps> = ({
  sources,
  onSubmitHighlight,
  onClose,
  onError,
}) => {
  const [hlContent, setHlContent] = useState('');
  const [hlNote, setHlNote] = useState('');
  const [hlSourceId, setHlSourceId] = useState('');
  const [hlLocation, setHlLocation] = useState('');
  const [hlColor, setHlColor] = useState<HighlightColor>('yellow');
  const [hlTags, setHlTags] = useState('');
  const [isTidying, setIsTidying] = useState(false);

  // OCR Book Page Scan State
  const [showOcrPanel, setShowOcrPanel] = useState(false);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrMode, setOcrMode] = useState<'highlights_only' | 'full_page'>('highlights_only');
  const [ocrPassages, setOcrPassages] = useState<string[]>([]);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTidyUp = async () => {
    if (!hlContent.trim() || isTidying) return;
    setIsTidying(true);
    onError(null);
    try {
      const tidied = await api.tidyUpText(hlContent);
      setHlContent(tidied);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tidy up failed');
    } finally {
      setIsTidying(false);
    }
  };

  const handleOcrImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onError(null);
    setOcrPassages([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === 'string') {
        setOcrPreviewUrl(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunOcr = async () => {
    if (!ocrPreviewUrl) return;
    setIsRunningOcr(true);
    onError(null);
    setOcrPassages([]);
    try {
      const res = await api.ocrBookPage({
        imageBase64: ocrPreviewUrl,
        mode: ocrMode,
      });
      setOcrPassages(res.passages);
      if (res.passages.length === 1 || ocrMode === 'full_page') {
        setHlContent(res.text);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setIsRunningOcr(false);
    }
  };

  const handleSaveHighlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hlContent.trim()) return;

    let targetSourceId = hlSourceId;
    if (!targetSourceId) {
      const personal = sources.find((s) => s.type === 'custom' || s.name === 'Personal Notes');
      targetSourceId = personal ? personal.id : sources[0]?.id || '';
    }

    if (!targetSourceId) {
      onError('Please create or select a source first');
      return;
    }

    setLoading(true);
    onError(null);
    try {
      const tagsArray = hlTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSubmitHighlight({
        source_id: targetSourceId,
        content: hlContent.trim(),
        note: hlNote.trim() || undefined,
        color: hlColor,
        location: hlLocation.trim() || undefined,
        tags: tagsArray,
      });
      setHlContent('');
      setHlNote('');
      setOcrPreviewUrl(null);
      setOcrPassages([]);
      setShowOcrPanel(false);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save highlight');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSaveHighlight} className="space-y-4">
      {/* OCR Toggle Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/40">
        <div className="flex items-center gap-2 text-xs text-teal-900 dark:text-teal-200">
          <Camera className="w-4 h-4 text-teal-700" />
          <span className="font-semibold">Reading a physical book?</span>
        </div>
        <button
          type="button"
          onClick={() => setShowOcrPanel((prev) => !prev)}
          className="px-2.5 py-1 rounded-lg bg-teal-800 hover:bg-teal-700 text-white text-[11px] font-semibold"
        >
          {showOcrPanel ? 'Hide OCR' : 'Scan Page (OCR)'}
        </button>
      </div>

      {showOcrPanel && (
        <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-xs font-semibold cursor-pointer hover:border-teal-700">
              <Camera className="w-3.5 h-3.5 text-teal-700" />
              <span>Upload / Take Photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOcrImageSelect}
                className="hidden"
              />
            </label>

            <select
              value={ocrMode}
              onChange={(e) => setOcrMode(e.target.value as 'highlights_only' | 'full_page')}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700"
            >
              <option value="highlights_only">Underlined / Highlighted Quotes</option>
              <option value="full_page">Full Book Page Text</option>
            </select>
          </div>

          {ocrPreviewUrl && (
            <div className="space-y-2">
              <img
                src={ocrPreviewUrl}
                alt="Book page preview"
                className="max-h-40 w-full object-contain rounded-xl border border-neutral-200 dark:border-neutral-700 bg-black/5"
              />
              <button
                type="button"
                onClick={handleRunOcr}
                disabled={isRunningOcr}
                className="w-full py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isRunningOcr ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning Book Page with Gemini Vision...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Extract Text from Photo</span>
                  </>
                )}
              </button>
            </div>
          )}

          {ocrPassages.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-neutral-500">
                Extracted passages (click one to insert):
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {ocrPassages.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setHlContent(p)}
                    className="w-full text-left p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 hover:border-teal-700 text-[11px] line-clamp-2"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Quote / Highlight Text *
          </label>
          <button
            type="button"
            onClick={handleTidyUp}
            disabled={isTidying || !hlContent.trim()}
            className="flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-400 font-semibold hover:underline disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" />
            <span>{isTidying ? 'Cleaning...' : 'Tidy up text (AI)'}</span>
          </button>
        </div>
        <textarea
          required
          rows={4}
          placeholder="Paste, write, or OCR-scan the quote here..."
          value={hlContent}
          onChange={(e) => setHlContent(e.target.value)}
          className="w-full font-serif text-sm px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-700/50"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
          Personal Note (Optional)
        </label>
        <input
          type="text"
          placeholder="Why this quote matters to you..."
          value={hlNote}
          onChange={(e) => setHlNote(e.target.value)}
          className="w-full text-xs px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
            Source / Book
          </label>
          <select
            value={hlSourceId}
            onChange={(e) => setHlSourceId(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          >
            <option value="">Select source...</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
            Page / Location
          </label>
          <input
            type="text"
            placeholder="e.g. Page 42, Loc 150"
            value={hlLocation}
            onChange={(e) => setHlLocation(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
            Tags (Comma separated)
          </label>
          <input
            type="text"
            placeholder="e.g. habits, psychology"
            value={hlTags}
            onChange={(e) => setHlTags(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
            Color
          </label>
          <div className="flex items-center gap-2 pt-1">
            {(['yellow', 'blue', 'green', 'pink'] as HighlightColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setHlColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${
                  c === 'yellow'
                    ? 'bg-yellow-400'
                    : c === 'blue'
                    ? 'bg-sky-400'
                    : c === 'green'
                    ? 'bg-emerald-400'
                    : 'bg-pink-400'
                } ${hlColor === c ? 'ring-2 ring-teal-800 ring-offset-2 scale-110' : 'opacity-70'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={loading || !hlContent.trim()}
          className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-xs"
        >
          {loading ? 'Saving...' : 'Save Highlight'}
        </button>
      </div>
    </form>
  );
};
