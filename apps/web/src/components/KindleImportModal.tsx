import React, { useState } from 'react';
import {
  X,
  Book,
  Upload,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { api, ImportSummary } from '../services/api';

interface KindleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  importKindleFn: (text: string) => Promise<{ data: ImportSummary }>;
}

type ImportTab = 'kindle' | 'readwise' | 'books_csv' | 'pdf';

export const KindleImportModal: React.FC<KindleImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  importKindleFn,
}) => {
  const [activeTab, setActiveTab] = useState<ImportTab>('kindle');
  const [clippingsText, setClippingsText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvFormat, setCsvFormat] = useState<'auto' | 'apple_books' | 'kobo' | 'goodreads'>('auto');

  // PDF State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfAuthor, setPdfAuthor] = useState('');
  const [pdfFallbackText, setPdfFallbackText] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTextFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') setter(content);
    };
    reader.readAsText(file);
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    if (!pdfTitle.trim()) {
      setPdfTitle(file.name.replace(/\.pdf$/i, ''));
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (activeTab === 'kindle') {
        const res = await importKindleFn(clippingsText);
        setResult(
          `Processed ${res.data.booksProcessed} books (${res.data.booksCreated} new) and imported ${res.data.highlightsImported} highlights.`
        );
      } else if (activeTab === 'readwise') {
        const res = await api.importCsv(csvText, 'readwise');
        setResult(
          `Readwise CSV: ${res.data.booksProcessed} sources (${res.data.booksCreated} new) and ${res.data.highlightsImported} highlights imported.`
        );
      } else if (activeTab === 'books_csv') {
        const res = await api.importCsv(csvText, csvFormat);
        setResult(
          `Imported (${res.data.detectedFormat || csvFormat}): ${res.data.booksProcessed} books (${res.data.booksCreated} new) and ${res.data.highlightsImported} highlights/reviews.`
        );
      } else if (activeTab === 'pdf') {
        const src = await api.importPdfFile({
          file: pdfFile || undefined,
          title: pdfTitle.trim() || undefined,
          author: pdfAuthor.trim() || undefined,
          text: pdfFallbackText.trim() || undefined,
          reading_status: 'inbox',
        });
        setResult(`Imported PDF "${src.name}" (${src.word_count} words) into Articles → Inbox!`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    (activeTab === 'kindle' && Boolean(clippingsText.trim())) ||
    ((activeTab === 'readwise' || activeTab === 'books_csv') && Boolean(csvText.trim())) ||
    (activeTab === 'pdf' && Boolean(pdfFile || pdfFallbackText.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-900 dark:text-white font-semibold text-sm">
            <Upload className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Import Highlights & Documents</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Tabs */}
        <div className="px-4 pt-3 flex flex-wrap gap-1.5 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          {[
            { id: 'kindle' as const, label: 'Kindle .txt', icon: Book },
            { id: 'readwise' as const, label: 'Readwise CSV', icon: FileSpreadsheet },
            { id: 'books_csv' as const, label: 'Apple / Kobo / Goodreads', icon: FileSpreadsheet },
            { id: 'pdf' as const, label: 'PDF Upload', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setError(null);
                  setResult(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-teal-800 text-white shadow-2xs'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'kindle' && (
            <>
              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200/50 dark:border-teal-800/40 text-xs text-teal-900 dark:text-teal-200 space-y-1">
                <p className="font-semibold">Kindle My Clippings.txt:</p>
                <p>
                  Connect your Kindle via USB and upload <code className="font-mono bg-teal-100 dark:bg-teal-900 px-1 rounded">documents/My Clippings.txt</code> or paste below.
                </p>
              </div>
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl cursor-pointer hover:border-teal-700 bg-neutral-50/50 dark:bg-neutral-800/50">
                <Upload className="w-5 h-5 text-neutral-400 mb-1" />
                <span className="text-xs font-medium">Browse My Clippings.txt</span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={(e) => handleTextFileUpload(e, setClippingsText)}
                  className="hidden"
                />
              </label>
              <textarea
                rows={4}
                placeholder="Or paste raw clippings text here..."
                value={clippingsText}
                onChange={(e) => setClippingsText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
              />
            </>
          )}

          {(activeTab === 'readwise' || activeTab === 'books_csv') && (
            <>
              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200/50 dark:border-teal-800/40 text-xs text-teal-900 dark:text-teal-200 space-y-1">
                <p className="font-semibold">
                  {activeTab === 'readwise'
                    ? 'Readwise CSV Export'
                    : 'Apple Books, Kobo & Goodreads CSV'}
                </p>
                <p>
                  {activeTab === 'readwise'
                    ? 'Supports Readwise export columns: Highlight, Book Title, Book Author, Note, Color, Tags, Location.'
                    : 'Supports Apple Books / Kobo highlight CSVs and Goodreads Library Export CSV (shelves, ratings, reviews).'}
                </p>
              </div>

              {activeTab === 'books_csv' && (
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    CSV Source Format
                  </label>
                  <select
                    value={csvFormat}
                    onChange={(e) =>
                      setCsvFormat(
                        e.target.value as 'auto' | 'apple_books' | 'kobo' | 'goodreads'
                      )
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                  >
                    <option value="auto">Auto-detect from CSV headers</option>
                    <option value="apple_books">Apple Books CSV</option>
                    <option value="kobo">Kobo Highlights CSV</option>
                    <option value="goodreads">Goodreads Library Export CSV</option>
                  </select>
                </div>
              )}

              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl cursor-pointer hover:border-teal-700 bg-neutral-50/50 dark:bg-neutral-800/50">
                <FileSpreadsheet className="w-5 h-5 text-neutral-400 mb-1" />
                <span className="text-xs font-medium">Browse .csv file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleTextFileUpload(e, setCsvText)}
                  className="hidden"
                />
              </label>

              <textarea
                rows={4}
                placeholder="Or paste CSV content here..."
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
              />
            </>
          )}

          {activeTab === 'pdf' && (
            <>
              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200/50 dark:border-teal-800/40 text-xs text-teal-900 dark:text-teal-200 space-y-1">
                <p className="font-semibold">PDF Reader & Highlighting</p>
                <p>
                  Upload a text-based PDF to extract its readable text into Articles → Inbox so you can read and highlight passages directly.
                </p>
              </div>

              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl cursor-pointer hover:border-teal-700 bg-neutral-50/50 dark:bg-neutral-800/50">
                <FileText className="w-5 h-5 text-teal-700 mb-1" />
                <span className="text-xs font-medium">
                  {pdfFile ? pdfFile.name : 'Click to select PDF file (.pdf)'}
                </span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handlePdfSelect}
                  className="hidden"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Document Title"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                />
                <input
                  type="text"
                  placeholder="Author (optional)"
                  value={pdfAuthor}
                  onChange={(e) => setPdfAuthor(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                  Or paste extracted text directly (optional override)
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste document text if your PDF uses custom scanned fonts..."
                  value={pdfFallbackText}
                  onChange={(e) => setPdfFallbackText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                />
              </div>
            </>
          )}

          {result && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{result}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl"
            >
              Close
            </button>
            <button
              onClick={handleImport}
              disabled={loading || !canSubmit}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-teal-800 hover:bg-teal-700 text-white rounded-xl shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>Import Now</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
