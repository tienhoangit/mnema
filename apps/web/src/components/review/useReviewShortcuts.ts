import { useEffect } from 'react';
import { Highlight, ReviewAction } from '../../types';

interface UseReviewShortcutsOptions {
  isCompleted: boolean;
  activeQueue: Highlight[];
  currentIndex: number;
  activeTab: 'daily' | 'streaks' | 'custom';
  clozeMode: boolean;
  isRevealed: boolean;
  setIsRevealed: (revealed: boolean) => void;
  handleAction: (action: ReviewAction) => void;
  handleNext: () => void;
  handlePrev: () => void;
  handleUndo: () => void;
  onToggleFavorite?: (hl: Highlight) => void;
}

export function useReviewShortcuts({
  isCompleted,
  activeQueue,
  currentIndex,
  activeTab,
  clozeMode,
  isRevealed,
  setIsRevealed,
  handleAction,
  handleNext,
  handlePrev,
  handleUndo,
  onToggleFavorite,
}: UseReviewShortcutsOptions) {
  useEffect(() => {
    if (isCompleted || activeQueue.length === 0 || activeTab !== 'daily') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      const current = activeQueue[currentIndex];
      if (!current) return;

      if (e.key === ' ') {
        if (clozeMode && !isRevealed) {
          e.preventDefault();
          setIsRevealed(true);
        }
      } else if (e.key === '1') {
        e.preventDefault();
        handleAction('again');
      } else if (e.key === '2') {
        e.preventDefault();
        handleAction('hard');
      } else if (e.key === '3') {
        e.preventDefault();
        handleAction('good');
      } else if (e.key === '4') {
        e.preventDefault();
        handleAction('easy');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleAction('good');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleAction('again');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleAction('discard');
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (onToggleFavorite) onToggleFavorite(current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentIndex,
    isCompleted,
    activeQueue,
    activeTab,
    onToggleFavorite,
    clozeMode,
    isRevealed,
    setIsRevealed,
    handleAction,
    handleNext,
    handlePrev,
    handleUndo,
  ]);
}
