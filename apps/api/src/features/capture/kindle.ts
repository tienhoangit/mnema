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

export async function importKindleClippings(
  db: D1Database,
  clippingsText: string
): Promise<{ booksProcessed: number; booksCreated: number; highlightsImported: number }> {
  const parsed = parseMyClippings(clippingsText);
  if (parsed.length === 0) {
    throw new Error('No valid highlights found in clippings file');
  }

  const booksMap = new Map<string, typeof parsed>();
  for (const item of parsed) {
    const list = booksMap.get(item.bookTitle) || [];
    list.push(item);
    booksMap.set(item.bookTitle, list);
  }

  let totalImported = 0;
  let booksCreated = 0;
  const statements: D1PreparedStatement[] = [];

  for (const [title, highlights] of booksMap.entries()) {
    const existingBook = await db
      .prepare(`SELECT id FROM sources WHERE name = ? AND type = 'book' AND deleted = 0`)
      .bind(title)
      .first<{ id: string }>();

    let sourceId = existingBook?.id;
    const now = new Date().toISOString();
    if (!sourceId) {
      sourceId = crypto.randomUUID();
      const author = highlights[0]?.author || null;

      statements.push(
        db.prepare(
          `INSERT INTO sources (id, name, author, type, reading_status, created_at, updated_at)
           VALUES (?, ?, ?, 'book', 'archive', ?, ?)`
        ).bind(sourceId, title, author, now, now)
      );
      booksCreated++;
    }

    const existingSet = new Set<string>();
    if (existingBook) {
      const { results: existingRows } = await db
        .prepare(`SELECT content FROM highlights WHERE source_id = ? AND deleted = 0`)
        .bind(sourceId)
        .all<{ content: string }>();
      for (const r of existingRows) existingSet.add(r.content);
    }

    for (const hl of highlights) {
      if (existingSet.has(hl.content)) continue;
      existingSet.add(hl.content);
      const hlId = crypto.randomUUID();
      statements.push(
        db.prepare(
          `INSERT INTO highlights (id, source_id, content, location, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(hlId, sourceId, hl.content, hl.location, now, now)
      );
      totalImported++;
    }
  }

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }

  return {
    booksProcessed: booksMap.size,
    booksCreated,
    highlightsImported: totalImported,
  };
}
