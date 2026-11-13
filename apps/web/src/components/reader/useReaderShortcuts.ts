import { useEffect } from 'react';
import { ReadingStatus } from '../../types';
import { GhostreaderState } from './SelectionToolbar';

interface UseReaderShortcutsOptions {
  isAiOpen: boolean;
  setIsAiOpen: (open: boolean) => void;
  ghostreader: GhostreaderState | null;
  setGhostreader: (state: GhostreaderState | null) => void;
  selectionRange: { x: number; top: number; bottom: number } | null;
  setSelectionRange: (range: { x: number; top: number; bottom: number } | null) => void;
  selectedText: string;
  setSelectedText: (text: string) => void;
  setShowNoteInput: (show: boolean) => void;
  onBack: () => void;
  onUpdateStatus: (status: ReadingStatus) => Promise<void>;
  onSaveHighlight: () => Promise<void>;
}

export function useReaderShortcuts({
  isAiOpen,
  setIsAiOpen,
  ghostreader,
  setGhostreader,
  selectionRange,
  setSelectionRange,
  selectedText,
  setSelectedText,
  setShowNoteInput,
  onBack,
  onUpdateStatus,
  onSaveHighlight,
}: UseReaderShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"], [contenteditable=""]'))
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'escape' && isAiOpen) {
        e.preventDefault();
        setIsAiOpen(false);
        return;
      }

      if (document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0.z-50')) {
        return;
      }

      if (key === 'escape') {
        e.preventDefault();
        if (ghostreader || selectionRange) {
          setGhostreader(null);
          setSelectionRange(null);
          setSelectedText('');
          setShowNoteInput(false);
          window.getSelection()?.removeAllRanges();
        } else {
          onBack();
        }
        return;
      }

      if (key === 'e') {
        e.preventDefault();
        void onUpdateStatus('archive').then(() => onBack());
      } else if (key === 'l') {
        e.preventDefault();
        void onUpdateStatus('later').then(() => onBack());
      } else if (key === 'h') {
        if (selectedText.trim().length > 2) {
          e.preventDefault();
          void onSaveHighlight();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isAiOpen,
    setIsAiOpen,
    ghostreader,
    setGhostreader,
    selectionRange,
    setSelectionRange,
    selectedText,
    setSelectedText,
    setShowNoteInput,
    onBack,
    onUpdateStatus,
    onSaveHighlight,
  ]);
}
