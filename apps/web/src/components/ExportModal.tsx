import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Code, Table, Check, FolderArchive, Loader2 } from 'lucide-react';
import { Highlight, Source } from '../types';
import { api } from '../services/api';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlights: Highlight[];
  sources: Source[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  highlights: initialHighlights,
  sources,
}) => {
  const [format, setFormat] = useState<'markdown' | 'csv' | 'html' | 'obsidian'>('markdown');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [allExportHighlights, setAllExportHighlights] = useState<Highlight[]>(initialHighlights);
  const [isLoadingFull, setIsLoadingFull] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsLoadingFull(true);
    setAllExportHighlights(initialHighlights);
    api
      .getAllHighlights()
      .then((data) => {
        if (active && Array.isArray(data)) {
          setAllExportHighlights(data);
        }
      })
      .catch(() => {
        if (active) setAllExportHighlights(initialHighlights);
      })
      .finally(() => {
        if (active) setIsLoadingFull(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentHighlights = allExportHighlights;
  const filteredHighlights = favoritesOnly
    ? currentHighlights.filter((h) => h.favorite)
    : currentHighlights;

  const handleExport = () => {
    if (format === 'obsidian') {
      const link = document.createElement('a');
      link.href = api.getObsidianExportUrl(favoritesOnly);
      link.download = `mnema-obsidian-vault-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
      return;
    }

    let content = '';
    let mimeType = 'text/plain';
    let filename = `mnema-highlights-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'markdown') {
      mimeType = 'text/markdown';
      filename += '.md';

      content = `# Mnema Highlights Export\n\n`;
      content += `*Exported on ${new Date().toLocaleDateString()} — ${filteredHighlights.length} highlights*\n\n---\n\n`;

      // Group by source
      const map = new Map<string, Highlight[]>();
      for (const h of filteredHighlights) {
        const title = h.source_name || 'Untitled Source';
        const list = map.get(title) || [];
        list.push(h);
        map.set(title, list);
      }

      for (const [sourceTitle, hls] of map.entries()) {
        const author = hls[0]?.source_author;
        content += `## ${sourceTitle}\n`;
        if (author) content += `**Author:** ${author}\n`;
        content += `\n`;

        for (const h of hls) {
          content += `> ${h.content.split('\n').join('\n> ')}\n\n`;
          if (h.note) content += `*Note: ${h.note}*\n\n`;
          if (h.location) content += `*(Location: ${h.location})*\n\n`;
        }
        content += `---\n\n`;
      }
    } else if (format === 'csv') {
      mimeType = 'text/csv';
      filename += '.csv';

      const headers = ['Highlight', 'Note', 'Source', 'Author', 'Location', 'Favorite', 'Date'];
      const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;

      content = headers.join(',') + '\n';
      for (const h of filteredHighlights) {
        content += [
          escapeCsv(h.content),
          escapeCsv(h.note || ''),
          escapeCsv(h.source_name || ''),
          escapeCsv(h.source_author || ''),
          escapeCsv(h.location || ''),
          h.favorite ? 'Yes' : 'No',
          escapeCsv(h.created_at),
        ].join(',') + '\n';
      }
    } else if (format === 'html') {
      mimeType = 'text/html';
      filename += '.html';

      content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mnema Highlights Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.6; }
    h1 { border-bottom: 2px solid #115e59; padding-bottom: 10px; color: #115e59; }
    h2 { margin-top: 30px; margin-bottom: 5px; color: #134e4a; }
    blockquote { border-left: 3px solid #14b8a6; padding-left: 15px; margin: 15px 0; font-style: italic; background: #f0fdfa; padding: 10px 15px; border-radius: 4px; }
    .note { background: #fef3c7; padding: 8px 12px; border-radius: 6px; font-size: 0.9em; color: #92400e; margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>Mnema Highlights Export</h1>
  <p>Exported ${filteredHighlights.length} highlights on ${new Date().toLocaleDateString()}</p>
  <hr>
`;

      for (const h of filteredHighlights) {
        content += `<h2>${h.source_name || 'Untitled'}</h2>`;
        if (h.source_author) content += `<p><strong>Author:</strong> ${h.source_author}</p>`;
        content += `<blockquote>${h.content}</blockquote>`;
        if (h.note) content += `<div class="note"><strong>Note:</strong> ${h.note}</div>`;
      }

      content += `</body></html>`;
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-900 dark:text-white font-semibold">
            <Download className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <span>Export Highlights</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
              Choose Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setFormat('markdown')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  format === 'markdown'
                    ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <FileText className="w-5 h-5 text-teal-700" />
                <span>Markdown</span>
                <span className="text-[10px] text-neutral-400">Single .md</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('obsidian')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  format === 'obsidian'
                    ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <FolderArchive className="w-5 h-5 text-violet-600" />
                <span>Obsidian Vault</span>
                <span className="text-[10px] text-neutral-400">.zip Archive</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  format === 'csv'
                    ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <Table className="w-5 h-5 text-emerald-600" />
                <span>CSV</span>
                <span className="text-[10px] text-neutral-400">Excel / Anki</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('html')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  format === 'html'
                    ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <Code className="w-5 h-5 text-sky-600" />
                <span>HTML</span>
                <span className="text-[10px] text-neutral-400">Web page</span>
              </button>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
                className="rounded border-neutral-300 text-teal-700 focus:ring-teal-700"
              />
              <span>Export only Starred / Favorite highlights ({currentHighlights.filter(h => h.favorite).length})</span>
            </label>
          </div>

          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-xs text-neutral-500 space-y-1">
            <p className="flex items-center gap-1.5">
              <span>Exporting <span className="font-bold text-neutral-800 dark:text-neutral-200">{filteredHighlights.length}</span> highlights from <span className="font-bold text-neutral-800 dark:text-neutral-200">{sources.length}</span> sources.</span>
              {isLoadingFull && <Loader2 className="w-3 h-3 animate-spin text-teal-700 ml-1 inline" />}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={filteredHighlights.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-800 hover:bg-teal-700 text-white rounded-xl shadow-xs disabled:opacity-50"
            >
              {downloaded ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download File</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

