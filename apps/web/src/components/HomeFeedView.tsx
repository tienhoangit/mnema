import React, { useState } from 'react';
import {
  Flame,
  Compass,
  Sparkles,
  BookOpen,
  Filter,
  CheckCircle2,
  Circle,
  X,
  Shuffle,
  Clock,
  Heart,
  MessageSquare,
  Tag as TagIcon,
  Share2,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { Highlight, Source, StreakStats } from '../types';
import { HighlightCard } from './shared/HighlightCard';
import { EmptyState } from './shared/EmptyState';

interface HomeFeedViewProps {
  highlights: Highlight[];
  sources: Source[];
  streakStats?: StreakStats;
  onSelectSource: (id: string) => void;
  onStartReview: () => void;
  onSelectTab: (tab: string) => void;
  onToggleFavorite: (hl: Highlight) => void;
  onAskAi: (hl: Highlight) => void;
  onShare: (hl: Highlight) => void;
  onSendEmailHighlight?: (hl: Highlight) => void;
  onDeleteHighlight: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  onOpenCreateNew: () => void;
}

export const HomeFeedView: React.FC<HomeFeedViewProps> = ({
  highlights,
  sources,
  streakStats,
  onSelectSource,
  onStartReview,
  onSelectTab,
  onToggleFavorite,
  onAskAi,
  onShare,
  onSendEmailHighlight,
  onDeleteHighlight,
  onUpdateNote,
  onOpenCreateNew,
}) => {
  // Feed Filters
  const [sortBy, setSortBy] = useState<'recent' | 'random'>('recent');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterWithNotes, setFilterWithNotes] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [isChecklistDismissed, setIsChecklistDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mnema_onboarding_dismissed') === '1';
    } catch {
      return false;
    }
  });

  const handleDismissChecklist = () => {
    setIsChecklistDismissed(true);
    try {
      localStorage.setItem('mnema_onboarding_dismissed', '1');
    } catch {
      // ignore storage errors
    }
  };

  // Filter & sort logic
  const filteredHighlights = highlights
    .filter((hl) => {
      if (filterFavorites && !hl.favorite) return false;
      if (filterWithNotes && !hl.note) return false;
      if (filterType !== 'all') {
        const src = sources.find((s) => s.id === hl.source_id);
        if (src && src.type !== filterType) return false;
      }
      if (selectedTag !== 'all') {
        const hasTag = hl.tags?.some((t) => t.name.toLowerCase() === selectedTag.toLowerCase());
        if (!hasTag) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'random') {
        return 0.5 - Math.random();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Extract unique tags for sidebar filter
  const allTags = Array.from(
    new Set(
      highlights.flatMap((h) => (h.tags ? h.tags.map((t) => t.name) : []))
    )
  );

  const onboardingSteps = [
    {
      id: 'import',
      label: 'Connect Kindle or import books',
      done: sources.some((s) => s.type === 'book' || s.type === 'pdf' || s.type === 'epub'),
      onClick: () => onSelectTab('integrations'),
    },
    {
      id: 'highlight',
      label: 'Add your first highlight or source',
      done: highlights.length > 0 || sources.length > 0,
      onClick: onOpenCreateNew,
    },
    {
      id: 'review',
      label: 'Do your daily review session',
      done:
        (streakStats?.totalReviewsLogged || 0) > 0 ||
        highlights.some((h) => (h.review_count || 0) > 0),
      onClick: onStartReview,
    },
    {
      id: 'organize',
      label: 'Tag a highlight or explore essays',
      done: allTags.length > 0 || sources.some((s) => s.type === 'article'),
      onClick: () => onSelectTab('explore'),
    },
  ];
  const completedSteps = onboardingSteps.filter((s) => s.done).length;
  const showOnboarding = !isChecklistDismissed && completedSteps < onboardingSteps.length;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto">
      {/* 1. Stories Carousel Bar (Instagram-style) */}
      <section className="px-6 py-3 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xs shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-4 min-w-max">
          {/* Story 1: Daily Review */}
          <button
            onClick={onStartReview}
            className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-hidden"
          >
            <div className="relative w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 to-teal-700 shadow-xs group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-full bg-white dark:bg-neutral-900 flex items-center justify-center">
                <Flame className="w-6 h-6 text-amber-500 fill-amber-500" />
              </div>
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-teal-800 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-neutral-900">
                Ready
              </span>
            </div>
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
              Daily Review
            </span>
          </button>

          {/* Story 2: Explore */}
          <button
            onClick={() => onSelectTab('explore')}
            className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-hidden"
          >
            <div className="w-14 h-14 rounded-full p-0.5 border-2 border-dashed border-teal-600/60 flex items-center justify-center bg-teal-50/50 dark:bg-teal-950/20 group-hover:scale-105 transition-transform">
              <Compass className="w-6 h-6 text-teal-700 dark:text-teal-400" />
            </div>
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
              Explore
            </span>
          </button>

          {/* Story Bubbles for Recent Sources */}
          {sources.slice(0, 8).map((src) => (
            <button
              key={src.id}
              onClick={() => onSelectSource(src.id)}
              className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-hidden max-w-[64px]"
            >
              <div className="relative w-14 h-14 rounded-full p-0.5 bg-neutral-200 dark:bg-neutral-800 group-hover:ring-2 group-hover:ring-teal-700 transition-all overflow-hidden">
                {src.image_url ? (
                  <img
                    src={src.image_url}
                    alt={src.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-teal-800/10 dark:bg-teal-900/30 flex items-center justify-center text-teal-800 dark:text-teal-300 font-bold text-base">
                    {src.name.slice(0, 1)}
                  </div>
                )}
                {src.highlight_count ? (
                  <span className="absolute -bottom-0.5 -right-0.5 px-1 py-0.2 bg-neutral-800 text-white text-[9px] font-bold rounded-full">
                    +{src.highlight_count}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 truncate w-full text-center">
                {src.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 2. Main Content 2-Column Grid */}
      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full flex gap-8 items-start">
        {/* Left Column: Feed Stream */}
        <div className="flex-1 w-full max-w-3xl space-y-6">
          {/* Onboarding Checklist Box */}
          {showOnboarding && (
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs relative">
              <button
                onClick={handleDismissChecklist}
                className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                title="Dismiss checklist"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
                  Get started with Mnema
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-medium">
                  {completedSteps} of {onboardingSteps.length} completed
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-neutral-600 dark:text-neutral-300">
                {onboardingSteps.map((step) => (
                  <div
                    key={step.id}
                    onClick={step.onClick}
                    className="flex items-center gap-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
                  >
                    {step.done ? (
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-neutral-400 shrink-0" />
                    )}
                    <span className={step.done ? 'line-through text-neutral-400' : ''}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feed Highlights Stream */}
          {filteredHighlights.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No highlights found"
              description="Add highlights with the '+ New' button, import from Kindle, or read articles to save quotes."
              actionLabel="Add Highlight (+)"
              onAction={onOpenCreateNew}
            />
          ) : (
            <div className="space-y-4">
              {filteredHighlights.map((hl) => {
                const src = sources.find((s) => s.id === hl.source_id);
                return (
                  <HighlightCard
                    key={hl.id}
                    highlight={hl}
                    source={src}
                    onSelectSource={onSelectSource}
                    onToggleFavorite={onToggleFavorite}
                    onAskAi={onAskAi}
                    onShare={onShare}
                    onSendEmail={onSendEmailHighlight}
                    onDelete={onDeleteHighlight}
                    onUpdateNote={onUpdateNote}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Sticky Filters Sidebar */}
        <aside className="w-64 hidden xl:block sticky top-6 shrink-0 space-y-6 select-none">
          {/* Sort By */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Sort by</h4>
            <div className="flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs">
              <button
                onClick={() => setSortBy('recent')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                  sortBy === 'recent'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs font-bold'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Recent
              </button>
              <button
                onClick={() => setSortBy('random')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                  sortBy === 'random'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs font-bold'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Random
              </button>
            </div>

            {/* Quick Filters */}
            <div className="space-y-1 pt-1 border-t border-neutral-100 dark:border-neutral-800">
              <label className="flex items-center gap-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterFavorites}
                  onChange={(e) => setFilterFavorites(e.target.checked)}
                  className="rounded text-teal-800 focus:ring-teal-700"
                />
                <span>Favorites Only</span>
              </label>
              <label className="flex items-center gap-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterWithNotes}
                  onChange={(e) => setFilterWithNotes(e.target.checked)}
                  className="rounded text-teal-800 focus:ring-teal-700"
                />
                <span>With Notes Only</span>
              </label>
            </div>
          </div>

          {/* Type Filter */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Type</h4>
            <div className="space-y-1">
              {[
                { id: 'all', label: 'All Sources' },
                { id: 'book', label: 'Books' },
                { id: 'article', label: 'Articles' },
                { id: 'youtube', label: 'YouTube' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilterType(t.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    filterType === t.id
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags Cloud Filter */}
          {allTags.length > 0 && (
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedTag('all')}
                  className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                    selectedTag === 'all'
                      ? 'bg-teal-800 text-white font-bold'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                      selectedTag === tag
                        ? 'bg-teal-800 text-white font-bold'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

