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
    const handleSelection = (e: MouseEvent) => {
      if (selectionPopoverRef.current?.contains(e.target as Node)) {
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
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

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

        setSelectedText(text);
        setSelectedLocation(locStr);
        setSelectionRange({
          x: Math.min(window.innerWidth - 190, Math.max(190, rect.left + rect.width / 2)),
          top: rect.top,
          bottom: rect.bottom,
        });
      }
    };

    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
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
