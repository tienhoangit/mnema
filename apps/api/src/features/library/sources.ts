import { Hono } from 'hono';
import { Bindings } from '../../types';
import { parseArticleFromUrl } from '../../services/readability';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '../../services/youtube';
import { buildFtsPrefixQuery } from '../../core/text';
import { parseTagsJson } from '../../core/helpers';
import { sanitizeHtml } from '../../core/sanitizeHtml';
import sourcesBooksApp from './sourcesBooks';
import sourcesEpubApp from './sourcesEpub';

const app = new Hono<{ Bindings: Bindings }>();

// Mount books search and EPUB handlers
app.route('/', sourcesBooksApp);
app.route('/', sourcesEpubApp);

// GET /api/sources - List sources
app.get('/', async (c) => {
  const status = c.req.query('status') || 'inbox'; // 'inbox', 'later', 'archive', 'all'
  const type = c.req.query('type');
  const search = c.req.query('q')?.trim();
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30')));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0'));

  let sql = `
    SELECT s.id, s.name, s.author, s.type, s.url, s.image_url, s.reading_status,
      s.progress, s.word_count, s.reading_time, s.metadata, s.source_notes,
      s.deleted, s.created_at, s.updated_at,
      (SELECT COUNT(*) FROM highlights h WHERE h.source_id = s.id AND h.deleted = 0) as highlight_count
    FROM sources s
    WHERE s.deleted = 0
  `;
  const params: any[] = [];

  if (status !== 'all') {
    sql += ` AND s.reading_status = ?`;
    params.push(status);
  }

  if (type) {
    sql += ` AND s.type = ?`;
    params.push(type);
  }

  if (search) {
    const ftsQuery = buildFtsPrefixQuery(search);
    if (ftsQuery) {
      sql += ` AND s.id IN (SELECT id FROM sources_fts WHERE sources_fts MATCH ?)`;
      params.push(ftsQuery);
    } else {
      sql += ` AND (s.name LIKE ? OR s.author LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
  }

  sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ data: results });
});

// GET /api/sources/:id - Get single source with highlights
app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const source = await c.env.DB.prepare(
    `SELECT * FROM sources WHERE id = ? AND deleted = 0`
  ).bind(id).first();

  if (!source) {
    return c.json({ error: 'Source not found' }, 404);
  }

  const { results: highlights } = await c.env.DB.prepare(`
    SELECT h.*, 
      json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color)) as tags_json
    FROM highlights h
    LEFT JOIN highlight_tags ht ON ht.highlight_id = h.id
    LEFT JOIN tags t ON t.id = ht.tag_id
    WHERE h.source_id = ? AND h.deleted = 0
    GROUP BY h.id
    ORDER BY h.created_at ASC
  `).bind(id).all();

  const formattedHighlights = highlights.map((h: any) => {
    const tags = parseTagsJson(h.tags_json);
    const { tags_json, ...rest } = h;
    return { ...rest, tags };
  });

  return c.json({ data: { ...source, highlights: formattedHighlights } });
});

// POST /api/sources - Create / Save new source
app.post('/', async (c) => {
  const body = await c.req.json();
  const url = body.url?.trim();
  const rawHtml = body.html?.trim();
  const id = crypto.randomUUID();

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return c.json({ error: 'Invalid URL scheme. Only HTTP and HTTPS are allowed.' }, 400);
      }
    } catch {
      return c.json({ error: 'Invalid URL format.' }, 400);
    }
  }

  let name = body.name?.trim() || body.title?.trim() || 'Untitled';
  let author = body.author?.trim() || null;
  let type = body.type || 'article';
  let imageUrl = body.image_url || null;
  let contentHtml = body.content_html || null;
  let wordCount = 0;
  let readingTime = 1;
  let metadataObj: any = {};

  if (url) {
    const youtubeId = extractYouTubeVideoId(url);
    if (youtubeId) {
      type = 'youtube';
      imageUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
      metadataObj.youtube_id = youtubeId;

      try {
        const ytData = await fetchYouTubeTranscript(youtubeId);
        name = ytData.title || name;
        author = ytData.author || author;
        metadataObj.transcript = ytData.segments;
        wordCount = ytData.segments.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
        readingTime = Math.max(1, Math.round(wordCount / 180));
      } catch (err: any) {
        console.warn('Could not fetch YouTube transcript:', err.message);
      }
    } else if (body.content_html && String(body.content_html).trim().length > 0) {
      // Pre-parsed article provided by browser extension or client
      // Uses client-extracted readability content to avoid Worker 10ms CPU parse limit
      contentHtml = sanitizeHtml(String(body.content_html));
      const parsedWordCount = Number(body.word_count);
      wordCount =
        Number.isFinite(parsedWordCount) && parsedWordCount > 0
          ? Math.round(parsedWordCount)
          : contentHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      const parsedReadingTime = Number(body.reading_time);
      readingTime =
        Number.isFinite(parsedReadingTime) && parsedReadingTime > 0
          ? Math.round(parsedReadingTime)
          : Math.max(1, Math.round(wordCount / 200));
      if (body.metadata) {
        try {
          metadataObj = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata;
        } catch {}
      }
    } else {
      // Normal article without pre-parsed content - fetch and parse on worker
      try {
        const article = await parseArticleFromUrl(url);
        name = article.title || name;
        author = article.byline || author;
        imageUrl = article.leadImageUrl || imageUrl;
        contentHtml = sanitizeHtml(article.content);
        wordCount = article.wordCount;
        readingTime = article.readingTimeMinutes;
        metadataObj.site_name = article.siteName;
        metadataObj.excerpt = article.excerpt;
      } catch (err: any) {
        return c.json({ error: `Failed to parse article: ${err.message}` }, 400);
      }
    }
  } else if (body.content_html && String(body.content_html).trim().length > 0) {
    contentHtml = sanitizeHtml(String(body.content_html));
    const parsedWordCount = Number(body.word_count);
    wordCount =
      Number.isFinite(parsedWordCount) && parsedWordCount > 0
        ? Math.round(parsedWordCount)
        : contentHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const parsedReadingTime = Number(body.reading_time);
    readingTime =
      Number.isFinite(parsedReadingTime) && parsedReadingTime > 0
        ? Math.round(parsedReadingTime)
        : Math.max(1, Math.round(wordCount / 200));
    if (body.metadata) {
      try {
        metadataObj = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata;
      } catch {}
    }
  } else if (rawHtml) {
    contentHtml = sanitizeHtml(rawHtml);
    wordCount = rawHtml.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
    readingTime = Math.max(1, Math.round(wordCount / 200));
  }

  const now = new Date().toISOString();

  // Deduplicate by URL if a non-deleted source already exists (e.g., stub created by extension highlighter)
  if (url) {
    const existing = await c.env.DB.prepare(
      `SELECT * FROM sources WHERE url = ? AND deleted = 0 LIMIT 1`
    )
      .bind(url)
      .first<any>();

    if (existing) {
      let existingMeta: Record<string, unknown> = {};
      if (existing.metadata) {
        try {
          existingMeta = JSON.parse(existing.metadata);
        } catch {}
      }
      const mergedMeta = { ...existingMeta, ...metadataObj };

      await c.env.DB.prepare(`
        UPDATE sources
        SET name = COALESCE(NULLIF(?, 'Untitled'), name),
            author = COALESCE(?, author),
            type = ?,
            image_url = COALESCE(?, image_url),
            content_html = COALESCE(?, content_html),
            word_count = CASE WHEN ? > 0 THEN ? ELSE word_count END,
            reading_time = CASE WHEN ? > 0 THEN ? ELSE reading_time END,
            metadata = ?,
            source_notes = COALESCE(?, source_notes),
            updated_at = ?
        WHERE id = ?
      `).bind(
        name,
        author,
        type,
        imageUrl,
        contentHtml,
        wordCount,
        wordCount,
        readingTime,
        readingTime,
        JSON.stringify(mergedMeta),
        body.source_notes || null,
        now,
        existing.id
      ).run();

      const updated = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`)
        .bind(existing.id)
        .first();
      return c.json({ data: updated, deduplicated: true }, 200);
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO sources (id, name, author, type, url, image_url, content_html, reading_status, word_count, reading_time, metadata, source_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    name,
    author,
    type,
    url || null,
    imageUrl,
    contentHtml,
    body.reading_status || 'inbox',
    wordCount,
    readingTime,
    JSON.stringify(metadataObj),
    body.source_notes || null,
    now,
    now
  ).run();

  // Record activity
  try {
    const today = now.split('T')[0];
    await c.env.DB.prepare(`
      INSERT INTO activity_log (id, activity_date, action_type, source_id)
      VALUES (?, ?, 'read_article', ?)
    `).bind(crypto.randomUUID(), today, id).run();
  } catch {}

  const created = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first();
  return c.json({ data: created }, 201);
});

// PATCH /api/sources/:id - Update status / progress / details
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: string[] = [];
  const params: any[] = [];

  if (body.reading_status !== undefined) {
    updates.push('reading_status = ?');
    params.push(body.reading_status);
  }
  if (body.progress !== undefined) {
    updates.push('progress = ?');
    params.push(body.progress);
  }
  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.author !== undefined) {
    updates.push('author = ?');
    params.push(body.author);
  }
  if (body.source_notes !== undefined) {
    updates.push('source_notes = ?');
    params.push(body.source_notes);
  }
  if (body.image_url !== undefined) {
    updates.push('image_url = ?');
    params.push(body.image_url);
  }
  if (body.favorite !== undefined) {
    const current = await c.env.DB.prepare('SELECT metadata FROM sources WHERE id = ?')
      .bind(id)
      .first<{ metadata: string | null }>();
    let metaObj: Record<string, unknown> = {};
    if (current?.metadata) {
      try {
        metaObj = JSON.parse(current.metadata) as Record<string, unknown>;
      } catch {
        metaObj = {};
      }
    }
    metaObj.favorite = Boolean(body.favorite);
    updates.push('metadata = ?');
    params.push(JSON.stringify(metaObj));
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await c.env.DB.prepare(`
    UPDATE sources SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first();
  return c.json({ data: updated });
});

// DELETE /api/sources/:id - Soft delete
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const { results: hlRows } = await c.env.DB.prepare(
    `SELECT id FROM highlights WHERE source_id = ?`
  )
    .bind(id)
    .all<{ id: string }>();
  const hlIds = hlRows.map((r) => r.id);

  await c.env.DB.prepare(
    `UPDATE sources SET deleted = 1, updated_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), id).run();

  if (hlIds.length > 0) {
    for (let i = 0; i < hlIds.length; i += 50) {
      const chunk = hlIds.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(',');
      await c.env.DB.prepare(
        `DELETE FROM embeddings WHERE target_type = 'highlight' AND id IN (${placeholders})`
      )
        .bind(...chunk)
        .run();
    }

    if (c.env.VECTORIZE) {
      try {
        c.executionCtx.waitUntil(
          (async () => {
            for (let i = 0; i < hlIds.length; i += 100) {
              await c.env.VECTORIZE!.deleteByIds(hlIds.slice(i, i + 100)).catch((err) => {
                console.error('Failed to delete highlight vectors on source delete:', err);
              });
            }
          })()
        );
      } catch {
        // ignore
      }
    }
  }

  return c.json({ success: true });
});

export default app;
