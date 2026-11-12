export interface ExtractedPdfHighlight {
  content: string;
  note?: string;
  location: string;
  color: 'yellow' | 'blue' | 'green' | 'pink';
}

export interface ExtractedPdfResult {
  title: string;
  author?: string;
  content_html: string;
  pages: string[];
  page_count: number;
  file_hash: string;
  highlights: ExtractedPdfHighlight[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mapPdfColor(colorArr?: number[] | Uint8ClampedArray): 'yellow' | 'blue' | 'green' | 'pink' {
  if (!colorArr || colorArr.length < 3) return 'yellow';
  const [r, g, b] = colorArr;
  if (b > r && b > g) return 'blue';
  if (g > r && g >= b) return 'green';
  if (r > g && b > g * 0.8) return 'pink';
  return 'yellow';
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function extractPdfInBrowser(file: File): Promise<ExtractedPdfResult> {
  const buffer = await file.arrayBuffer();
  const file_hash = await computeSha256Hex(buffer);

  // Lazy-load pdfjs-dist only when user actually imports a PDF
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  let title = file.name.replace(/\.pdf$/i, '');
  let author: string | undefined;

  try {
    const meta = await pdf.getMetadata();
    const info = meta?.info as Record<string, unknown> | undefined;
    if (typeof info?.Title === 'string' && info.Title.trim()) {
      title = info.Title.trim();
    }
    if (typeof info?.Author === 'string' && info.Author.trim()) {
      author = info.Author.trim();
    }
  } catch {
    // Metadata is optional
  }

  const pages: string[] = [];
  const pageSections: string[] = [];
  const highlights: ExtractedPdfHighlight[] = [];
  const seenHighlights = new Set<string>();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Reconstruct lines & paragraphs from positioned text items (supports full Unicode / Vietnamese CID fonts)
    const lines: string[] = [];
    let currentLine = '';
    let lastY: number | null = null;

    for (const rawItem of textContent.items) {
      if (!('str' in rawItem)) continue;
      const item = rawItem as {
        str: string;
        hasEOL?: boolean;
        transform?: number[];
        width?: number;
        height?: number;
      };
      const y: number | null = item.transform?.[5] ?? lastY;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        // Larger vertical gap indicates a paragraph break
        if (Math.abs(y - lastY) > 16) {
          lines.push('');
        }
        currentLine = item.str;
      } else {
        if (currentLine && item.str && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
          currentLine += ' ';
        }
        currentLine += item.str;
      }

      if (item.hasEOL) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
        lastY = null;
      } else {
        lastY = y;
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    const pageText = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (pageText) {
      pages.push(pageText);
      const paragraphsHtml = pageText
        .split(/\n{2,}/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para) => `<p>${escapeHtml(para).replace(/\n/g, ' ')}</p>`)
        .join('\n');
      pageSections.push(`<section data-pdf-page="${pageNum}"><h3>Page ${pageNum}</h3>\n${paragraphsHtml}</section>`);
    }

    // Extract PDF Highlight / Underline / Squiggly annotations
    try {
      const annotations = await page.getAnnotations();
      for (const ann of annotations) {
        const subtype = (ann as any).subtype as string | undefined;
        if (subtype !== 'Highlight' && subtype !== 'Underline' && subtype !== 'Squiggly') continue;

        const commentText =
          ((ann as any).contentsObj?.str as string | undefined)?.trim() ||
          ((ann as any).contents as string | undefined)?.trim() ||
          '';

        // Attempt to recover highlighted text overlapping the annotation rect
        let matchedText = '';
        const rect = (ann as any).rect as number[] | undefined;
        if (rect && rect.length === 4) {
          const [rx1, ry1, rx2, ry2] = [
            Math.min(rect[0], rect[2]) - 4,
            Math.min(rect[1], rect[3]) - 4,
            Math.max(rect[0], rect[2]) + 4,
            Math.max(rect[1], rect[3]) + 4,
          ];
          const overlapping: string[] = [];
          for (const rawItem of textContent.items) {
            if (!('str' in rawItem)) continue;
            const item = rawItem as { str: string; transform?: number[]; width?: number; height?: number };
            if (!item.str.trim() || !item.transform) continue;
            const ix = item.transform[4];
            const iy = item.transform[5];
            const iw = item.width || 0;
            if (ix + iw >= rx1 && ix <= rx2 && iy >= ry1 && iy <= ry2) {
              overlapping.push(item.str);
            }
          }
          matchedText = overlapping.join(' ').replace(/\s+/g, ' ').trim();
        }

        const content = matchedText || commentText;
        if (!content || seenHighlights.has(content)) continue;
        seenHighlights.add(content);

        highlights.push({
          content,
          note: matchedText && commentText && commentText !== matchedText ? commentText : undefined,
          location: `Page ${pageNum}`,
          color: mapPdfColor((ann as any).color),
        });
      }
    } catch {
      // Ignore annotation extraction errors on individual pages
    }
  }

  return {
    title,
    author,
    content_html: pageSections.join('\n<hr/>\n'),
    pages,
    page_count: pdf.numPages,
    file_hash,
    highlights,
  };
}
