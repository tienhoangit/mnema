import React, { useState, useEffect } from 'react';
import {
  Search,
  BookOpen,
  Sparkles,
  MessageSquare,
  X,
  Quote,
  Loader2,
  Brain,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { Highlight, SearchResults, EmbeddingsStatus, SemanticSearchResult } from '../types';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';

interface SearchViewProps {
  onSelectSource: (sourceId: string) => void;
  onSelectHighlight?: (hl: Highlight) => void;
  onAskAiHighlight?: (hl: Highlight) => void;
  onShareHighlight?: (hl: Highlight) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  onSelectSource,
  onSelectHighlight,
  onAskAiHighlight,
  onShareHighlight,
}) => {
  const [activeMode, setActiveMode] = useState<'keyword' | 'semantic' | 'ask_ai'>('keyword');
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [results, setResults] = useState<SearchResults>({
    sources: [],
    highlights: [],
    notes: [],
    total: 0,
  });
  const [semanticResult, setSemanticResult] = useState<SemanticSearchResult | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbeddingsStatus | null>(null);
  const [isSyncingIndex, setIsSyncingIndex] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Library AI Question Answering State
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiCitations, setAiCitations] = useState<Highlight[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query.trim(), 280);

  useEffect(() => {
    api.getEmbeddingsStatus().then(setEmbedStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults({ sources: [], highlights: [], notes: [], total: 0 });
      setSemanticResult(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    if (activeMode === 'keyword') {
      api
        .searchFulltext(debouncedQuery, filterType)
        .then((res) => {
          if (isMounted) setResults(res);
        })
        .catch((err) => {
          console.warn('Search error:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    } else if (activeMode === 'semantic') {
      api
        .searchSemantic(debouncedQuery, 20)
        .then((res) => {
          if (isMounted) setSemanticResult(res);
        })
        .catch((err) => {
          console.warn('Semantic search error:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, filterType, activeMode]);

  const handleSyncSemanticIndex = async () => {
    setIsSyncingIndex(true);
    try {
      for (let i = 0; i < 20; i++) {
        const res = await api.syncEmbeddings();
        const status = await api.getEmbeddingsStatus();
        setEmbedStatus(status);
        if (res.indexedCount === 0 || status.indexedHighlights >= status.totalHighlights) {
          break;
        }
      }
    } catch (err) {
      console.warn('Sync index error:', err);
    } finally {
      setIsSyncingIndex(false);
    }
  };

  const handleAskLibraryAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;

    setIsAiLoading(true);
    setAiError(null);
    setAiAnswer(null);
    setAiCitations([]);

    try {
      const res = await api.askLibraryAi(aiQuestion.trim());
      setAiAnswer(res.answer);
      setAiCitations(res.citations || []);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Failed to synthesize answer. Check your Gemini API key in Settings.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#faf9f5] dark:bg-[#121214] select-none">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-neutral-200/70 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md sticky top-0 z-20 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-teal-700" />
              <span>Library Search & AI Semantic Discovery</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Search by exact keywords (FTS5), conceptual meaning (AI Embeddings), or Ask Library AI.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-2xl text-xs font-semibold">
            <button
              onClick={() => setActiveMode('keyword')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                activeMode === 'keyword'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Keyword (FTS5)</span>
            </button>
            <button
              onClick={() => setActiveMode('semantic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                activeMode === 'semantic'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-purple-600" />
              <span>Semantic AI</span>
            </button>
            <button
              onClick={() => setActiveMode('ask_ai')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                activeMode === 'ask_ai'
                  ? 'bg-white dark:bg-neutral-700 text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Ask Library AI</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        {activeMode !== 'ask_ai' && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  activeMode === 'semantic'
                    ? "Search by meaning or concept (e.g. 'how to build lasting daily routines')..."
                    : "Search exact keywords (e.g. 'mental model', 'habit', 'Charlie Munger')..."
                }
                autoFocus
                className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white border-0 focus:outline-hidden focus:ring-2 focus:ring-teal-700/50"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {activeMode === 'keyword' ? (
              <div className="flex items-center gap-1 text-xs">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'sources', label: 'Sources' },
                  { id: 'highlights', label: 'Highlights' },
                  { id: 'notes', label: 'Notes' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterType(f.id)}
                    className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
                      filterType === f.id
                        ? 'bg-teal-800 text-white font-semibold'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {embedStatus && (
                  <span className="text-[11px] text-neutral-500">
                    {embedStatus.indexedHighlights}/{embedStatus.totalHighlights} indexed
                  </span>
                )}
                <button
                  onClick={handleSyncSemanticIndex}
                  disabled={isSyncingIndex}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold hover:bg-neutral-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingIndex ? 'animate-spin' : ''}`} />
                  <span>{isSyncingIndex ? 'Indexing...' : 'Sync AI Index'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-4xl mx-auto w-full flex-1">
        {activeMode === 'keyword' && (
          <div>
            {isLoading && (
              <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>Searching knowledge base...</span>
              </div>
            )}

            {!isLoading && !query.trim() && (
              <div className="py-24 text-center text-neutral-400 space-y-3">
                <Search className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-700 stroke-1" />
                <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                  Search your entire reading collection
                </p>
                <p className="text-xs max-w-md mx-auto text-neutral-400">
                  Find exact quotes, authors, books, articles, or switch to Semantic AI to search by meaning.
                </p>
              </div>
            )}

            {!isLoading && query.trim() && results.total === 0 && (
              <div className="py-20 text-center text-neutral-400 space-y-3">
                <p className="text-sm">No exact keyword matches for "{query}"</p>
                <button
                  onClick={() => setActiveMode('semantic')}
                  className="px-4 py-2 rounded-xl bg-purple-700 text-white text-xs font-semibold hover:bg-purple-600"
                >
                  Try Semantic AI Search instead →
                </button>
              </div>
            )}

            {!isLoading && results.total > 0 && (
              <div className="space-y-8">
                {results.sources.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Sources ({results.sources.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {results.sources.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => onSelectSource(s.id)}
                          className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 hover:border-teal-700 shadow-2xs cursor-pointer transition-all flex items-center gap-3.5"
                        >
                          {s.image_url ? (
                            <img
                              src={s.image_url}
                              alt=""
                              className="w-10 h-14 object-cover rounded shadow-2xs shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-14 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 flex items-center justify-center shrink-0">
                              <BookOpen className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-white truncate">
                              {s.name}
                            </p>
                            {s.author && (
                              <p className="text-xs text-neutral-400 truncate mt-0.5">{s.author}</p>
                            )}
                            <span className="inline-block mt-1 text-[10px] uppercase font-bold text-teal-800 dark:text-teal-400">
                              {s.type} · {s.highlight_count || 0} quotes
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.highlights.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 flex items-center gap-1.5">
                      <Quote className="w-3.5 h-3.5" />
                      <span>Quotes ({results.highlights.length})</span>
                    </h3>
                    <div className="space-y-3">
                      {results.highlights.map((hl) => (
                        <div
                          key={hl.id}
                          onClick={() => {
                            if (onSelectHighlight) onSelectHighlight(hl);
                            else onSelectSource(hl.source_id);
                          }}
                          className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 hover:border-teal-700/60 shadow-2xs cursor-pointer transition-all space-y-2"
                        >
                          <blockquote className="font-serif italic text-xs sm:text-sm text-neutral-800 dark:text-neutral-100 leading-relaxed">
                            “{hl.content}”
                          </blockquote>
                          <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                            <span className="font-semibold text-neutral-600 dark:text-neutral-300 truncate">
                              {hl.source_name || 'Source'} {hl.source_author ? `· ${hl.source_author}` : ''}
                            </span>
                            <div className="flex items-center gap-2">
                              {hl.location && (
                                <span className="font-mono text-[10px]">{hl.location}</span>
                              )}
                              {onAskAiHighlight && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAskAiHighlight(hl);
                                  }}
                                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-purple-600 transition-colors"
                                  title="Ask AI"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onShareHighlight && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onShareHighlight(hl);
                                  }}
                                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-teal-700 transition-colors"
                                  title="Share Quote"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.notes.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                      <span>Margin Notes & Reflections ({results.notes.length})</span>
                    </h3>
                    <div className="space-y-3">
                      {results.notes.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => onSelectSource(n.source_id)}
                          className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 shadow-2xs cursor-pointer transition-all space-y-2"
                        >
                          <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {n.note}
                          </p>
                          <p className="font-serif italic text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                            "{n.content}"
                          </p>
                          <span className="block text-[10px] text-neutral-400">
                            {n.source_name || 'Source'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeMode === 'semantic' && (
          <div>
            {isLoading && (
              <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                <span>Computing semantic similarity across your highlights...</span>
              </div>
            )}

            {!isLoading && !query.trim() && (
              <div className="py-24 text-center text-neutral-400 space-y-3">
                <Brain className="w-12 h-12 mx-auto text-purple-300 dark:text-purple-800 stroke-1" />
                <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                  Meaning-based Semantic Search
                </p>
                <p className="text-xs max-w-md mx-auto text-neutral-400">
                  Describe an idea in natural language — Mnema ranks your highlights by conceptual similarity using Workers AI / Gemini Embeddings.
                </p>
              </div>
            )}

            {!isLoading && query.trim() && semanticResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    Found <strong>{semanticResult.highlights.length}</strong> conceptual matches
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-mono text-[11px]">
                    {semanticResult.provider} · {semanticResult.model}
                  </span>
                </div>

                {semanticResult.highlights.length === 0 ? (
                  <div className="py-16 text-center text-xs text-neutral-400">
                    No matching highlights found. Try clicking "Sync AI Index" or broadening your query.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {semanticResult.highlights.map((hl) => (
                      <div
                        key={hl.id}
                        onClick={() => {
                          if (onSelectHighlight) onSelectHighlight(hl);
                          else onSelectSource(hl.source_id);
                        }}
                        className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 hover:border-purple-600/60 shadow-2xs cursor-pointer transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-teal-800 dark:text-teal-400 truncate">
                            {hl.source_name || 'Source'}
                            {hl.source_author ? ` · ${hl.source_author}` : ''}
                          </span>
                          <div className="flex items-center gap-2">
                            {typeof hl.similarity === 'number' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 shrink-0">
                                {hl.similarity}% match
                              </span>
                            )}
                            {onAskAiHighlight && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAskAiHighlight(hl);
                                }}
                                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-purple-600 transition-colors"
                                title="Ask AI"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onShareHighlight && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onShareHighlight(hl);
                                }}
                                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-teal-700 transition-colors"
                                title="Share Quote"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <blockquote className="font-serif italic text-xs sm:text-sm text-neutral-800 dark:text-neutral-100 leading-relaxed">
                          “{hl.content}”
                        </blockquote>
                        {hl.note && (
                          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-2 rounded-lg">
                            Note: {hl.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeMode === 'ask_ai' && (
          <div className="space-y-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-teal-900 via-teal-950 to-neutral-950 text-white shadow-md space-y-4">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Library Semantic Copilot</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-serif leading-snug">
                Ask anything across your entire library
              </h3>
              <p className="text-xs text-teal-200/80 max-w-lg leading-relaxed">
                Uses semantic retrieval + Gemini / Workers AI to synthesize thoughtful, cited answers from your highlights.
              </p>

              <form onSubmit={handleAskLibraryAi} className="pt-2 space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="e.g. How does Charlie Munger think about cognitive biases?"
                    required
                    className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder:text-white/40 border border-white/20 text-xs sm:text-sm focus:outline-hidden focus:border-amber-400 backdrop-blur-md"
                  />
                  <button
                    type="submit"
                    disabled={isAiLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                  >
                    {isAiLoading ? 'Synthesizing...' : 'Ask AI'}
                  </button>
                </div>
              </form>
            </div>

            {aiError && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-600">
                {aiError}
              </div>
            )}

            {isAiLoading && (
              <div className="p-12 text-center text-xs text-neutral-400 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
                <p>Synthesizing insights from your reading highlights...</p>
              </div>
            )}

            {aiAnswer && (
              <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-6 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Synthesized Insight</span>
                </div>

                <div className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-100 font-sans leading-relaxed whitespace-pre-wrap">
                  {aiAnswer}
                </div>

                {aiCitations.length > 0 && (
                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      Referenced Highlights:
                    </span>
                    <div className="space-y-2">
                      {aiCitations.map((c, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            if (c.source_id) {
                              if (onSelectHighlight) onSelectHighlight(c);
                              else onSelectSource(c.source_id);
                            }
                          }}
                          className={`p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-xs text-neutral-700 dark:text-neutral-300 ${
                            c.source_id ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors' : ''
                          }`}
                        >
                          <p className="font-serif italic">"{c.content}"</p>
                          <span className="text-[10px] text-neutral-400 mt-1 block">
                            — {c.source_name} {c.source_author ? `(${c.source_author})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
