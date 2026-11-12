import React from 'react';
import { Source, Highlight, ReadingStatus, HighlightColor } from '../types';
import { CreateNewModal } from './CreateNewModal';
import { KindleImportModal } from './KindleImportModal';
import { ExportModal } from './ExportModal';
import { CommandPalette } from './CommandPalette';
import { ShareQuoteModal } from './ShareQuoteModal';
import { AskAiHighlightModal } from './AskAiHighlightModal';
import { LibraryToolsModal } from './LibraryToolsModal';
import { SendEmailModal, EmailTarget } from './SendEmailModal';
import { api } from '../services/api';

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
    <>
      <CreateNewModal
        isOpen={isCreateModalOpen}
        onClose={onCloseCreateModal}
        sources={sources}
        initialTab={createModalInitialTab}
        onSubmitArticle={onSubmitArticle}
        onSubmitHighlight={onSubmitHighlight}
        onSubmitBook={onSubmitBook}
      />

      <KindleImportModal
        isOpen={isImportModalOpen}
        onClose={onCloseImportModal}
        onSuccess={onImportSuccess}
        importKindleFn={api.importKindle}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={onCloseExportModal}
        highlights={allHighlights}
        sources={sources}
      />

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

      <ShareQuoteModal
        isOpen={Boolean(activeShareHighlight)}
        onClose={onCloseShareModal}
        highlight={activeShareHighlight}
      />

      <AskAiHighlightModal
        isOpen={Boolean(activeAskAiHighlight)}
        onClose={onCloseAskAiHighlight}
        highlight={activeAskAiHighlight}
      />

      <LibraryToolsModal
        isOpen={isToolsModalOpen}
        onClose={onCloseToolsModal}
        onSuccess={onToolsSuccess}
      />

      <SendEmailModal
        isOpen={Boolean(activeEmailTarget)}
        onClose={onCloseEmailModal}
        target={activeEmailTarget}
      />
    </>
  );
};
