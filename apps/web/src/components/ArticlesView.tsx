import React, { useEffect, useState } from 'react';
import {
  FileText,
  Youtube,
  Clock,
  Archive,
  Inbox,
  Trash2,
  Plus,
  Search,
  Rss,
  RefreshCw,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { Source, ReadingStatus, RssFeed } from '../types';
import { SourceTypeBadge } from './shared/SourceBadges';
import { EmptyState } from './shared/EmptyState';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../services/api';

interface ArticlesViewProps {
  sources: Source[];
  onSelectArticle: (id: string) => void;
  onUpdateStatus: (id: string, status: ReadingStatus) => void;
  onDeleteArticle: (id: string, name: string) => void;
  onOpenSaveArticle: () => void;
  onRefreshLibrary?: () => void;
  initialCategory?: string;
}

export const ArticlesView: React.FC<ArticlesViewProps> = ({
  sources,
  onSelectArticle,
  onUpdateStatus,
  onDeleteArticle,
  onOpenSaveArticle,
  onRefreshLibrary,
  initialCategory = 'all',
}) => {
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 200);

  // RSS Feed Subscriptions State
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingFeedId, setSyncingFeedId] = useState<string | null>(null);
  const [rssStatusMsg, setRssStatusMsg] = useState<string | null>(null);
  const [rssError, setRssError] = useState<string | null>(null);

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    api
      .getRssFeeds()
      .then((res) => setFeeds(res))
      .catch(() => {});
  }, []);

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedUrl.trim()) return;
    setIsAddingFeed(true);
    setRssError(null);
    setRssStatusMsg(null);
    try {
      const res = await api.addRssFeed(newFeedUrl.trim());
      setFeeds((prev) => [res.feed, ...prev]);
      setNewFeedUrl('');
      setRssStatusMsg(`Subscribed to "${res.feed.title}" (+${res.addedArticles} new articles)!`);
      onRefreshLibrary?.();
    } catch (err) {
      setRssError(err instanceof Error ? err.message : 'Failed to subscribe');
    } finally {
      setIsAddingFeed(false);
    }
  };

  const handleSyncSingleFeed = async (id: string) => {
    setSyncingFeedId(id);
    setRssError(null);
    setRssStatusMsg(null);
    try {
      const res = await api.syncRssFeed(id);
      setRssStatusMsg(`Synced "${res.feedTitle}" (+${res.addedArticles} new articles).`);
      const updated = await api.getRssFeeds();
      setFeeds(updated);
      onRefreshLibrary?.();
    } catch (err) {
      setRssError(err instanceof Error ? err.message : 'Failed to sync feed');
    } finally {
      setSyncingFeedId(null);
    }
  };

  const handleSyncAllFeeds = async () => {
    setIsSyncingAll(true);
    setRssError(null);
    setRssStatusMsg(null);
    try {
      const res = await api.syncAllRssFeeds();
      setRssStatusMsg(
        `Refreshed ${res.feedsSynced} feeds (+${res.addedArticles} new articles).`
      );
      const updated = await api.getRssFeeds();
      setFeeds(updated);
      onRefreshLibrary?.();
    } catch (err) {
      setRssError(err instanceof Error ? err.message : 'Failed to sync feeds');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleDeleteFeed = async (id: string) => {
    try {
      await api.deleteRssFeed(id);
      setFeeds((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setRssError(err instanceof Error ? err.message : 'Failed to delete feed');
    }
  };

  const articleSources = sources.filter(
    (s) => s.type === 'article' || s.type === 'youtube' || s.type === 'pdf'
  );

  const filteredArticles = articleSources.filter((s) => {
    if (activeCategory === 'inbox' && s.reading_status !== 'inbox') return false;
    if (activeCategory === 'later' && s.reading_status !== 'later') return false;
    if (activeCategory === 'archive' && s.reading_status !== 'archive') return false;
    if (activeCategory === 'youtube' && s.type !== 'youtube') return false;
    if (activeCategory === 'pdf' && s.type !== 'pdf') return false;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const matchName = s.name.toLowerCase().includes(q);
      const matchAuthor = s.author?.toLowerCase().includes(q);
      if (!matchName && !matchAuthor) return false;
    }
    return true;
  });

  const categories = [
    { id: 'all', label: 'All Articles', icon: FileText, count: articleSources.length },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: Inbox,
      count: articleSources.filter((s) => s.reading_status === 'inbox').length,
    },
    {
      id: 'later',
      label: 'Read Later',
      icon: Clock,
      count: articleSources.filter((s) => s.reading_status === 'later').length,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: Archive,
      count: articleSources.filter((s) => s.reading_status === 'archive').length,
    },
    {
      id: 'youtube',
      label: 'YouTube Transcripts',
      icon: Youtube,
      count: articleSources.filter((s) => s.type === 'youtube').length,
    },
    {
      id: 'pdf',
      label: 'PDF Documents',
      icon: BookOpen,
      count: articleSources.filter((s) => s.type === 'pdf').length,
    },
    {
      id: 'rss',
      label: 'RSS Subscriptions',
      icon: Rss,
      count: feeds.length,
    },
  ];

  return (
    <div className="flex-1 flex h-[calc(100vh-3.5rem)] overflow-hidden select-none">
      {/* Sub-Sidebar Navigation */}
      <aside className="w-56 border-r border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-4 space-y-4 shrink-0 hidden md:block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Reader Library
          </span>
          <button
            onClick={onOpenSaveArticle}
            className="p-1 rounded-lg text-teal-800 hover:bg-teal-50 dark:hover:bg-neutral-800 transition-colors"
            title="Save new article"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1">
          {categories.map((c) => {
            const Icon = c.icon;
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  active
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{c.label}</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">{c.count}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Stream */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <div className="p-4 border-b border-neutral-200/60 dark:border-neutral-800/60 flex flex-wrap items-center justify-between gap-3">
          {activeCategory === 'rss' ? (
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex items-center gap-2">
                <Rss className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                  RSS & Atom Feed Subscriptions
                </h2>
              </div>
              <button
                onClick={handleSyncAllFeeds}
                disabled={isSyncingAll || feeds.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {isSyncingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Sync All Feeds</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 max-w-sm relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search articles..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white border-transparent focus:border-teal-700 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveCategory('rss')}
                  className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold"
                >
                  <Rss className="w-3.5 h-3.5 text-orange-500" />
                  <span>RSS ({feeds.length})</span>
                </button>
                <button
                  onClick={onOpenSaveArticle}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Article</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        {activeCategory === 'rss' ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-3xl">
            <form onSubmit={handleAddFeed} className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                required
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                placeholder="Paste RSS/Atom feed URL (e.g. https://paulgraham.com/rss.html or Substack /feed)..."
                className="flex-1 min-w-[240px] px-3.5 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <button
                type="submit"
                disabled={isAddingFeed}
                className="px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAddingFeed ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Subscribing...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Feed</span>
                  </>
                )}
              </button>
            </form>

            {rssStatusMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs">
                {rssStatusMsg}
              </div>
            )}
            {rssError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 text-xs">
                {rssError}
              </div>
            )}

            {feeds.length === 0 ? (
              <EmptyState
                icon={Rss}
                title="No RSS subscriptions yet"
                description="Subscribe to your favorite blogs or Substacks to automatically pull new essays into your Articles Inbox."
              />
            ) : (
              <div className="space-y-3">
                {feeds.map((feed) => (
                  <div
                    key={feed.id}
                    className="p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                        {feed.title}
                      </h3>
                      <p className="text-[11px] text-neutral-400 truncate font-mono mt-0.5">
                        {feed.url}
                      </p>
                      {feed.last_fetched_at && (
                        <p className="text-[10px] text-neutral-400 mt-1">
                          Last synced: {new Date(feed.last_fetched_at).toLocaleString()}
                        </p>
                      )}
                      {feed.last_error && (
                        <p className="text-[10px] text-red-500 mt-0.5">{feed.last_error}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleSyncSingleFeed(feed.id)}
                        disabled={syncingFeedId === feed.id}
                        className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                        title="Sync feed now"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${syncingFeedId === feed.id ? 'animate-spin' : ''}`}
                        />
                      </button>
                      <button
                        onClick={() => handleDeleteFeed(feed.id)}
                        className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-red-50 text-neutral-400 hover:text-red-600"
                        title="Unsubscribe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {filteredArticles.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No articles in this section"
                description="Save web articles, newsletters, RSS feeds, PDFs, or paste YouTube links to read with clean typography."
                actionLabel="Save Article (+)"
                onAction={onOpenSaveArticle}
              />
            ) : (
              filteredArticles.map((art) => (
                <div
                  key={art.id}
                  onClick={() => onSelectArticle(art.id)}
                  className="p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-teal-700/60 transition-all cursor-pointer group shadow-2xs flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-400 flex items-center justify-center shrink-0">
                      <SourceTypeBadge type={art.type} showIconOnly={true} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-teal-800 dark:group-hover:text-teal-400 truncate">
                        {art.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-400">
                        <span>{art.author || 'Web Article'}</span>
                        <span>•</span>
                        <span>{art.reading_time || 5} min read</span>
                        <span>•</span>
                        <span className="capitalize">{art.reading_status}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onUpdateStatus(art.id, 'later')}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Read later"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onUpdateStatus(art.id, 'archive')}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${art.name}"?`)) onDeleteArticle(art.id, art.name);
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
