import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  Sparkles,
  BookOpen,
  Smartphone,
  Square,
  Monitor,
  Download,
  Image as ImageIcon,
  Loader2,
  Globe,
  Link2,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Highlight, PublicShare } from '../types';
import { api } from '../services/api';

interface ShareQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlight: Highlight | null;
}

type AspectRatio = 'square' | 'story' | 'landscape';

interface ThemeDef {
  name: string;
  bg: string;
  gradStart: string;
  gradMid: string;
  gradEnd: string;
  text: string;
  textColor: string;
  sub: string;
  subColor: string;
  border: string;
  borderColor: string;
  accent: string;
}

export const ShareQuoteModal: React.FC<ShareQuoteModalProps> = ({
  isOpen,
  onClose,
  highlight,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('square');
  const [publicShare, setPublicShare] = useState<PublicShare | null>(null);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !highlight) {
      setPublicShare(null);
      setShareError(null);
      return;
    }
    setIsLoadingShare(true);
    setShareError(null);
    api
      .getShareForTarget('highlight', highlight.id)
      .then((res) => setPublicShare(res))
      .catch(() => setPublicShare(null))
      .finally(() => setIsLoadingShare(false));
  }, [isOpen, highlight]);

  if (!isOpen || !highlight) return null;

  const publicUrl = publicShare ? `${window.location.origin}/share/${publicShare.slug}` : '';

  const handleCreatePublicLink = async () => {
    setIsLoadingShare(true);
    setShareError(null);
    try {
      const share = await api.createShareLink('highlight', highlight.id);
      setPublicShare(share);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to create public link');
    } finally {
      setIsLoadingShare(false);
    }
  };

  const handleRevokePublicLink = async () => {
    if (!publicShare) return;
    setIsLoadingShare(true);
    try {
      await api.revokeShareLink(publicShare.slug);
      setPublicShare(null);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to revoke link');
    } finally {
      setIsLoadingShare(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const themes: ThemeDef[] = [
    {
      name: 'Classic Editorial',
      bg: 'bg-gradient-to-br from-[#115e59] via-[#0f766e] to-[#134e4a]',
      gradStart: '#115e59',
      gradMid: '#0f766e',
      gradEnd: '#134e4a',
      text: 'text-teal-50',
      textColor: '#f0fdfa',
      sub: 'text-teal-200/80',
      subColor: '#99f6e4',
      border: 'border-teal-700/50',
      borderColor: 'rgba(20, 184, 166, 0.3)',
      accent: '#14b8a6',
    },
    {
      name: 'Midnight Ink',
      bg: 'bg-gradient-to-br from-neutral-900 via-neutral-950 to-black',
      gradStart: '#171717',
      gradMid: '#0a0a0a',
      gradEnd: '#000000',
      text: 'text-neutral-100',
      textColor: '#f5f5f5',
      sub: 'text-neutral-400',
      subColor: '#a3a3a3',
      border: 'border-neutral-800',
      borderColor: '#262626',
      accent: '#f59e0b',
    },
    {
      name: 'Sepia Parchment',
      bg: 'bg-gradient-to-br from-[#fbf0d9] via-[#f4e3c1] to-[#edd5a8]',
      gradStart: '#fbf0d9',
      gradMid: '#f4e3c1',
      gradEnd: '#edd5a8',
      text: 'text-[#433422]',
      textColor: '#433422',
      sub: 'text-[#5f4b32]',
      subColor: '#5f4b32',
      border: 'border-[#e5c78f]',
      borderColor: '#e5c78f',
      accent: '#b45309',
    },
    {
      name: 'Electric Bold',
      bg: 'bg-gradient-to-br from-indigo-900 via-purple-900 to-neutral-950',
      gradStart: '#312e81',
      gradMid: '#581c87',
      gradEnd: '#0a0a0a',
      text: 'text-purple-50',
      textColor: '#faf5ff',
      sub: 'text-purple-200/80',
      subColor: '#e9d5ff',
      border: 'border-purple-700/50',
      borderColor: 'rgba(168, 85, 247, 0.4)',
      accent: '#ec4899',
    },
  ];

  const currentTheme = themes[themeIndex];

  // Helper to wrap text nicely on HTML5 canvas
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
  };

  // Generate high-resolution HTML5 Canvas
  const generateCanvas = (): HTMLCanvasElement => {
    let width = 1080;
    let height = 1080;

    if (aspectRatio === 'story') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === 'landscape') {
      width = 1200;
      height = 675;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // 1. Draw Background Gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, currentTheme.gradStart);
    gradient.addColorStop(0.5, currentTheme.gradMid);
    gradient.addColorStop(1, currentTheme.gradEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Decorative subtle inner border
    ctx.strokeStyle = currentTheme.borderColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, width - 80, height - 80);

    // 3. Large Top Quotation Mark
    ctx.fillStyle = currentTheme.accent;
    ctx.globalAlpha = 0.35;
    ctx.font = 'bold 140px Georgia, serif';
    ctx.fillText('“', 90, 180);
    ctx.globalAlpha = 1.0;

    // 4. Quote Body Text
    const content = highlight.content.trim();
    // Dynamic font sizing based on length & aspect ratio
    let fontSize = 42;
    if (content.length > 300) fontSize = 32;
    else if (content.length > 150) fontSize = 38;
    else if (content.length < 60) fontSize = 52;

    if (aspectRatio === 'landscape') fontSize = Math.min(fontSize, 36);

    ctx.fillStyle = currentTheme.textColor;
    ctx.font = `italic ${fontSize}px Georgia, serif`;
    const quoteMaxWidth = width - 200;
    const lineHeight = fontSize * 1.5;

    let quoteStartY = 240;
    if (aspectRatio === 'story') quoteStartY = 500;
    else if (aspectRatio === 'landscape') quoteStartY = 190;

    const afterQuoteY = wrapText(ctx, `“${content}”`, 100, quoteStartY, quoteMaxWidth, lineHeight);

    // 5. Personal Note if available
    let noteEndY = afterQuoteY;
    if (highlight.note && highlight.note.trim().length > 0 && aspectRatio !== 'landscape') {
      const noteY = afterQuoteY + 30;
      ctx.fillStyle = currentTheme.accent;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('PERSONAL NOTE:', 100, noteY);

      ctx.fillStyle = currentTheme.subColor;
      ctx.font = '24px system-ui, sans-serif';
      noteEndY = wrapText(ctx, highlight.note, 100, noteY + 36, quoteMaxWidth, 36);
    }

    // 6. Bottom Attribution & Mnema Watermark
    const footerY = height - 120;

    // Thin separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, footerY - 30);
    ctx.lineTo(width - 100, footerY - 30);
    ctx.stroke();

    // Source Title
    ctx.fillStyle = currentTheme.textColor;
    ctx.font = 'bold 26px system-ui, sans-serif';
    const sourceTitle = highlight.source_name || 'Untitled Source';
    ctx.fillText(sourceTitle, 100, footerY);

    // Author
    if (highlight.source_author) {
      ctx.fillStyle = currentTheme.subColor;
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(`by ${highlight.source_author}`, 100, footerY + 30);
    }

    // Logo / Watermark on right
    ctx.fillStyle = currentTheme.textColor;
    ctx.globalAlpha = 0.6;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('MNEMA', width - 100, footerY + 10);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1.0;

    return canvas;
  };

  const handleDownloadPNG = async () => {
    setIsExporting(true);
    try {
      const canvas = generateCanvas();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mnema-quote-${highlight.id.slice(0, 8)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyImage = async () => {
    setIsExporting(true);
    try {
      const canvas = generateCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
        } catch {
          // If browser clipboard doesn't permit image writing, trigger download as fallback
          handleDownloadPNG();
        }
      }, 'image/png');
    } finally {
      setIsExporting(false);
    }
  };

  const copyAsMarkdownQuote = () => {
    const text = `> ${highlight.content}\n\n— **${highlight.source_name || 'Unknown'}**${
      highlight.source_author ? ` by ${highlight.source_author}` : ''
    }`;
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const getAspectClass = () => {
    switch (aspectRatio) {
      case 'story':
        return 'w-64 min-h-[420px]'; // 9:16
      case 'landscape':
        return 'w-full min-h-[220px] max-w-lg'; // 16:9
      default:
        return 'w-80 min-h-[320px]'; // 1:1 square
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-neutral-800 dark:text-white">
            <Share2 className="w-4 h-4 text-teal-700" />
            <span>Generate Quote Card PNG</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Bar */}
        <div className="px-5 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setAspectRatio('square')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                aspectRatio === 'square'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-neutral-500'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span>Square (1:1)</span>
            </button>
            <button
              onClick={() => setAspectRatio('story')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                aspectRatio === 'story'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-neutral-500'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Story (9:16)</span>
            </button>
            <button
              onClick={() => setAspectRatio('landscape')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                aspectRatio === 'landscape'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-neutral-500'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Landscape (16:9)</span>
            </button>
          </div>
        </div>

        {/* Card Canvas Preview */}
        <div className="p-6 flex flex-col items-center justify-center overflow-hidden">
          <div
            id="quote-card-canvas"
            className={`${getAspectClass()} p-7 rounded-3xl shadow-xl border ${currentTheme.bg} ${currentTheme.border} transition-all duration-300 flex flex-col justify-between space-y-6`}
          >
            {/* Top quotation mark */}
            <span
              className="font-serif text-5xl leading-none select-none block opacity-30"
              style={{ color: currentTheme.accent }}
            >
              “
            </span>

            {/* Quote content */}
            <blockquote
              className={`font-serif text-base sm:text-lg leading-relaxed italic ${currentTheme.text}`}
            >
              {highlight.content}
            </blockquote>

            {/* Note if present */}
            {highlight.note && (
              <div className="p-2.5 rounded-xl bg-black/20 text-xs border border-white/10 text-white/90">
                <span className="font-bold mr-1">Note:</span>
                {highlight.note}
              </div>
            )}

            {/* Attribution */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <p className={`font-bold truncate ${currentTheme.text}`}>
                  {highlight.source_name || 'Untitled Source'}
                </p>
                {highlight.source_author && (
                  <p className={`truncate text-[11px] ${currentTheme.sub}`}>
                    by {highlight.source_author}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-60">
                <span className="text-[10px] uppercase tracking-widest font-mono font-bold">
                  MNEMA
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Public Read-Only Share Link Bar */}
        <div className="px-4 py-3 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
              <Globe className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>Public Read-Only Link</span>
            </div>
            {!publicShare ? (
              <button
                type="button"
                onClick={handleCreatePublicLink}
                disabled={isLoadingShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {isLoadingShare ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                <span>Create Share URL</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <a
                  href={`/share/${publicShare.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 hover:text-teal-700"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={handleCopyPublicLink}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-800 text-white text-xs font-semibold hover:bg-teal-700"
                >
                  {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'Copied!' : 'Copy URL'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRevokePublicLink}
                  disabled={isLoadingShare}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  title="Revoke public share link"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {publicShare && (
            <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate bg-neutral-50 dark:bg-neutral-800/70 px-2.5 py-1 rounded-lg">
              {publicUrl}
            </p>
          )}
          {shareError && <p className="text-[11px] text-red-600">{shareError}</p>}
        </div>

        {/* Style Themes & Action Buttons */}
        <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 font-medium">Theme:</span>
            {themes.map((t, idx) => (
              <button
                key={t.name}
                onClick={() => setThemeIndex(idx)}
                className={`w-6 h-6 rounded-full ${t.bg} border-2 ${
                  themeIndex === idx ? 'ring-2 ring-teal-700 scale-110' : 'opacity-70 hover:opacity-100'
                }`}
                title={t.name}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Copy PNG to Clipboard */}
            <button
              onClick={handleCopyImage}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-2xs transition-colors"
              title="Copy PNG image to clipboard"
            >
              {copiedImage ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copied Image!</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
                  <span>Copy Image</span>
                </>
              )}
            </button>

            {/* Download PNG */}
            <button
              onClick={handleDownloadPNG}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </button>

            {/* Copy Text */}
            <button
              onClick={copyAsMarkdownQuote}
              className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              title="Copy as Markdown Quote"
            >
              {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
