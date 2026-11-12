export interface ParsedClipping {
  bookTitle: string;
  author: string | null;
  location: string | null;
  addedAt: string | null;
  content: string;
}

export function parseMyClippings(clippingsText: string): ParsedClipping[] {
  // Clippings are separated by '=========='
  const entries = clippingsText.split(/={10,}/g);
  const results: ParsedClipping[] = [];

  for (const entry of entries) {
    const lines = entry
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) continue;

    // Line 1: Title (Author)
    const titleLine = lines[0];
    let bookTitle = titleLine;
    let author: string | null = null;

    const authorMatch = titleLine.match(/\(([^()]+)\)$/);
    if (authorMatch) {
      author = authorMatch[1].trim();
      bookTitle = titleLine.slice(0, authorMatch.index).trim();
    }

    // Line 2: - Your Highlight on page 10 | Location 123-125 | Added on Monday, January 1, 2024
    const metaLine = lines[1];
    let location: string | null = null;
    let addedAt: string | null = null;

    const locMatch = metaLine.match(/Location\s+([0-9-]+)/i) || metaLine.match(/page\s+([0-9-]+)/i);
    if (locMatch) {
      location = locMatch[1];
    }

    const dateMatch = metaLine.match(/Added on\s+(.+)$/i);
    if (dateMatch) {
      addedAt = dateMatch[1];
    }

    // Lines 3+: Highlight Content
    const content = lines.slice(2).join('\n').trim();

    if (content && !metaLine.includes('Bookmark')) {
      results.push({
        bookTitle: bookTitle || 'Untitled Book',
        author,
        location,
        addedAt,
        content,
      });
    }
  }

  return results;
}
