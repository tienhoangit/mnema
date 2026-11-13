import { useEffect, RefObject } from 'react';
import { Highlight, Source } from '../../types';
import { PendingHighlight } from '../../services/offlineDb';

interface UseHighlightMarksOptions {
  contentRef: RefObject<HTMLDivElement | null>;
  source: Source;
  offlineFallbackHtml: string | null;
  localPendingHighlights: PendingHighlight[];
}

export function useHighlightMarks({
  contentRef,
  source,
  offlineFallbackHtml,
  localPendingHighlights,
}: UseHighlightMarksOptions) {
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    container.querySelectorAll('mark[data-mnema-hl]').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });

    const allToRender: Array<Pick<Highlight, 'id' | 'content' | 'color'>> = [
      ...(source.highlights || []).map((h) => ({ id: h.id, content: h.content, color: h.color })),
      ...localPendingHighlights.map((h) => ({ id: h.id, content: h.content, color: h.color })),
    ];

    const colorClassMap: Record<string, string> = {
      yellow: 'bg-yellow-200/70 dark:bg-yellow-500/30 text-inherit rounded px-0.5',
      blue: 'bg-sky-200/70 dark:bg-sky-500/30 text-inherit rounded px-0.5',
      green: 'bg-emerald-200/70 dark:bg-emerald-500/30 text-inherit rounded px-0.5',
      pink: 'bg-pink-200/70 dark:bg-pink-500/30 text-inherit rounded px-0.5',
    };

    for (const hl of allToRender) {
      const snippet = hl.content.trim();
      if (snippet.length < 3) continue;
      const needle = snippet.slice(0, 80);
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (!node.nodeValue || node.parentElement?.closest('mark[data-mnema-hl]')) continue;
        const idx = node.nodeValue.indexOf(needle);
        if (idx >= 0) {
          try {
            const range = document.createRange();
            const end = Math.min(node.nodeValue.length, idx + snippet.length);
            range.setStart(node, idx);
            range.setEnd(node, end);
            const mark = document.createElement('mark');
            mark.setAttribute('data-mnema-hl', hl.id);
            mark.className = colorClassMap[hl.color] || colorClassMap.yellow;
            range.surroundContents(mark);
          } catch {
            // Skip cross-element ranges safely
          }
          break;
        }
      }
    }
  }, [contentRef, source.content_html, offlineFallbackHtml, source.highlights, localPendingHighlights]);
}
