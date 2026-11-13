import { Hono } from 'hono';
import { Bindings, SourceRow } from '../../types';
import { importKindleClippings } from './kindle';
import { CsvImportFormat, importCsvRecords } from './importers';
import { extractTextFromPdfBytes, formatPdfPagesToHtml } from './pdf';
import { syncHighlightEmbeddings } from '../ai/embeddings';
import { importJsonBatch } from './jsonSync';

const app = new Hono<{ Bindings: Bindings }>();

// POST /api/import/kindle - Bulk import from Kindle clippings text
app.post('/kindle', async (c) => {
  const body = (await c.req.json()) as { clippings?: string };
  const text = body.clippings?.trim();

  if (!text) {
    return c.json({ error: 'No clippings text provided' }, 400);
  }

  try {
    const result = await importKindleClippings(c.env.DB, text);
    return c.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'No valid highlights found in clippings file' }, 400);
  }
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

  try {
    const result = await importCsvRecords(c.env.DB, csvText, body.format || 'auto');
    return c.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Failed to parse CSV';
    return c.json({ error: msg }, 400);
  }
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
    const fileEntry = formData.get('file');
    const isFile = (val: unknown): val is File =>
      typeof val === 'object' && val !== null && 'arrayBuffer' in val && 'name' in val;
    const titleField = formData.get('title');
    const authorField = formData.get('author');
    const statusField = formData.get('reading_status');
    const textField = formData.get('text');

    if (typeof titleField === 'string' && titleField.trim()) {
      title = titleField.trim();
    } else if (isFile(fileEntry) && fileEntry.name) {
      title = fileEntry.name.replace(/\.pdf$/i, '');
    }
    if (typeof authorField === 'string' && authorField.trim()) {
      author = authorField.trim();
    }
    if (typeof statusField === 'string' && statusField.trim()) {
      readingStatus = statusField.trim();
    }
    if (typeof textField === 'string' && textField.trim()) {
      plainText = textField.trim();
    } else if (isFile(fileEntry)) {
      const bytes = new Uint8Array(await fileEntry.arrayBuffer());
      try {
        plainText = await extractTextFromPdfBytes(bytes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'PDF extraction failed';
        return c.json({ error: msg }, 400);
      }
    } else {
      return c.json(
        { error: 'PDF file or extracted text is required' },
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
          syncHighlightEmbeddings(c.env, { batchLimit: 30 }).catch((err) => {
            console.error('Import background embedding sync failed:', err);
          })
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
  const body = await c.req.json();
  try {
    const result = await importJsonBatch(c.env.DB, body);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message || 'No items provided for import' }, 400);
  }
});

export default app;
