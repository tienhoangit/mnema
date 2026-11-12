import { useState } from 'react';
import { Highlight } from '../types';
import { EmailTarget } from '../components/SendEmailModal';

export type CreateModalTab = 'highlight' | 'book' | 'article';

export function useModalState() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialTab, setCreateInitialTab] = useState<CreateModalTab>('highlight');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [activeShareHighlight, setActiveShareHighlight] = useState<Highlight | null>(null);
  const [activeAskAiHighlight, setActiveAskAiHighlight] = useState<Highlight | null>(null);
  const [activeEmailTarget, setActiveEmailTarget] = useState<EmailTarget | null>(null);

  const openCreateWithTab = (tab: CreateModalTab) => {
    setCreateInitialTab(tab);
    setIsCreateOpen(true);
  };

  const closeCreate = () => setIsCreateOpen(false);
  const openImport = () => setIsImportOpen(true);
  const closeImport = () => setIsImportOpen(false);
  const openExport = () => setIsExportOpen(true);
  const closeExport = () => setIsExportOpen(false);
  const openCommandPalette = () => setIsCommandPaletteOpen(true);
  const closeCommandPalette = () => setIsCommandPaletteOpen(false);
  const toggleCommandPalette = () => setIsCommandPaletteOpen((prev) => !prev);
  const openTools = () => setIsToolsOpen(true);
  const closeTools = () => setIsToolsOpen(false);
  const openShare = (hl: Highlight) => setActiveShareHighlight(hl);
  const closeShare = () => setActiveShareHighlight(null);
  const openAskAi = (hl: Highlight) => setActiveAskAiHighlight(hl);
  const closeAskAi = () => setActiveAskAiHighlight(null);
  const openSendEmail = (target: EmailTarget) => setActiveEmailTarget(target);
  const closeSendEmail = () => setActiveEmailTarget(null);

  return {
    isCreateOpen,
    createInitialTab,
    isImportOpen,
    isExportOpen,
    isCommandPaletteOpen,
    isToolsOpen,
    activeShareHighlight,
    activeAskAiHighlight,
    activeEmailTarget,
    openCreateWithTab,
    closeCreate,
    openImport,
    closeImport,
    openExport,
    closeExport,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    openTools,
    closeTools,
    openShare,
    closeShare,
    openAskAi,
    closeAskAi,
    openSendEmail,
    closeSendEmail,
  };
}

