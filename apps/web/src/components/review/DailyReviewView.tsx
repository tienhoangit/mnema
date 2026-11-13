import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Highlight, ReviewAction, StreakStats, Source, Tag } from '../../types';
import { StreaksTab } from './StreaksTab';
import { ReviewCard } from './ReviewCard';
import { CustomReviewBuilder } from './CustomReviewBuilder';
import { useReviewShortcuts } from './useReviewShortcuts';
import { ReviewFooter } from './ReviewFooter';
import { ReviewCompleteView } from './ReviewCompleteView';
import { api } from '../../services/api';

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
      api
        .getActivityStats()
        .then((list) => setActivityList(list))
        .catch(() => {});
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

  const handleToggleSimilar = async () => {
    const nextShow = !showSimilar;
    setShowSimilar(nextShow);
    if (nextShow && currentHighlight) {
      setIsLoadingSimilar(true);
      try {
        const found = await api.getSimilarHighlights(currentHighlight.id);
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

  useReviewShortcuts({
    isCompleted,
    activeQueue,
    currentIndex,
    activeTab,
    clozeMode,
    isRevealed,
    setIsRevealed,
    handleAction,
    handleNext,
    handlePrev,
    handleUndo,
    onToggleFavorite,
  });

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

  const currentHighlight = activeQueue[currentIndex];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-[#faf9f5] dark:bg-[#121214] select-none overflow-y-auto">
      {/* 1. Review Top Nav Tabs */}
      <div className="min-h-12 border-b border-neutral-200/70 dark:border-neutral-800 px-3 sm:px-6 py-1 sm:py-0 flex items-center justify-between shrink-0 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md sticky top-0 z-20 gap-2">
        <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('daily')}
            className={`min-h-[44px] flex items-center text-xs font-bold transition-colors pb-1 border-b-2 whitespace-nowrap shrink-0 ${
              activeTab === 'daily'
                ? 'border-teal-800 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            Daily<span className="hidden sm:inline">&nbsp;review</span>
          </button>
          <button
            onClick={() => setActiveTab('streaks')}
            className={`min-h-[44px] flex items-center text-xs font-bold transition-colors pb-1 border-b-2 whitespace-nowrap shrink-0 ${
              activeTab === 'streaks'
                ? 'border-teal-800 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            Streaks<span className="hidden sm:inline">&nbsp;& History</span>
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`min-h-[44px] flex items-center text-xs font-bold transition-colors pb-1 border-b-2 whitespace-nowrap shrink-0 ${
              activeTab === 'custom'
                ? 'border-teal-800 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            Custom<span className="hidden sm:inline">&nbsp;Review</span>
          </button>
        </div>

        {/* Progress Tracker / Cloze Toggle / Exit */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {activeTab === 'daily' && activeQueue.length > 0 && !isCompleted && (
            <>
              <button
                onClick={toggleClozeMode}
                className={`min-h-[36px] flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  clozeMode
                    ? 'bg-teal-800 text-white border-teal-800'
                    : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
                title="Toggle Cloze / Active Recall mode"
              >
                {clozeMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span className="hidden xs:inline">Cloze</span>
                <span>{clozeMode ? 'On' : 'Off'}</span>
              </button>
              <span className="text-[11px] sm:text-xs font-medium text-neutral-500 whitespace-nowrap">
                {currentIndex + 1}/{activeQueue.length}
              </span>
            </>
          )}
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
            <ReviewCompleteView
              reviewedCount={reviewedCount}
              streakStats={streakStats}
              onReviewAgain={() => {
                setIsCompleted(false);
                setCurrentIndex(0);
                onRefresh();
              }}
              onClose={onClose}
            />
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
              <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-3xl mx-auto w-full">
                {currentHighlight && (
                  <ReviewCard
                    highlight={currentHighlight}
                    clozeMode={clozeMode}
                    isRevealed={isRevealed}
                    onReveal={() => setIsRevealed(true)}
                    onToggleFavorite={onToggleFavorite}
                    showSimilar={showSimilar}
                    similarHighlights={similarHighlights}
                    isLoadingSimilar={isLoadingSimilar}
                    onToggleSimilar={handleToggleSimilar}
                  />
                )}
              </div>

              {/* Contemplative Bottom Action Bar with Undo, Again, Hard, Good, Easy, Discard, Next */}
              <ReviewFooter
                currentIndex={currentIndex}
                onPrev={handlePrev}
                onNext={handleNext}
                onAction={handleAction}
                onUndo={onUndo ? handleUndo : undefined}
                isUndoLoading={isUndoLoading}
              />
            </div>
          )}
        </>
      )}

      {/* TAB 2: STREAKS & HISTORY */}
      {activeTab === 'streaks' && (
        <StreaksTab streakStats={streakStats} activityList={activityList} />
      )}

      {/* TAB 3: CUSTOM REVIEW */}
      {activeTab === 'custom' && (
        <CustomReviewBuilder
          customTopic={customTopic}
          setCustomTopic={setCustomTopic}
          customSourceId={customSourceId}
          setCustomSourceId={setCustomSourceId}
          customTag={customTag}
          setCustomTag={setCustomTag}
          customCount={customCount}
          setCustomCount={setCustomCount}
          sources={sources}
          tags={tags}
          isStartingCustom={isStartingCustom}
          customError={customError}
          onSubmit={handleStartCustomReview}
        />
      )}
    </div>
  );
};
