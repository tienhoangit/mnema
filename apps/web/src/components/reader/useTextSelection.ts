import React, { useState, useEffect, useRef } from 'react';
import { Source, HighlightColor } from '../../types';
import { GhostreaderState } from './SelectionToolbar';
import { savePendingHighlight } from '../../services/offlineDb';
import { api } from '../../services/api';

interface UseTextSelectionProps {
  source: Source;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onCreateHighlight: (data: {
    content: string;
    note?: string;
    color: HighlightColor;
    location?: string;
  }) => Promise<void>;
  setLocalPendingHighlights: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useTextSelection({
  source,
  contentRef,
  onCreateHighlight,
  setLocalPendingHighlights,
}: UseTextSelectionProps) {
  const [selectedText, setSelectedText] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);
  const [selectionRange, setSelectionRange] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');
  const [highlightNote, setHighlightNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isSavingHighlight, setIsSavingHighlight] = useState(false);
  const selectionPopoverRef = useRef<HTMLDivElement>(null);

  const [ghostreader, setGhostreader] = useState<GhostreaderState | null>(null);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const checkSelection = (target?: EventTarget | null) => {
      if (target && selectionPopoverRef.current?.contains(target as Node)) {
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!showNoteInput && !ghostreader) {
          setSelectionRange(null);
          setSelectedText('');
          setSelectedLocation(undefined);
        }
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 2) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;

          let locStr: string | undefined = undefined;
          if (contentRef.current) {
            const contentRect = contentRef.current.getBoundingClientRect();
            const scrollPos = window.scrollY || document.documentElement.scrollTop;
            const elemTop = contentRect.top + scrollPos;
            const currentPos = rect.top + scrollPos - elemTop;
            const totalHeight = contentRect.height;
            if (totalHeight > 0) {
              const pct = Math.max(0, Math.min(100, Math.round((currentPos / totalHeight) * 100)));
              locStr = `${pct}%`;
            }
          }

          // Dynamic toolbar clamping for narrow viewports (< 380px down to 360px)
          const viewportWidth = window.innerWidth;
          const popoverHalfWidth = Math.min(170, Math.max(120, (viewportWidth - 32) / 2));
          const minX = popoverHalfWidth + 16;
          const maxX = Math.max(minX, viewportWidth - popoverHalfWidth - 16);
          const rawCenterX = rect.left + rect.width / 2;
          const clampedX = Math.min(maxX, Math.max(minX, rawCenterX));

          setSelectedText(text);
          setSelectedLocation(locStr);
          setSelectionRange({
            x: clampedX,
            top: rect.top,
            bottom: rect.bottom,
          });
        } catch {
          // Ignore invalid selection ranges during DOM transitions
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      checkSelection(e.target);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        checkSelection(e.target);
      }, 50);
    };

    const handleSelectionChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        checkSelection();
      }, 150);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [showNoteInput, ghostreader, contentRef]);

  const handleRunGhostreader = async (action: 'explain' | 'translate') => {
    const text = selectedText.trim();
    if (!text) return;
    setGhostreader({ action, text, loading: true, result: '' });

    try {
      const articleText = contentRef.current?.innerText || '';
      const idx = articleText.indexOf(text.slice(0, 40));
      const contextSnippet =
        idx >= 0
          ? articleText.slice(Math.max(0, idx - 300), Math.min(articleText.length, idx + text.length + 300))
          : articleText.slice(0, 800);

      const res = await api.inlineAiAction({
        action,
        text,
        context: contextSnippet,
      });
      setGhostreader({ action, text, result: res.result, loading: false });
    } catch (err) {
      setGhostreader({
        action,
        text,
        result: '',
        error: err instanceof Error ? err.message : 'Ghostreader request failed',
        loading: false,
      });
    }
  };

  const handleSaveGhostreaderAsNote = async () => {
    if (!ghostreader?.result || isSavingHighlight) return;
    setIsSavingHighlight(true);
    const prefix = ghostreader.action === 'translate' ? '[Translation]' : '[AI Explanation]';
    const noteContent = `${prefix} ${ghostreader.result}`;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const item = await savePendingHighlight({
          source_id: source.id,
          content: ghostreader.text,
          note: noteContent,
          color: highlightColor,
        });
        setLocalPendingHighlights((prev) => [...prev, item]);
      } else {
        await onCreateHighlight({
          content: ghostreader.text,
          note: noteContent,
          color: highlightColor,
        });
      }
      setGhostreader((prev) => (prev ? { ...prev, saved: true } : null));
    } catch {
      const item = await savePendingHighlight({
        source_id: source.id,
        content: ghostreader.text,
        note: noteContent,
        color: highlightColor,
      });
      setLocalPendingHighlights((prev) => [...prev, item]);
      setGhostreader((prev) => (prev ? { ...prev, saved: true } : null));
    } finally {
      setIsSavingHighlight(false);
    }
  };

  const handleSaveHighlight = async () => {
    if (!selectedText.trim() || isSavingHighlight) return;
    setIsSavingHighlight(true);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const item = await savePendingHighlight({
          source_id: source.id,
          content: selectedText.trim(),
          note: highlightNote.trim() || undefined,
          color: highlightColor,
          location: selectedLocation,
        });
        setLocalPendingHighlights((prev) => [...prev, item]);
      } else {
        await onCreateHighlight({
          content: selectedText.trim(),
          note: highlightNote.trim() || undefined,
          color: highlightColor,
          location: selectedLocation,
        });
      }

      window.getSelection()?.removeAllRanges();
      setSelectionRange(null);
      setSelectedText('');
      setSelectedLocation(undefined);
      setHighlightNote('');
      setShowNoteInput(false);
    } catch (err) {
      console.warn('Highlight creation failed, saving offline fallback:', err);
      const item = await savePendingHighlight({
        source_id: source.id,
        content: selectedText.trim(),
        note: highlightNote.trim() || undefined,
        color: highlightColor,
        location: selectedLocation,
      });
      setLocalPendingHighlights((prev) => [...prev, item]);
      window.getSelection()?.removeAllRanges();
      setSelectionRange(null);
      setSelectedText('');
      setSelectedLocation(undefined);
      setHighlightNote('');
      setShowNoteInput(false);
    } finally {
      setIsSavingHighlight(false);
    }
  };

  return {
    selectedText,
    setSelectedText,
    selectedLocation,
    setSelectedLocation,
    selectionRange,
    setSelectionRange,
    highlightColor,
    setHighlightColor,
    highlightNote,
    setHighlightNote,
    showNoteInput,
    setShowNoteInput,
    isSavingHighlight,
    selectionPopoverRef,
    ghostreader,
    setGhostreader,
    handleRunGhostreader,
    handleSaveGhostreaderAsNote,
    handleSaveHighlight,
  };
}
