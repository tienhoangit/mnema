import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ReadingStatus, Highlight } from './types';
import { useReaderSettings } from './hooks/useReaderSettings';
import { useLibraryData } from './hooks/useLibraryData';
import { useModalState } from './hooks/useModalState';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/navigation/BottomNav';
import { MobileDrawer } from './components/navigation/MobileDrawer';
import { AppModals } from './components/AppModals';
import { syncPendingHighlights } from './services/offlineDb';

const HomeFeedView = lazy(() => import('./components/HomeFeedView').then((m) => ({ default: m.HomeFeedView })));
const DailyReviewView = lazy(() => import('./components/DailyReviewView').then((m) => ({ default: m.DailyReviewView })));
const ArticlesView = lazy(() => import('./components/ArticlesView').then((m) => ({ default: m.ArticlesView })));
const SourcesView = lazy(() => import('./components/SourcesView').then((m) => ({ default: m.SourcesView })));
const SourceView = lazy(() => import('./components/SourceView').then((m) => ({ default: m.SourceView })));
const NotesView = lazy(() => import('./components/NotesView').then((m) => ({ default: m.NotesView })));
const SearchView = lazy(() => import('./components/SearchView').then((m) => ({ default: m.SearchView })));
const TrashView = lazy(() => import('./components/TrashView').then((m) => ({ default: m.TrashView })));
const StatsView = lazy(() => import('./components/StatsView').then((m) => ({ default: m.StatsView })));
const ExploreView = lazy(() => import('./components/ExploreView').then((m) => ({ default: m.ExploreView })));
const TagsView = lazy(() => import('./components/TagsView').then((m) => ({ default: m.TagsView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
const IntegrationsView = lazy(() => import('./components/IntegrationsView').then((m) => ({ default: m.IntegrationsView })));
const PublicShareView = lazy(() => import('./components/PublicShareView').then((m) => ({ default: m.PublicShareView })));
const ReaderView = lazy(() => import('./components/ReaderView').then((m) => ({ default: m.ReaderView })));

export const App: React.FC = () => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/share/')) {
    const slug = decodeURIComponent(path.slice('/share/'.length).split('/')[0] || '');
    if (slug) {
      return (
        <Suspense fallback={<div className="min-h-screen bg-[#faf9f5] dark:bg-[#121214] flex items-center justify-center text-neutral-400">Loading shared note...</div>}>
          <PublicShareView slug={slug} />
        </Suspense>
      );
    }
  }
  return <MainApp />;
};

const MainApp: React.FC = () => {
  const { settings, updateSetting } = useReaderSettings();
  const modals = useModalState();

  // Active navigation & source view selection
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [articlesInitialCategory, setArticlesInitialCategory] = useState<string>('all');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [forceReaderMode, setForceReaderMode] = useState(false);
  const [searchQuery] = useState('');

  const theme: 'light' | 'dark' = settings.theme === 'dark' ? 'dark' : 'light';

  const toggleTheme = () => {
    updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark');
  };

  const handleSelectTab = (tab: string) => {
    if (tab !== 'articles') setArticlesInitialCategory('all');
    else setArticlesInitialCategory('all');
    setCurrentTab(tab);
    setSelectedSourceId(null);
    setForceReaderMode(false);
  };

  // Core data hooks & mutations
  const {
    sources,
    highlights,
    allHighlights,
    tags,
    reviewQueue,
    streakStats,
    fullStats,
    activeSource,
    refetchReviews,
    refetchStreak,
    refetchFullStats,
    invalidateAll,
    createSource,
    updateSource,
    deleteSource,
    createHighlight,
    updateHighlight,
    deleteHighlight,
    submitReviewAction,
    undoReviewAction,
  } = useLibraryData({ currentTab, searchQuery, selectedSourceId });

  // Session expired banner state (Cloudflare Access 302 / HTML redirect detection)
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => setSessionExpired(true);
    window.addEventListener('mnema:session-expired', onExpired);
    return () => window.removeEventListener('mnema:session-expired', onExpired);
  }, []);

  // Sync pending offline highlights on startup (critical for iOS Safari) & on network restore
  useEffect(() => {
    const runSync = () => {
      syncPendingHighlights().then(({ synced }) => {
        if (synced > 0) invalidateAll();
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runSync();
    };
    runSync();
    window.addEventListener('online', runSync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', runSync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Global Command+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        modals.toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modals.toggleCommandPalette]);

  // Guard Clause: Source Detail View vs Reader View Mode
  if (selectedSourceId && activeSource) {
    const isReadableArticle =
      activeSource.type === 'youtube' ||
      activeSource.type === 'epub' ||
      ((activeSource.type === 'article' || activeSource.type === 'pdf') &&
        Boolean(activeSource.content_html && activeSource.content_html.trim().length > 0));

    // If opened from Articles tab or user explicitly clicked "Read Full Article", show ReaderView
    if (isReadableArticle && (currentTab === 'articles' || forceReaderMode)) {
      return (
        <ReaderView
          source={activeSource}
          onBack={() => {
            setSelectedSourceId(null);
            setForceReaderMode(false);
          }}
          onUpdateStatus={async (status: ReadingStatus) => {
            updateSource({ id: activeSource.id, updates: { reading_status: status } });
          }}
          onDelete={async () => {
            if (confirm('Delete this article?')) {
              await deleteSource(activeSource.id);
              setSelectedSourceId(null);
              setForceReaderMode(false);
            }
          }}
          onCreateHighlight={async (data) => {
            await createHighlight({
              source_id: activeSource.id,
              content: data.content,
              note: data.note,
              color: data.color,
              location: data.location,
            });
          }}
          onUpdateSourceNotes={(notes) => {
            updateSource({ id: activeSource.id, updates: { source_notes: notes } });
          }}
          settings={settings}
          onUpdateSetting={updateSetting}
        />
      );
    }

    // Default for books, sources list clicks, or non-article content: SourceView
    return (
      <SourceView
        source={activeSource}
        onBack={() => {
          setSelectedSourceId(null);
          setForceReaderMode(false);
        }}
        onUpdateSource={(updates) => {
          updateSource({ id: activeSource.id, updates });
        }}
        onDeleteSource={async () => {
          await deleteSource(activeSource.id);
          setSelectedSourceId(null);
        }}
        onCreateHighlight={async (data) => {
          await createHighlight({
            source_id: activeSource.id,
            content: data.content,
            note: data.note,
            color: data.color,
            location: data.location,
          });
        }}
        onUpdateHighlight={(id, updates) => {
          updateHighlight({ id, updates });
        }}
        onDeleteHighlight={(id) => {
          deleteHighlight(id);
        }}
        onOpenReader={
          isReadableArticle
            ? () => {
                setForceReaderMode(true);
              }
            : undefined
        }
        onAskAi={(hl) => modals.openAskAi(hl)}
        onShare={(hl) => modals.openShare(hl)}
        onSendEmailSource={(src) => modals.openSendEmail({ type: 'source', source: src })}
        onSendEmailHighlight={(hl) => modals.openSendEmail({ type: 'highlight', highlight: hl })}
      />
    );
  }

  // Render main view based on active tab
  const renderMainContent = () => {
    switch (currentTab) {
      case 'home':
        return (
          <HomeFeedView
            highlights={allHighlights}
            sources={sources}
            streakStats={streakStats}
            onSelectSource={(id) => setSelectedSourceId(id)}
            onStartReview={() => setCurrentTab('review')}
            onSelectTab={(tab) => setCurrentTab(tab)}
            onToggleFavorite={(hl) =>
              updateHighlight({ id: hl.id, updates: { favorite: !hl.favorite } })
            }
            onAskAi={(hl) => modals.openAskAi(hl)}
            onShare={(hl) => modals.openShare(hl)}
            onSendEmailHighlight={(hl) => modals.openSendEmail({ type: 'highlight', highlight: hl })}
            onDeleteHighlight={(id) => deleteHighlight(id)}
            onUpdateNote={(id, note) => updateHighlight({ id, updates: { note } })}
            onOpenCreateNew={() => modals.openCreateWithTab('highlight')}
          />
        );

      case 'review':
        return (
          <DailyReviewView
            highlights={reviewQueue}
            streakStats={streakStats}
            sources={sources}
            tags={tags}
            onAction={async (id, action) => {
              await submitReviewAction({ id, action });
            }}
            onUndo={async () => {
              await undoReviewAction();
            }}
            onToggleFavorite={(hl) =>
              updateHighlight({ id: hl.id, updates: { favorite: !hl.favorite } })
            }
            onClose={() => setCurrentTab('home')}
            onRefresh={() => {
              refetchReviews();
              refetchStreak();
            }}
          />
        );

      case 'articles':
        return (
          <ArticlesView
            sources={sources}
            onSelectArticle={(id) => {
              setSelectedSourceId(id);
              setForceReaderMode(true);
            }}
            onUpdateStatus={(id, status) =>
              updateSource({ id, updates: { reading_status: status } })
            }
            onToggleFavorite={(id, favorite) =>
              updateSource({ id, updates: { favorite } as any })
            }
            onDeleteArticle={async (id) => {
              await deleteSource(id);
            }}
            onOpenSaveArticle={() => modals.openCreateWithTab('article')}
            onRefreshLibrary={() => invalidateAll()}
            initialCategory={articlesInitialCategory}
          />
        );

      case 'sources':
        return (
          <SourcesView
            sources={sources}
            onSelectSource={(id) => {
              setSelectedSourceId(id);
              setForceReaderMode(false);
            }}
            onUpdateStatus={(id, status) =>
              updateSource({ id, updates: { reading_status: status } })
            }
            onDeleteSource={async (id, name) => {
              if (confirm(`Delete "${name}" and all its highlights?`)) {
                await deleteSource(id);
              }
            }}
          />
        );

      case 'notes':
        return (
          <NotesView
            highlights={allHighlights}
            sources={sources}
            onSelectSource={(sourceId) => {
              setSelectedSourceId(sourceId);
              setForceReaderMode(false);
            }}
            onUpdateHighlightNote={(id, note) => {
              updateHighlight({ id, updates: { note } });
            }}
            onDeleteHighlight={(id) => {
              deleteHighlight(id);
            }}
            onAskAi={(hl) => modals.openAskAi(hl)}
            onShare={(hl) => modals.openShare(hl)}
            onSendEmailHighlight={(hl) => modals.openSendEmail({ type: 'highlight', highlight: hl })}
          />
        );

      case 'search':
        return (
          <SearchView
            onSelectSource={(sourceId) => {
              setSelectedSourceId(sourceId);
              setForceReaderMode(false);
            }}
            onSelectHighlight={(hl) => {
              setSelectedSourceId(hl.source_id);
              setForceReaderMode(false);
            }}
            onAskAiHighlight={(hl) => modals.openAskAi(hl)}
            onShareHighlight={(hl) => modals.openShare(hl)}
          />
        );

      case 'tags':
        return (
          <TagsView
            highlights={allHighlights}
            onSelectTag={() => {
              setCurrentTab('home');
            }}
          />
        );

      case 'stats':
        return <StatsView stats={fullStats} />;

      case 'explore':
        return (
          <ExploreView
            onSaveSource={async (data) => {
              await createSource({
                name: data.name,
                author: data.author,
                type: data.type,
                html: data.content_html,
                reading_status: data.reading_status,
              });
            }}
            onAddHighlight={async (data) => {
              const src = await createSource({
                name: data.sourceName,
                author: data.author,
                type: 'article',
                reading_status: 'read',
              });
              if (src?.id) {
                await createHighlight({
                  source_id: src.id,
                  content: data.content,
                  color: 'yellow',
                });
              }
            }}
            onOpenSource={(sourceId) => {
              setSelectedSourceId(sourceId);
              setForceReaderMode(false);
            }}
          />
        );

      case 'trash':
        return (
          <TrashView
            onBack={() => setCurrentTab('settings')}
            onRefreshLibrary={() => invalidateAll()}
          />
        );

      case 'integrations':
        return (
          <IntegrationsView
            onOpenArticlesRss={() => {
              setArticlesInitialCategory('rss');
              setCurrentTab('articles');
            }}
            onRefreshLibrary={() => invalidateAll()}
          />
        );

      case 'settings':
        return (
          <SettingsView
            onOpenToolsModal={() => modals.openTools()}
            onOpenExportModal={() => modals.openExport()}
            onOpenImportModal={() => modals.openImport()}
            onOpenTrash={() => setCurrentTab('trash')}
            onOpenIntegrations={() => setCurrentTab('integrations')}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#faf9f5] dark:bg-[#121214] text-neutral-800 dark:text-neutral-100 overflow-hidden font-sans">
      {/* 1. Top Header */}
      <Header
        onOpenCommandPalette={() => modals.openCommandPalette()}
        onOpenCreateHighlight={() => modals.openCreateWithTab('highlight')}
        onOpenAddBook={() => modals.openCreateWithTab('book')}
        onOpenSaveArticle={() => modals.openCreateWithTab('article')}
        onOpenImport={() => modals.openImport()}
        streakStats={streakStats}
        onSelectTab={handleSelectTab}
      />

      {sessionExpired && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 z-50">
          <span>
            Your Cloudflare Access session has expired. Offline cache fallback is paused to prevent stale reads.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 rounded-lg bg-white text-amber-800 font-semibold hover:bg-amber-50 shrink-0"
          >
            Re-authenticate
          </button>
        </div>
      )}

      {/* 2. Body: Sidebar + Main Stream */}
      <div className="flex-1 flex overflow-hidden pb-16 md:pb-0">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          reviewCount={reviewQueue.length}
          streakStats={streakStats}
          settings={settings}
          onUpdateSetting={updateSetting}
        />

        <Suspense fallback={<div className="flex-1 flex items-center justify-center p-8 text-neutral-400">Loading view...</div>}>
          {renderMainContent()}
        </Suspense>
      </div>

      {/* 3. Mobile Navigation Shell */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenDrawer={() => setIsMobileDrawerOpen(true)}
        reviewCount={reviewQueue.length}
      />

      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        currentTab={currentTab}
        onSelectTab={(tab) => {
          handleSelectTab(tab);
          setIsMobileDrawerOpen(false);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 4. Global Modals Orchestrator */}
      <AppModals
        isCreateModalOpen={modals.isCreateOpen}
        createModalInitialTab={modals.createInitialTab}
        onCloseCreateModal={modals.closeCreate}
        onSubmitArticle={async (data) => {
          const newSource = await createSource({ ...data, type: 'article' });
          if (newSource?.id) {
            setSelectedSourceId(newSource.id);
            setForceReaderMode(true);
          }
        }}
        onSubmitHighlight={async (data) => {
          await createHighlight(data);
        }}
        onSubmitBook={async (data) => {
          await createSource({
            name: data.name,
            author: data.author,
            image_url: data.image_url,
            reading_status: data.reading_status,
            type: 'book',
          });
        }}
        isImportModalOpen={modals.isImportOpen}
        onCloseImportModal={modals.closeImport}
        onImportSuccess={() => {
          refetchReviews();
          refetchStreak();
          invalidateAll();
        }}
        isExportModalOpen={modals.isExportOpen}
        onCloseExportModal={modals.closeExport}
        allHighlights={allHighlights}
        sources={sources}
        isCommandPaletteOpen={modals.isCommandPaletteOpen}
        onCloseCommandPalette={modals.closeCommandPalette}
        onSelectSource={(id) => {
          setSelectedSourceId(id);
          setForceReaderMode(false);
          modals.closeCommandPalette();
        }}
        onOpenCreateModal={() => modals.openCreateWithTab('highlight')}
        onOpenImportModal={() => modals.openImport()}
        onOpenExportModal={() => modals.openExport()}
        onOpenReviewTab={() => handleSelectTab('review')}
        onToggleTheme={toggleTheme}
        activeShareHighlight={modals.activeShareHighlight}
        onCloseShareModal={modals.closeShare}
        activeAskAiHighlight={modals.activeAskAiHighlight}
        onCloseAskAiHighlight={modals.closeAskAi}
        activeEmailTarget={modals.activeEmailTarget}
        onCloseEmailModal={modals.closeSendEmail}
        isToolsModalOpen={modals.isToolsOpen}
        onCloseToolsModal={modals.closeTools}
        onToolsSuccess={() => {
          invalidateAll();
          refetchFullStats();
        }}
      />
    </div>
  );
};
