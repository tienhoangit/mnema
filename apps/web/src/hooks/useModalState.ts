import { useState, useCallback } from 'react';
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

  const openCreateWithTab = useCallback((tab: CreateModalTab) => {
    setCreateInitialTab(tab);
    setIsCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => setIsCreateOpen(false), []);
  const openImport = useCallback(() => setIsImportOpen(true), []);
  const closeImport = useCallback(() => setIsImportOpen(false), []);
  const openExport = useCallback(() => setIsExportOpen(true), []);
  const closeExport = useCallback(() => setIsExportOpen(false), []);
  const openCommandPalette = useCallback(() => setIsCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setIsCommandPaletteOpen(false), []);
  const toggleCommandPalette = useCallback(() => setIsCommandPaletteOpen((prev) => !prev), []);
  const openTools = useCallback(() => setIsToolsOpen(true), []);
  const closeTools = useCallback(() => setIsToolsOpen(false), []);
  const openShare = useCallback((hl: Highlight) => setActiveShareHighlight(hl), []);
  const closeShare = useCallback(() => setActiveShareHighlight(null), []);
  const openAskAi = useCallback((hl: Highlight) => setActiveAskAiHighlight(hl), []);
  const closeAskAi = useCallback(() => setActiveAskAiHighlight(null), []);
  const openSendEmail = useCallback((target: EmailTarget) => setActiveEmailTarget(target), []);
  const closeSendEmail = useCallback(() => setActiveEmailTarget(null), []);

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

