import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Star,
  Trash2,
  Sparkles,
  Calendar,
  Flame,
  CheckCircle2,
  RotateCcw,
  Undo2,
  Sliders,
  Filter,
  Search,
  BookOpen,
  Tag as TagIcon,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Highlight, ReviewAction, StreakStats, Source, Tag } from '../types';
import { ActivityHeatmap } from './ActivityHeatmap';
import { api } from '../services/api';

interface DailyReviewViewProps {
  highlights: Highlight[];
  streakStats?: StreakStats;
  sources?: Source[];
  tags?: Tag[];
  onAction: (id: string, action: ReviewAction) => Promise<void>;
  onUndo?: () => Promise<void>;
  onToggleFavorite?: (hl: Highlight) => void;
  onClose: () => void;
  onRefresh: () => void;
}

export const DailyReviewView: React.FC<DailyReviewViewProps> = ({
  highlights: initialHighlights,
  streakStats,
  sources = [],
  tags = [],
  onAction,
  onUndo,
  onToggleFavorite,
  onClose,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'streaks' | 'custom'>('daily');
  const [activeQueue, setActiveQueue] = useState<Highlight[]>(initialHighlights);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [showSimilar, setShowSimilar] = useState(false);
  const [similarHighlights, setSimilarHighlights] = useState<Highlight[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [isUndoLoading, setIsUndoLoading] = useState(false);
  const [clozeMode, setClozeMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mnema_cloze_mode') === '1';
    } catch {
      return false;
    }
  });
  const [isRevealed, setIsRevealed] = useState(false);

  const toggleClozeMode = () => {
    setClozeMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mnema_cloze_mode', next ? '1' : '0');
      } catch {
        // ignore storage error
      }
      return next;
    });
    setIsRevealed(false);
  };

  // Custom Review Form State
  const [customTopic, setCustomTopic] = useState('');
  const [customSourceId, setCustomSourceId] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [customCount, setCustomCount] = useState<number>(10);
  const [isStartingCustom, setIsStartingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  // Activity data for streaks tab
  const [activityList, setActivityList] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    setActiveQueue(initialHighlights);
  }, [initialHighlights]);

  useEffect(() => {
    if (activeTab === 'streaks') {
      fetch('/api/stats/activity')
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((json) => setActivityList(json.data || []))
        .catch(() => { });
    }
  }, [activeTab]);

  // Trigger celebration on complete
  useEffect(() => {
    if (isCompleted) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isCompleted]);

  // Keyboard shortcut listener:
  // ArrowRight: Next
  // ArrowLeft: Prev
  // ArrowUp: Show More (remember)
  // ArrowDown: Show Less (forget)
  // D: Discard
  // Z: Undo
  // F: Favorite
  useEffect(() => {
    if (isCompleted || activeQueue.length === 0 || activeTab !== 'daily') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      const current = activeQueue[currentIndex];
      if (!current) return;

      if (e.key === ' ') {
        if (clozeMode && !isRevealed) {
          e.preventDefault();
          setIsRevealed(true);
        }
      } else if (e.key === '1') {
        e.preventDefault();
        handleAction('again');
      } else if (e.key === '2') {
        e.preventDefault();
        handleAction('hard');
      } else if (e.key === '3') {
        e.preventDefault();
        handleAction('good');
      } else if (e.key === '4') {
        e.preventDefault();
        handleAction('easy');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleAction('good');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleAction('again');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleAction('discard');
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (onToggleFavorite) onToggleFavorite(current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isCompleted, activeQueue, activeTab, onToggleFavorite, clozeMode, isRevealed]);

  const handleToggleSimilar = async () => {
    const nextShow = !showSimilar;
    setShowSimilar(nextShow);
    if (nextShow && currentHighlight) {
      setIsLoadingSimilar(true);
      try {
        const apiKey = localStorage.getItem('mnema_gemini_api_key') || undefined;
        const found = await api.getSimilarHighlights(currentHighlight.id, apiKey);
        setSimilarHighlights(found);
      } catch {
        setSimilarHighlights([]);
      } finally {
        setIsLoadingSimilar(false);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < activeQueue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setShowSimilar(false);
      setSimilarHighlights([]);
      setIsRevealed(false);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setShowSimilar(false);
      setSimilarHighlights([]);
      setIsRevealed(false);
    }
  };

  const handleAction = async (action: ReviewAction) => {
    const current = activeQueue[currentIndex];
    if (!current) return;

    await onAction(current.id, action);
    setReviewedCount((prev) => prev + 1);
    handleNext();
  };

  const renderClozeQuote = (text: string) => {
    if (!clozeMode || isRevealed) {
      return <>“{text}”</>;
    }
    const tokens = text.split(/(\s+)/);
    let longWordIdx = 0;
    return (
      <>
        “
        {tokens.map((tok, i) => {
          const clean = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
          if (clean.length >= 6) {
            const shouldMask = longWordIdx % 3 === 1;
            longWordIdx += 1;
            if (shouldMask) {
              const leading = tok.slice(0, tok.indexOf(clean));
              const trailing = tok.slice(tok.indexOf(clean) + clean.length);
              return (
                <React.Fragment key={i}>
                  {leading}
                  <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-teal-100/80 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300 font-sans text-sm font-semibold align-baseline">
                    [...]
                  </span>
                  {trailing}
                </React.Fragment>
              );
            }
          }
          return <React.Fragment key={i}>{tok}</React.Fragment>;
        })}
        ”
      </>
    );
  };

  const handleUndo = async () => {
    if (!onUndo) return;
    setIsUndoLoading(true);
    try {
      await onUndo();
      if (currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
      setReviewedCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      console.warn('Undo error:', err.message);
    } finally {
      setIsUndoLoading(false);
    }
  };

  const handleStartCustomReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartingCustom(true);
    setCustomError(null);

    try {
      const res = await api.startCustomReview({
        topic: customTopic || undefined,
        source_id: customSourceId || undefined,
        tag: customTag || undefined,
        count: customCount,
      });

      const customHighlights = res.highlights || [];
      if (customHighlights.length === 0) {
        setCustomError('No highlights found matching your criteria. Try adjusting the filter.');
        setIsStartingCustom(false);
        return;
      }

      setActiveQueue(customHighlights);
      setCurrentIndex(0);
      setIsCompleted(false);
      setReviewedCount(0);
      setActiveTab('daily');
    } catch (err: any) {
      setCustomError(err.message || 'Failed to start custom review');
    } finally {
      setIsStartingCustom(false);
    }
  };

  // Render Calendar Grid for Streaks & History Tab
  const renderMonthlyCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const activeDateSet = new Set(
      activityList.map((a) => a.date)
    );

    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-8 rounded-lg opacity-0" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isReviewed = activeDateSet.has(dateStr);
      const isToday = day === now.getDate();

      cells.push(
        <div
          key={dateStr}
          className={`h-8 sm:h-9 rounded-xl flex items-center justify-center text-xs font-semibold relative transition-all ${isReviewed
            ? 'bg-teal-700 text-white shadow-xs'
            : isToday
              ? 'border-2 border-teal-600 text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40'
              : 'bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400'
            }`}
          title={`${dateStr}${isReviewed ? ' - Reviewed' : ''}`}
        >
          <span>{day}</span>
          {isReviewed && (
            <span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-1" />
          )}
        </div>
      );
    }

    return (
      <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-neutral-900 dark:text-white">
            <Calendar className="w-4 h-4 text-teal-700" />
            <span>Monthly Review History ({monthName})</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-700 inline-block" />
              <span>Reviewed day</span>
            </span>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1.5">{cells}</div>
      </div>
    );
  };

  const currentHighlight = activeQueue[currentIndex];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-[#faf9f5] dark:bg-[#121214] select-none overflow-y-auto">
      {/* 1. Review Top Nav Tabs */}
      <div className="h-12 border-b border-neutral-200/70 dark:border-neutral-800 px-6 flex items-center justify-between shrink-0 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('daily')}
            className={`text-xs font-bold transition-colors pb-1 border-b-2 ${activeTab === 'daily'
              ? 'border-teal-800 text-teal-800 dark:text-teal-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
          >
            Daily review
          </button>
          <button
            onClick={() => setActiveTab('streaks')}
            className={`text-xs font-bold transition-colors pb-1 border-b-2 ${activeTab === 'streaks'
              ? 'border-teal-800 text-teal-800 dark:text-teal-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
          >
            Streaks & History
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`text-xs font-bold transition-colors pb-1 border-b-2 ${activeTab === 'custom'
              ? 'border-teal-800 text-teal-800 dark:text-teal-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
          >
            Custom Review
          </button>
        </div>

        {/* Progress Tracker / Cloze Toggle / Exit */}
        <div className="flex items-center gap-3">
          {activeTab === 'daily' && activeQueue.length > 0 && !isCompleted && (
            <>
              <button
                onClick={toggleClozeMode}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  clozeMode
                    ? 'bg-teal-800 text-white border-teal-800'
                    : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
                title="Toggle Cloze / Active Recall mode"
              >
                {clozeMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>Cloze {clozeMode ? 'On' : 'Off'}</span>
              </button>
              <span className="text-xs font-medium text-neutral-500">
                {currentIndex + 1} of {activeQueue.length}
              </span>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Exit review"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar Line for Daily Review */}
      {activeTab === 'daily' && activeQueue.length > 0 && !isCompleted && (
        <div className="w-full h-1 bg-neutral-200/60 dark:bg-neutral-800 shrink-0">
          <div
            className="h-full bg-teal-800 dark:bg-teal-500 transition-all duration-200"
            style={{ width: `${((currentIndex + 1) / activeQueue.length) * 100}%` }}
          />
        </div>
      )}

      {/* TAB 1: DAILY REVIEW */}
      {activeTab === 'daily' && (
        <>
          {/* Completed State */}
          {isCompleted ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-900 shadow-sm">
                <Flame className="w-8 h-8 fill-amber-500" />
              </div>

              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
                Review Complete!
              </h2>
              <p className="text-sm text-neutral-500 mb-6">
                You reviewed <strong className="text-teal-700">{reviewedCount}</strong> highlights in this session.
              </p>

              {/* Streak Mini Box */}
              <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs mb-8 flex items-center gap-6">
                <div className="text-left">
                  <p className="text-xs text-neutral-400">Current Streak</p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-1">
                    <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <span>{streakStats?.currentStreak || 0} Days</span>
                  </p>
                </div>
                <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800" />
                <div className="text-left">
                  <p className="text-xs text-neutral-400">Best Streak</p>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {streakStats?.longestStreak || 1} Days
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsCompleted(false);
                    setCurrentIndex(0);
                    onRefresh();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Review Again</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : activeQueue.length === 0 ? (
            /* Empty Queue State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                You're all caught up!
              </h2>
              <p className="text-sm text-neutral-500 max-w-sm mb-6">
                No highlights due for review today. Add more quotes or try a Custom Review!
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('custom')}
                  className="px-5 py-2.5 rounded-xl bg-teal-800 text-white font-medium text-xs shadow-xs hover:bg-teal-700 transition-colors"
                >
                  Start Custom Review
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 font-medium text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Back to Feed
                </button>
              </div>
            </div>
          ) : (
            /* Active SRS Card View */
            <div className="flex-1 flex flex-col justify-between">
              <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl mx-auto w-full">
                {currentHighlight && (
                  <div className="w-full p-8 sm:p-12 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm relative flex flex-col justify-between min-h-[340px]">
                    {/* Top Source Meta & Favorite */}
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-xs font-bold text-teal-800 dark:text-teal-400 uppercase tracking-wide">
                          {currentHighlight.source_author || 'Unknown Author'}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {currentHighlight.source_name || 'Book or Article'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Favorite button */}
                        {onToggleFavorite && (
                          <button
                            onClick={() => onToggleFavorite(currentHighlight)}
                            className={`p-2 rounded-xl transition-colors ${currentHighlight.favorite
                              ? 'text-amber-500 fill-amber-500 bg-amber-50 dark:bg-amber-950/40'
                              : 'text-neutral-400 hover:text-amber-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              }`}
                            title="Favorite (F)"
                          >
                            <Star
                              className={`w-4 h-4 ${currentHighlight.favorite ? 'fill-amber-500' : ''
                                }`}
                            />
                          </button>
                        )}

                        {/* Semantic connection trigger */}
                        <button
                          onClick={handleToggleSimilar}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Show similar</span>
                        </button>
                      </div>
                    </div>

                    {/* Quote Body */}
                    <div
                      onClick={() => {
                        if (clozeMode && !isRevealed) setIsRevealed(true);
                      }}
                      className={`my-auto ${clozeMode && !isRevealed ? 'cursor-pointer' : ''}`}
                    >
                      <blockquote className="text-lg sm:text-xl leading-relaxed text-neutral-800 dark:text-neutral-100 font-serif italic">
                        {renderClozeQuote(currentHighlight.content)}
                      </blockquote>
                      {clozeMode && !isRevealed && (
                        <p className="mt-3 text-[11px] font-sans font-medium text-teal-700 dark:text-teal-400">
                          Active Recall: Tap card or press Space to reveal full highlight
                        </p>
                      )}
                    </div>

                    {/* Note if present */}
                    {currentHighlight.note && (
                      <div className="mt-6 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-900 dark:text-amber-200">
                        <span className="font-semibold mr-1">Your Personal Note:</span>
                        {currentHighlight.note}
                      </div>
                    )}

                    {showSimilar && (
                      <div className="mt-4 p-3.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900/40 text-xs text-teal-900 dark:text-teal-200 space-y-2 animate-in fade-in duration-150">
                        <div className="font-semibold">Semantically Related Highlights:</div>
                        {isLoadingSimilar ? (
                          <p className="text-neutral-500">Searching related ideas...</p>
                        ) : similarHighlights.length === 0 ? (
                          <p className="text-neutral-500">No closely related highlights found yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {similarHighlights.map((sim) => (
                              <div
                                key={sim.id}
                                className="p-2.5 rounded-lg bg-white/80 dark:bg-neutral-900/70 border border-teal-200/40 dark:border-teal-800/40"
                              >
                                <p className="font-serif italic text-neutral-800 dark:text-neutral-200">
                                  “{sim.content}”
                                </p>
                                <p className="text-[10px] text-neutral-500 mt-1">
                                  — {sim.source_name}
                                  {typeof sim.similarity === 'number' ? ` (${sim.similarity}% match)` : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contemplative Bottom Action Bar with Undo, Show Less, Show More, Discard, Next */}
              <footer className="h-20 border-t border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
                {/* Prev & Undo */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors px-2 py-1.5 rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Prev (←)</span>
                  </button>

                  {onUndo && (
                    <button
                      onClick={handleUndo}
                      disabled={isUndoLoading || reviewedCount === 0}
                      className="flex items-center gap-1 text-xs text-neutral-500 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-30 disabled:pointer-events-none transition-colors px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700"
                      title="Undo last action (Z)"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo (Z)</span>
                    </button>
                  )}
                </div>

                {/* Center FSRS Actions (Again / Hard / Good / Easy / Discard) */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  <button
                    onClick={() => handleAction('again')}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-semibold text-red-700 dark:text-red-300 transition-colors"
                    title="Again — forgot (1 or ↓)"
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>Again (1)</span>
                  </button>

                  <button
                    onClick={() => handleAction('hard')}
                    className="px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors"
                    title="Hard — recalled with effort (2)"
                  >
                    Hard (2)
                  </button>

                  <button
                    onClick={() => handleAction('good')}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-xs"
                    title="Good — recalled (3 or ↑)"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-teal-300" />
                    <span>Good (3)</span>
                  </button>

                  <button
                    onClick={() => handleAction('easy')}
                    className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition-colors"
                    title="Easy — effortless recall (4)"
                  >
                    Easy (4)
                  </button>

                  <button
                    onClick={() => handleAction('discard')}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-400 hover:text-red-600 transition-colors"
                    title="Discard from review queue (D)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Discard (D)</span>
                  </button>
                </div>

                {/* Next */}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg"
                >
                  <span>Next (→)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </footer>
            </div>
          )}
        </>
      )}

      {/* TAB 2: STREAKS & HISTORY */}
      {activeTab === 'streaks' && (
        <div className="max-w-4xl mx-auto w-full p-6 sm:p-8 space-y-6">
          {/* Streak Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-xs font-semibold">Current Streak</span>
                <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
              </div>
              <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">
                {streakStats?.currentStreak || 0}
                <span className="text-sm font-normal text-neutral-400 ml-1">days</span>
              </p>
              <p className="text-[11px] text-neutral-400">Keep it going tomorrow!</p>
            </div>

            <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-xs font-semibold">Longest Streak</span>
                <Star className="w-5 h-5 text-teal-600 fill-teal-600" />
              </div>
              <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">
                {streakStats?.longestStreak || 0}
                <span className="text-sm font-normal text-neutral-400 ml-1">days</span>
              </p>
              <p className="text-[11px] text-neutral-400">Your personal record</p>
            </div>

            <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="text-xs font-semibold">Total Reviews Logged</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">
                {streakStats?.totalReviewsLogged || 0}
              </p>
              <p className="text-[11px] text-neutral-400">Memories consolidated</p>
            </div>
          </div>

          {/* Activity Heatmap Component */}
          <ActivityHeatmap activities={activityList} streakStats={streakStats} />

          {/* Monthly Calendar Grid */}
          {renderMonthlyCalendar()}
        </div>
      )}

      {/* TAB 3: CUSTOM REVIEW */}
      {activeTab === 'custom' && (
        <div className="max-w-2xl mx-auto w-full p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Custom Review Session
            </h2>
            <p className="text-xs text-neutral-500">
              Focus your review on a specific topic, book, or tag when preparing for deep work.
            </p>
          </div>

          <form
            onSubmit={handleStartCustomReview}
            className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-5"
          >
            {/* Topic Search */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-teal-700" />
                <span>Topic or Keyword</span>
              </label>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="e.g. mental models, habits, compounding, leadership..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700"
              />
            </div>

            {/* Source Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-teal-700" />
                <span>Filter by Source (Optional)</span>
              </label>
              <select
                value={customSourceId}
                onChange={(e) => setCustomSourceId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 cursor-pointer"
              >
                <option value="">All Sources</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.author ? `(${s.author})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
                <TagIcon className="w-3.5 h-3.5 text-teal-700" />
                <span>Filter by Tag (Optional)</span>
              </label>
              <select
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-hidden focus:border-teal-700 cursor-pointer"
              >
                <option value="">All Tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.name}>
                    #{t.name} ({t.count || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Review Count Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-teal-700" />
                <span>Batch Size</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCustomCount(num)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${customCount === num
                      ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }`}
                  >
                    {num} Quotes
                  </button>
                ))}
              </div>
            </div>

            {customError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-600">
                {customError}
              </div>
            )}

            <button
              type="submit"
              disabled={isStartingCustom}
              className="w-full py-3 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isStartingCustom ? 'Loading Session...' : 'Start Custom Review'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
