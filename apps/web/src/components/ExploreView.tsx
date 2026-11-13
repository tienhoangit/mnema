import React, { useEffect, useState, useCallback } from 'react';
import {
  Compass,
  Sparkles,
  BookOpen,
  ExternalLink,
  BookmarkPlus,
  Check,
  RefreshCw,
  Loader2,
  Lightbulb,
  AlertCircle,
  Hash,
} from 'lucide-react';
import { ReadingStatus, TopicDiscoveryResult } from '../types';
import { api } from '../services/api';
import { getSafeHttpUrl } from '../utils/url';

const TOPICS_CACHE_KEY = 'mnema_ai_topics_cache';

interface ExploreViewProps {
  onSaveSource: (data: {
    name: string;
    author: string;
    type: 'article' | 'book';
    content_html?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;
  onAddHighlight: (data: {
    content: string;
    author: string;
    sourceName: string;
  }) => Promise<void>;
  onOpenSource?: (sourceId: string) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  onSaveSource,
  onAddHighlight,
  onOpenSource,
}) => {
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});
  const [discovery, setDiscovery] = useState<TopicDiscoveryResult | null>(() => {
    try {
      const cached = sessionStorage.getItem(TOPICS_CACHE_KEY);
      return cached ? (JSON.parse(cached) as TopicDiscoveryResult) : null;
    } catch {
      return null;
    }
  });
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const runDiscovery = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && discovery) return;
    setIsDiscovering(true);
    setDiscoveryError(null);
    try {
      const result = await api.discoverTopics();
      setDiscovery(result);
      try {
        sessionStorage.setItem(TOPICS_CACHE_KEY, JSON.stringify(result));
      } catch {
        // ignore storage quota errors
      }
    } catch (err) {
      setDiscoveryError(
        err instanceof Error ? err.message : 'Unable to generate AI topic clusters right now.'
      );
    } finally {
      setIsDiscovering(false);
    }
  }, [discovery]);

  useEffect(() => {
    if (!discovery) {
      void runDiscovery(true);
    }
  }, []);

  const classics = [
    {
      id: 'pg-makers-schedule',
      title: "Maker's Schedule, Manager's Schedule",
      author: 'Paul Graham',
      readTime: '8 min',
      excerpt:
        'One reason programmers dislike meetings so much is that they’re on a different type of schedule than other people.',
      url: 'https://paulgraham.com/makersschedule.html',
    },
    {
      id: 'kk-1000-true-fans',
      title: '1,000 True Fans',
      author: 'Kevin Kelly',
      readTime: '12 min',
      excerpt:
        'To be a successful creator you don’t need millions. You only need a thousand true fans.',
      url: 'https://kk.org/thetechnium/1000-true-fans/',
    },
    {
      id: 'naval-how-to-get-rich',
      title: 'How to Get Rich (without getting lucky)',
      author: 'Naval Ravikant',
      readTime: '15 min',
      excerpt:
        'Seek wealth, not money or status. Wealth is having assets that earn while you sleep.',
      url: 'https://nav.al/rich',
    },
  ];

  const xPosts = [
    {
      id: 'x-naval-1',
      author: 'Naval Ravikant',
      handle: '@naval',
      text: 'A fit body, a calm mind, a house full of love. These things cannot be bought — they must be earned.',
    },
    {
      id: 'x-james-1',
      author: 'James Clear',
      handle: '@JamesClear',
      text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    },
    {
      id: 'x-munger-1',
      author: 'Charlie Munger',
      handle: '@charlie_wisdom',
      text: 'Spend each day trying to be a little wiser than you were when you woke up.',
    },
  ];

  const handleSaveClassic = async (item: (typeof classics)[0]) => {
    setSavedPosts((prev) => ({ ...prev, [item.id]: true }));
    await onSaveSource({
      name: item.title,
      author: item.author,
      type: 'article',
      content_html: `<p>${item.excerpt}</p>`,
      reading_status: 'later',
    });
  };

  const handleSaveXPost = async (post: (typeof xPosts)[0]) => {
    setSavedPosts((prev) => ({ ...prev, [post.id]: true }));
    await onAddHighlight({
      content: post.text,
      author: post.author,
      sourceName: `Post by ${post.author}`,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-6 max-w-5xl mx-auto space-y-8 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-bold text-xs uppercase tracking-wider mb-1">
            <Compass className="w-4 h-4" />
            <span>Knowledge Graph & Discovery</span>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Explore Forgotten Connections
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            AI-clustered themes synthesized from your own tags and highlights, plus timeless classics.
          </p>
        </div>

        <button
          onClick={() => void runDiscovery(true)}
          disabled={isDiscovering}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-60"
        >
          {isDiscovering ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Clustering...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh AI Themes</span>
            </>
          )}
        </button>
      </div>

      {/* Section 0: AI Topic Discovery */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>AI Topic Clusters</span>
          </h3>
          {discovery && discovery.highlightCount > 0 && (
            <span className="text-[11px] text-neutral-400">
              Synthesized from {discovery.highlightCount} highlights & {discovery.tagCount} tags
            </span>
          )}
        </div>

        {isDiscovering && !discovery && (
          <div className="p-8 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col items-center justify-center text-center gap-2">
            <Loader2 className="w-6 h-6 text-teal-700 animate-spin" />
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Analyzing your highlights and tags to surface hidden connections...
            </p>
          </div>
        )}

        {discoveryError && (
          <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold">AI Topic Discovery unavailable</p>
              <p className="mt-0.5 opacity-90">{discoveryError}</p>
            </div>
          </div>
        )}

        {!isDiscovering && !discoveryError && discovery && discovery.clusters.length === 0 && (
          <div className="p-6 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 text-center space-y-1.5">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              Your Knowledge Graph is waiting
            </p>
            <p className="text-xs text-neutral-500">
              Save a few articles or highlights with tags, then click Refresh AI Themes to uncover cross-source connections.
            </p>
          </div>
        )}

        {discovery && discovery.clusters.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discovery.clusters.map((cluster) => (
              <div
                key={cluster.id}
                className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div>
                    <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                      {cluster.title}
                    </h4>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 leading-relaxed">
                      {cluster.summary}
                    </p>
                  </div>

                  {cluster.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cluster.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 text-[11px] font-medium"
                        >
                          <Hash className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    {cluster.highlights.map((hl) => (
                      <button
                        key={hl.id}
                        type="button"
                        onClick={() => onOpenSource?.(hl.source_id)}
                        className="w-full text-left p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-teal-50/60 dark:hover:bg-teal-950/30 border border-neutral-100 dark:border-neutral-800 transition-colors group"
                      >
                        <p className="text-xs text-neutral-800 dark:text-neutral-200 font-serif italic line-clamp-3">
                          "{hl.content}"
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400 group-hover:text-teal-700 dark:group-hover:text-teal-400">
                          <BookOpen className="w-3 h-3 shrink-0" />
                          <span className="truncate font-medium">
                            {hl.source_name}
                            {hl.source_author ? ` — ${hl.source_author}` : ''}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {cluster.reflectionPrompt && (
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-start gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{cluster.reflectionPrompt}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 1: Start with a Classic */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
          Start with a Classic
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classics.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <p className="text-[11px] font-bold text-teal-800 dark:text-teal-400 uppercase tracking-wide">
                  {item.author} • {item.readTime}
                </p>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white mt-1">
                  {item.title}
                </h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-2 line-clamp-3 italic">
                  "{item.excerpt}"
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                {getSafeHttpUrl(item.url) ? (
                  <a
                    href={getSafeHttpUrl(item.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-neutral-400 hover:text-teal-700 flex items-center gap-1"
                  >
                    <span>Read original</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span />
                )}

                <button
                  onClick={() => handleSaveClassic(item)}
                  disabled={savedPosts[item.id]}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {savedPosts[item.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Lately on X / Thought Leaders */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
          Lately on X (Curated Quotes)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {xPosts.map((post) => (
            <div
              key={post.id}
              className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-xs text-neutral-900 dark:text-white">
                    {post.author}
                  </span>
                  <span className="text-[11px] text-neutral-400">{post.handle}</span>
                </div>
                <p className="text-xs text-neutral-700 dark:text-neutral-200 leading-relaxed font-serif italic">
                  "{post.text}"
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button
                  onClick={() => handleSaveXPost(post)}
                  disabled={savedPosts[post.id]}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-50"
                >
                  {savedPosts[post.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>In Library</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save Quote</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
