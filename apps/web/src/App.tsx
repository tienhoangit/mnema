import React, { useState, useEffect } from 'react';
import { ReadingStatus, Highlight } from './types';
import { useReaderSettings } from './hooks/useReaderSettings';
import { useLibraryData } from './hooks/useLibraryData';
import { useModalState } from './hooks/useModalState';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { HomeFeedView } from './components/HomeFeedView';
import { DailyReviewView } from './components/DailyReviewView';
import { ArticlesView } from './components/ArticlesView';
import { SourcesView } from './components/SourcesView';
import { SourceView } from './components/SourceView';
import { NotesView } from './components/NotesView';
import { SearchView } from './components/SearchView';
import { TrashView } from './components/TrashView';
import { StatsView } from './components/StatsView';
import { ExploreView } from './components/ExploreView';
import { TagsView } from './components/TagsView';
import { SettingsView } from './components/SettingsView';
import { IntegrationsView } from './components/IntegrationsView';
import { PublicShareView } from './components/PublicShareView';
import { ReaderView } from './components/ReaderView';
import { AppModals } from './components/AppModals';
import { syncPendingHighlights } from './services/offlineDb';

export const App: React.FC = () => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/share/')) {
    const slug = decodeURIComponent(path.slice('/share/'.length).split('/')[0] || '');
    if (slug) {
      return <PublicShareView slug={slug} />;
    }
  }
  return <MainApp />;
};

const MainApp: React.FC = () => {
  const { settings, updateSetting } = useReaderSettings();
  const modals = useModalState();

  // Active navigation & source view selection
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [articlesInitialCategory, setArticlesInitialCategory] = useState<string>('all');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [forceReaderMode, setForceReaderMode] = useState(false);
  const [searchQuery] = useState('');

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

  // Global Command+K shortcut
  useEffect(() => {
    // Sync pending offline highlights on startup (critical for iOS Safari) & on network restore
    syncPendingHighlights().then(({ synced }) => {
      if (synced > 0) invalidateAll();
    });
    const handleOnline = () => {
      syncPendingHighlights().then(({ synced }) => {
        if (synced > 0) invalidateAll();
      });
    };
    window.addEventListener('online', handleOnline);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        modals.toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modals]);

  // Guard Clause: Source Detail View vs Reader View Mode
  if (selectedSourceId && activeSource) {
    const isReadableArticle =
      (activeSource.type === 'article' || activeSource.type === 'pdf') &&
      Boolean(activeSource.content_html && activeSource.content_html.trim().length > 0);

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
        onSelectTab={(tab) => setCurrentTab(tab)}
      />

      {/* 2. Body: Sidebar + Main Stream */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            if (tab !== 'articles') setArticlesInitialCategory('all');
            else setArticlesInitialCategory('all');
            setCurrentTab(tab);
            setSelectedSourceId(null);
            setForceReaderMode(false);
          }}
          reviewCount={reviewQueue.length}
          streakStats={streakStats}
          settings={settings}
          onUpdateSetting={updateSetting}
        />

        {renderMainContent()}
      </div>

      {/* 3. Global Modals Orchestrator */}
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
        onOpenReviewTab={() => setCurrentTab('review')}
        onToggleTheme={() =>
          updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')
        }
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
