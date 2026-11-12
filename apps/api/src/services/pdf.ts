function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPdfPagesToHtml(pages: string[], fallbackText?: string): {
  html: string;
  wordCount: number;
  readingTime: number;
} {
  const cleanedPages = pages.map((p) => p.trim()).filter(Boolean);
  let html = '';
  let plainText = '';

  if (cleanedPages.length > 0) {
    html = cleanedPages
      .map((pageText, idx) => {
        const paragraphs = pageText
          .split(/\n{2,}/)
          .map((para) => para.trim())
          .filter(Boolean)
          .map((para) => `<p>${escapeHtml(para).replace(/\n/g, ' ')}</p>`)
          .join('\n');
        return `<section data-pdf-page="${idx + 1}"><h3>Page ${idx + 1}</h3>\n${paragraphs}</section>`;
      })
      .join('\n<hr/>\n');
    plainText = cleanedPages.join(' ');
  } else {
    const text = (fallbackText || '').trim();
    html = text
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, ' ')}</p>`)
      .join('\n');
    plainText = text;
  }

  const words = plainText.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(words / 200));

  return { html, wordCount: words, readingTime };
}
