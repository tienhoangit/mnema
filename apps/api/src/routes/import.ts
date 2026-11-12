import { Hono } from 'hono';
import { Bindings, SourceRow } from '../types';
import { parseMyClippings } from '../services/kindle';
import { CsvImportFormat, parseImportCsv } from '../services/importers';
import { formatPdfPagesToHtml } from '../services/pdf';
import { indexHighlightVector } from '../services/semantic';

const app = new Hono<{ Bindings: Bindings }>();

async function attachTagsToHighlight(
  db: D1Database,
  highlightId: string,
  tags: string[]
): Promise<void> {
  for (const rawTag of tags) {
    const cleanName = rawTag.trim().toLowerCase();
    if (!cleanName) continue;

    const existingTag = await db
      .prepare(`SELECT id FROM tags WHERE name = ?`)
      .bind(cleanName)
      .first<{ id: string }>();

    let tagId = existingTag?.id;
    if (!tagId) {
      tagId = crypto.randomUUID();
      await db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).bind(tagId, cleanName).run();
    }

    await db
      .prepare(`INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)`)
      .bind(highlightId, tagId)
      .run();
  }
}

// POST /api/import/kindle - Bulk import from Kindle clippings text
app.post('/kindle', async (c) => {
  const body = (await c.req.json()) as { clippings?: string };
  const text = body.clippings?.trim();

  if (!text) {
    return c.json({ error: 'No clippings text provided' }, 400);
  }

  const parsed = parseMyClippings(text);
  if (parsed.length === 0) {
    return c.json({ error: 'No valid highlights found in clippings file' }, 400);
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
    const existingBook = await c.env.DB.prepare(
      `SELECT id FROM sources WHERE name = ? AND type = 'book' AND deleted = 0`
    )
      .bind(title)
      .first<{ id: string }>();

    let sourceId = existingBook?.id;
    const now = new Date().toISOString();
    if (!sourceId) {
      sourceId = crypto.randomUUID();
      const author = highlights[0]?.author || null;

      statements.push(
        c.env.DB.prepare(
          `INSERT INTO sources (id, name, author, type, reading_status, created_at, updated_at)
           VALUES (?, ?, ?, 'book', 'archive', ?, ?)`
        ).bind(sourceId, title, author, now, now)
      );
      booksCreated++;
    }

    const existingSet = new Set<string>();
    if (existingBook) {
      const { results: existingRows } = await c.env.DB.prepare(
        `SELECT content FROM highlights WHERE source_id = ? AND deleted = 0`
      )
        .bind(sourceId)
        .all<{ content: string }>();
      for (const r of existingRows) existingSet.add(r.content);
    }

    for (const hl of highlights) {
      if (existingSet.has(hl.content)) continue;
      existingSet.add(hl.content);
      const hlId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO highlights (id, source_id, content, location, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(hlId, sourceId, hl.content, hl.location, now, now)
      );
      totalImported++;
    }
  }

  for (let i = 0; i < statements.length; i += 50) {
    await c.env.DB.batch(statements.slice(i, i + 50));
  }

  return c.json({
    success: true,
    data: {
      booksProcessed: booksMap.size,
      booksCreated,
      highlightsImported: totalImported,
    },
  });
});

// POST /api/import/csv - Readwise, Apple Books, Kobo, Goodreads CSV
app.post('/csv', async (c) => {
  const body = (await c.req.json()) as {
    csv?: string;
    format?: CsvImportFormat;
  };

  const csvText = body.csv?.trim();
  if (!csvText) {
    return c.json({ error: 'CSV content is required' }, 400);
  }

  let parsed;
  try {
    parsed = parseImportCsv(csvText, body.format || 'auto');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse CSV';
    return c.json({ error: msg }, 400);
  }

  if (parsed.records.length === 0) {
    return c.json({ error: 'No valid book or highlight records found in CSV' }, 400);
  }

  const sourceCache = new Map<string, string>();
  const existingHighlightsBySource = new Map<string, Set<string>>();
  const statements: D1PreparedStatement[] = [];
  const pendingTags: Array<{ hlId: string; tags: string[] }> = [];
  let booksCreated = 0;
  let highlightsImported = 0;
  const now = new Date().toISOString();

  for (const rec of parsed.records) {
    const cacheKey = rec.sourceTitle.toLowerCase().trim();
    let sourceId = sourceCache.get(cacheKey);

    if (!sourceId) {
      const existing = await c.env.DB.prepare(
        `SELECT id FROM sources WHERE LOWER(TRIM(name)) = ? AND deleted = 0 LIMIT 1`
      )
        .bind(cacheKey)
        .first<{ id: string }>();

      if (existing) {
        sourceId = existing.id;
        const { results: existingRows } = await c.env.DB.prepare(
          `SELECT content FROM highlights WHERE source_id = ? AND deleted = 0`
        )
          .bind(sourceId)
          .all<{ content: string }>();
        existingHighlightsBySource.set(sourceId, new Set(existingRows.map((r) => r.content)));
      } else {
        sourceId = crypto.randomUUID();
        statements.push(
          c.env.DB.prepare(
            `INSERT INTO sources (id, name, author, type, reading_status, source_notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            sourceId,
            rec.sourceTitle,
            rec.sourceAuthor,
            rec.sourceType,
            rec.readingStatus,
            rec.sourceNotes,
            now,
            now
          )
        );
        existingHighlightsBySource.set(sourceId, new Set());
        booksCreated++;
      }
      sourceCache.set(cacheKey, sourceId);
    }

    if (rec.highlightContent) {
      const existingSet = existingHighlightsBySource.get(sourceId)!;
      if (!existingSet.has(rec.highlightContent)) {
        existingSet.add(rec.highlightContent);
        const hlId = crypto.randomUUID();
        statements.push(
          c.env.DB.prepare(
            `INSERT INTO highlights (id, source_id, content, note, color, location, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            hlId,
            sourceId,
            rec.highlightContent,
            rec.highlightNote,
            rec.color,
            rec.location,
            now,
            now
          )
        );
        if (rec.tags.length > 0) {
          pendingTags.push({ hlId, tags: rec.tags });
        }
        highlightsImported++;
      }
    }
  }

  for (let i = 0; i < statements.length; i += 50) {
    await c.env.DB.batch(statements.slice(i, i + 50));
  }
  for (const item of pendingTags) {
    await attachTagsToHighlight(c.env.DB, item.hlId, item.tags);
  }

  return c.json({
    success: true,
    data: {
      detectedFormat: parsed.detectedFormat,
      booksProcessed: sourceCache.size,
      booksCreated,
      highlightsImported,
    },
  });
});

// POST /api/import/pdf - Import PDF from client-extracted content_html/pages/text & annotations
app.post('/pdf', async (c) => {
  const contentType = c.req.header('content-type') || '';

  let title = 'Imported PDF';
  let author: string | null = null;
  let readingStatus = 'inbox';
  let pages: string[] = [];
  let plainText = '';
  let contentHtml = '';
  let fileHash: string | null = null;
  let pageCount = 1;
  let extractedHighlights: Array<{
    content: string;
    note?: string;
    location?: string;
    color?: string;
  }> = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const titleField = formData.get('title');
    const authorField = formData.get('author');
    const statusField = formData.get('reading_status');
    const textField = formData.get('text');

    if (typeof titleField === 'string' && titleField.trim()) {
      title = titleField.trim();
    }
    if (typeof authorField === 'string' && authorField.trim()) {
      author = authorField.trim();
    }
    if (typeof statusField === 'string' && statusField.trim()) {
      readingStatus = statusField.trim();
    }
    if (typeof textField === 'string' && textField.trim()) {
      plainText = textField.trim();
    } else {
      return c.json(
        { error: 'Client-side PDF text extraction is required; please upload via the web app.' },
        400
      );
    }
  } else {
    const body = (await c.req.json()) as {
      title?: string;
      author?: string;
      reading_status?: string;
      content_html?: string;
      pages?: string[];
      text?: string;
      file_hash?: string;
      page_count?: number;
      highlights?: Array<{
        content?: string;
        note?: string;
        location?: string;
        color?: string;
      }>;
    };

    if (body.title?.trim()) title = body.title.trim();
    if (body.author?.trim()) author = body.author.trim();
    if (body.reading_status?.trim()) readingStatus = body.reading_status.trim();
    if (body.file_hash?.trim()) fileHash = body.file_hash.trim();
    if (typeof body.page_count === 'number' && body.page_count > 0) {
      pageCount = Math.round(body.page_count);
    }

    if (body.content_html?.trim()) {
      contentHtml = body.content_html.trim();
    }
    if (Array.isArray(body.pages) && body.pages.length > 0) {
      pages = body.pages.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (pages.length > pageCount) pageCount = pages.length;
    }
    if (body.text?.trim()) {
      plainText = body.text.trim();
    }
    if (Array.isArray(body.highlights)) {
      extractedHighlights = body.highlights
        .filter((h) => typeof h?.content === 'string' && h.content.trim().length > 0)
        .map((h) => ({
          content: h.content!.trim(),
          note: typeof h.note === 'string' && h.note.trim() ? h.note.trim() : undefined,
          location: typeof h.location === 'string' && h.location.trim() ? h.location.trim() : undefined,
          color: typeof h.color === 'string' && h.color.trim() ? h.color.trim() : 'yellow',
        }));
    }
  }

  if (!contentHtml && pages.length === 0 && !plainText) {
    return c.json({ error: 'No readable text extracted from PDF' }, 400);
  }

  let wordCount = 0;
  let readingTime = 1;
  if (contentHtml) {
    const stripped = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    wordCount = stripped ? stripped.split(/\s+/).filter(Boolean).length : 0;
    readingTime = Math.max(1, Math.round(wordCount / 200));
  } else {
    const formatted = formatPdfPagesToHtml(pages, plainText);
    contentHtml = formatted.html;
    wordCount = formatted.wordCount;
    readingTime = formatted.readingTime;
  }

  const now = new Date().toISOString();
  const excerptSource = plainText || pages[0] || contentHtml.replace(/<[^>]+>/g, ' ').trim();
  const metadataObj: Record<string, unknown> = {
    pdf: true,
    page_count: pageCount,
    excerpt: excerptSource.slice(0, 180),
    ...(fileHash ? { file_hash: fileHash } : {}),
  };

  // Deduplicate existing PDF by file_hash (if provided) or exact title + type='pdf'
  let sourceId: string | null = null;
  if (fileHash) {
    const { results: pdfSources } = await c.env.DB.prepare(
      `SELECT id, metadata FROM sources WHERE type = 'pdf' AND deleted = 0`
    ).all<{ id: string; metadata: string | null }>();
    for (const s of pdfSources) {
      if (!s.metadata) continue;
      try {
        const meta = JSON.parse(s.metadata) as { file_hash?: string };
        if (meta.file_hash === fileHash) {
          sourceId = s.id;
          break;
        }
      } catch {}
    }
  }
  if (!sourceId) {
    const existingByName = await c.env.DB.prepare(
      `SELECT id FROM sources WHERE name = ? AND type = 'pdf' AND deleted = 0 LIMIT 1`
    )
      .bind(title)
      .first<{ id: string }>();
    if (existingByName) sourceId = existingByName.id;
  }

  if (sourceId) {
    await c.env.DB.prepare(
      `UPDATE sources
       SET author = COALESCE(?, author),
           content_html = ?,
           word_count = ?,
           reading_time = ?,
           metadata = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(author, contentHtml, wordCount, readingTime, JSON.stringify(metadataObj), now, sourceId)
      .run();
  } else {
    sourceId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO sources (id, name, author, type, content_html, reading_status, word_count, reading_time, metadata, created_at, updated_at)
       VALUES (?, ?, ?, 'pdf', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        sourceId,
        title,
        author,
        contentHtml,
        readingStatus,
        wordCount,
        readingTime,
        JSON.stringify(metadataObj),
        now,
        now
      )
      .run();
  }

  // Insert extracted PDF annotations/highlights with deduplication & semantic indexing
  let importedHighlightsCount = 0;
  const newHighlightIds: string[] = [];
  if (extractedHighlights.length > 0) {
    const { results: existingHlRows } = await c.env.DB.prepare(
      `SELECT content FROM highlights WHERE source_id = ? AND deleted = 0`
    )
      .bind(sourceId)
      .all<{ content: string }>();
    const existingSet = new Set(existingHlRows.map((r) => r.content));
    const statements: D1PreparedStatement[] = [];

    for (const hl of extractedHighlights) {
      if (existingSet.has(hl.content)) continue;
      existingSet.add(hl.content);
      const hlId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO highlights (id, source_id, content, note, color, location, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          hlId,
          sourceId,
          hl.content,
          hl.note || null,
          hl.color || 'yellow',
          hl.location || null,
          now,
          now
        )
      );
      newHighlightIds.push(hlId);
      importedHighlightsCount++;
    }

    for (let i = 0; i < statements.length; i += 50) {
      await c.env.DB.batch(statements.slice(i, i + 50));
    }

    if (newHighlightIds.length > 0) {
      try {
        c.executionCtx.waitUntil(
          Promise.allSettled(newHighlightIds.map((hid) => indexHighlightVector(c.env, hid)))
        );
      } catch {}
    }
  }

  const created = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`)
    .bind(sourceId)
    .first<SourceRow>();

  return c.json(
    {
      success: true,
      data: created,
      highlightsImported: importedHighlightsCount,
    },
    201
  );
});

// POST /api/import/json - Batch import from browser extensions (Kindle sync, X/Twitter bookmarks, etc.)
app.post('/json', async (c) => {
  let body: any = await c.req.json();
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
    return c.json({ error: 'No items provided for import' }, 400);
  }

  let totalImported = 0;
  let sourcesCreated = 0;
  const now = new Date().toISOString();

  for (const item of rawList) {
    if (!item) continue;
    const title = (item.title || item.name || item.bookTitle || 'Imported Source').trim();
    const author = (item.author || item.byline || null)?.trim() || null;
    const type = item.type || (item.bookTitle ? 'book' : item.url?.includes('x.com') || item.url?.includes('twitter.com') ? 'tweet' : 'article');
    const rawUrl = item.url?.trim() || null;
    const isGenericKindleUrl = rawUrl?.includes('read.amazon.com/notebook') ?? false;
    const url = type === 'book' && isGenericKindleUrl ? null : rawUrl;
    const imageUrl = item.image_url || item.imageUrl || null;

    // Check if source already exists: for books match name+type first, otherwise url first
    let sourceId: string | null = null;
    if (type === 'book') {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM sources WHERE name = ? AND type = ? AND deleted = 0 LIMIT 1'
      ).bind(title, type).first<{ id: string }>();
      if (existing) sourceId = existing.id;
    }

    if (!sourceId && url) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM sources WHERE url = ? AND deleted = 0 LIMIT 1'
      ).bind(url).first<{ id: string }>();
      if (existing) sourceId = existing.id;
    }

    if (!sourceId) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM sources WHERE name = ? AND type = ? AND deleted = 0 LIMIT 1'
      ).bind(title, type).first<{ id: string }>();
      if (existing) sourceId = existing.id;
    }

    const statements: D1PreparedStatement[] = [];
    const pendingTags: Array<{ hlId: string; tags: string[] }> = [];
    const existingSet = new Set<string>();

    if (sourceId) {
      const { results: existingRows } = await c.env.DB.prepare(
        'SELECT content FROM highlights WHERE source_id = ? AND deleted = 0'
      ).bind(sourceId).all<{ content: string }>();
      for (const r of existingRows) existingSet.add(r.content);
    } else {
      sourceId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare(`
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
        c.env.DB.prepare(`
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
      await c.env.DB.batch(statements.slice(i, i + 50));
    }
    for (const t of pendingTags) {
      await attachTagsToHighlight(c.env.DB, t.hlId, t.tags);
    }
  }

  return c.json({
    success: true,
    totalImported,
    sourcesCreated,
    message: `Imported ${totalImported} highlights across ${sourcesCreated} new sources`,
  });
});

export default app;
