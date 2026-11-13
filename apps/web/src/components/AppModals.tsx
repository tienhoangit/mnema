import React, { Suspense, lazy } from 'react';
import { Source, Highlight, ReadingStatus, HighlightColor } from '../types';
import { api } from '../services/api';
import type { EmailTarget } from './SendEmailModal';

const CreateNewModal = lazy(() => import('./CreateNewModal').then((m) => ({ default: m.CreateNewModal })));
const KindleImportModal = lazy(() => import('./KindleImportModal').then((m) => ({ default: m.KindleImportModal })));
const ExportModal = lazy(() => import('./ExportModal').then((m) => ({ default: m.ExportModal })));
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));
const ShareQuoteModal = lazy(() => import('./ShareQuoteModal').then((m) => ({ default: m.ShareQuoteModal })));
const AskAiHighlightModal = lazy(() => import('./AskAiHighlightModal').then((m) => ({ default: m.AskAiHighlightModal })));
const LibraryToolsModal = lazy(() => import('./LibraryToolsModal').then((m) => ({ default: m.LibraryToolsModal })));
const SendEmailModal = lazy(() => import('./SendEmailModal').then((m) => ({ default: m.SendEmailModal })));

interface AppModalsProps {
  isCreateModalOpen: boolean;
  createModalInitialTab?: 'highlight' | 'book' | 'article';
  onCloseCreateModal: () => void;
  onSubmitArticle: (data: { url?: string; html?: string; name?: string; reading_status: ReadingStatus }) => Promise<void>;
  onSubmitHighlight: (data: {
    source_id: string;
    content: string;
    note?: string;
    color: HighlightColor;
    location?: string;
    tags?: string[];
  }) => Promise<void>;
  onSubmitBook: (data: {
    name: string;
    author: string;
    image_url?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;

  isImportModalOpen: boolean;
  onCloseImportModal: () => void;
  onImportSuccess: () => void;

  isExportModalOpen: boolean;
  onCloseExportModal: () => void;
  allHighlights: Highlight[];
  sources: Source[];

  isCommandPaletteOpen: boolean;
  onCloseCommandPalette: () => void;
  onSelectSource: (id: string) => void;
  onOpenCreateModal: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
  onOpenReviewTab: () => void;
  onToggleTheme: () => void;

  activeShareHighlight: Highlight | null;
  onCloseShareModal: () => void;

  activeAskAiHighlight: Highlight | null;
  onCloseAskAiHighlight: () => void;

  activeEmailTarget: EmailTarget | null;
  onCloseEmailModal: () => void;

  isToolsModalOpen: boolean;
  onCloseToolsModal: () => void;
  onToolsSuccess: () => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  isCreateModalOpen,
  createModalInitialTab = 'highlight',
  onCloseCreateModal,
  onSubmitArticle,
  onSubmitHighlight,
  onSubmitBook,

  isImportModalOpen,
  onCloseImportModal,
  onImportSuccess,

  isExportModalOpen,
  onCloseExportModal,
  allHighlights,
  sources,

  isCommandPaletteOpen,
  onCloseCommandPalette,
  onSelectSource,
  onOpenCreateModal,
  onOpenImportModal,
  onOpenExportModal,
  onOpenReviewTab,
  onToggleTheme,

  activeShareHighlight,
  onCloseShareModal,

  activeAskAiHighlight,
  onCloseAskAiHighlight,

  activeEmailTarget,
  onCloseEmailModal,

  isToolsModalOpen,
  onCloseToolsModal,
  onToolsSuccess,
}) => {
  return (
    <Suspense fallback={null}>
      {isCreateModalOpen && (
        <CreateNewModal
          isOpen={isCreateModalOpen}
          onClose={onCloseCreateModal}
          sources={sources}
          initialTab={createModalInitialTab}
          onSubmitArticle={onSubmitArticle}
          onSubmitHighlight={onSubmitHighlight}
          onSubmitBook={onSubmitBook}
        />
      )}

      {isImportModalOpen && (
        <KindleImportModal
          isOpen={isImportModalOpen}
          onClose={onCloseImportModal}
          onSuccess={onImportSuccess}
          importKindleFn={api.importKindle}
        />
      )}

      {isExportModalOpen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={onCloseExportModal}
          highlights={allHighlights}
          sources={sources}
        />
      )}

      {isCommandPaletteOpen && (
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={onCloseCommandPalette}
          sources={sources}
          highlights={allHighlights}
          onSelectSource={onSelectSource}
          onOpenAddModal={onOpenCreateModal}
          onOpenImportModal={onOpenImportModal}
          onOpenExportModal={onOpenExportModal}
          onOpenReviewModal={onOpenReviewTab}
          onToggleTheme={onToggleTheme}
        />
      )}

      {Boolean(activeShareHighlight) && (
        <ShareQuoteModal
          isOpen={Boolean(activeShareHighlight)}
          onClose={onCloseShareModal}
          highlight={activeShareHighlight}
        />
      )}

      {Boolean(activeAskAiHighlight) && (
        <AskAiHighlightModal
          isOpen={Boolean(activeAskAiHighlight)}
          onClose={onCloseAskAiHighlight}
          highlight={activeAskAiHighlight}
        />
      )}

      {isToolsModalOpen && (
        <LibraryToolsModal
          isOpen={isToolsModalOpen}
          onClose={onCloseToolsModal}
          onSuccess={onToolsSuccess}
        />
      )}

      {Boolean(activeEmailTarget) && (
        <SendEmailModal
          isOpen={Boolean(activeEmailTarget)}
          onClose={onCloseEmailModal}
          target={activeEmailTarget}
        />
      )}
    </Suspense>
  );
};
