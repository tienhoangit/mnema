import { attachTagsToHighlight } from '../../core/helpers';

export interface JsonImportResult {
  success: true;
  totalImported: number;
  sourcesCreated: number;
  message: string;
}

export async function importJsonBatch(
  db: D1Database,
  body: any
): Promise<JsonImportResult> {
  const rawList: any[] = Array.isArray(body)
    ? body
    : Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.sources)
    ? body.sources
    : Array.isArray(body.highlights)
    ? body.highlights
    : [body];

  if (rawList.length === 0 || !rawList[0]) {
    throw new Error('No items provided for import');
  }

  let totalImported = 0;
  let sourcesCreated = 0;
  const now = new Date().toISOString();

  for (const item of rawList) {
    if (!item) continue;
    const title = (item.title || item.name || item.bookTitle || 'Imported Source').trim();
    const author = (item.author || item.byline || null)?.trim() || null;
    const type =
      item.type ||
      (item.bookTitle
        ? 'book'
        : item.url?.includes('x.com') || item.url?.includes('twitter.com')
        ? 'tweet'
        : 'article');
    const rawUrl = item.url?.trim() || null;
    const isGenericKindleUrl = rawUrl?.includes('read.amazon.com/notebook') ?? false;
    const url = type === 'book' && isGenericKindleUrl ? null : rawUrl;
    const imageUrl = item.image_url || item.imageUrl || null;

    // Check if source already exists: for books match name+type first, otherwise url first
    let sourceId: string | null = null;
    if (type === 'book') {
      const existing = await db
        .prepare('SELECT id FROM sources WHERE name = ? AND type = ? AND deleted = 0 LIMIT 1')
        .bind(title, type)
        .first<{ id: string }>();
      if (existing) sourceId = existing.id;
    }

    if (!sourceId && url) {
      const existing = await db
        .prepare('SELECT id FROM sources WHERE url = ? AND deleted = 0 LIMIT 1')
        .bind(url)
        .first<{ id: string }>();
      if (existing) sourceId = existing.id;
    }

    if (!sourceId) {
      const existing = await db
        .prepare('SELECT id FROM sources WHERE name = ? AND type = ? AND deleted = 0 LIMIT 1')
        .bind(title, type)
        .first<{ id: string }>();
      if (existing) sourceId = existing.id;
    }

    const statements: D1PreparedStatement[] = [];
    const pendingTags: Array<{ hlId: string; tags: string[] }> = [];
    const existingSet = new Set<string>();

    if (sourceId) {
      const { results: existingRows } = await db
        .prepare('SELECT content FROM highlights WHERE source_id = ? AND deleted = 0')
        .bind(sourceId)
        .all<{ content: string }>();
      for (const r of existingRows) existingSet.add(r.content);
    } else {
      sourceId = crypto.randomUUID();
      statements.push(
        db.prepare(`
          INSERT INTO sources (id, name, author, type, url, image_url, reading_status, word_count, reading_time, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'inbox', 0, 1, ?, ?)
        `).bind(sourceId, title, author, type, url, imageUrl, now, now)
      );
      sourcesCreated++;
    }

    // Process highlights if nested or single
    const itemHighlights: any[] = Array.isArray(item.highlights)
      ? item.highlights
      : item.content || item.text
      ? [{ content: item.content || item.text, note: item.note, location: item.location, color: item.color, tags: item.tags }]
      : [];

    for (const hl of itemHighlights) {
      const content = (hl.content || hl.text || '').trim();
      if (!content || existingSet.has(content)) continue;
      existingSet.add(content);

      const hlId = crypto.randomUUID();
      statements.push(
        db.prepare(`
          INSERT INTO highlights (id, source_id, content, note, color, location, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          hlId,
          sourceId,
          content,
          hl.note?.trim() || null,
          hl.color || 'yellow',
          hl.location || null,
          now,
          now
        )
      );

      if (Array.isArray(hl.tags) && hl.tags.length > 0) {
        pendingTags.push({ hlId, tags: hl.tags });
      }

      totalImported++;
    }

    for (let i = 0; i < statements.length; i += 50) {
      await db.batch(statements.slice(i, i + 50));
    }
    for (const t of pendingTags) {
      await attachTagsToHighlight(db, t.hlId, t.tags);
    }
  }

  return {
    success: true,
    totalImported,
    sourcesCreated,
    message: `Imported ${totalImported} highlights across ${sourcesCreated} new sources`,
  };
}
