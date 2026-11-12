import { Hono } from 'hono';
import { Bindings } from '../types';
import { parseArticleFromUrl } from '../services/readability';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '../services/youtube';

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/sources/search-books - Search books online via OpenLibrary
app.get('/search-books', async (c) => {
  const query = c.req.query('q')?.trim();
  if (!query) return c.json({ data: [] });

  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
    );
    if (!res.ok) return c.json({ data: [] });

    const json: any = await res.json();
    const docs = json.docs || [];

    const books = docs.map((doc: any) => {
      const coverId = doc.cover_i;
      const coverUrl = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
        : null;

      return {
        title: doc.title,
        author: doc.author_name ? doc.author_name.join(', ') : null,
        firstPublishYear: doc.first_publish_year || null,
        coverUrl,
        isbn: doc.isbn ? doc.isbn[0] : null,
      };
    });

    return c.json({ data: books });
  } catch (err: any) {
    console.warn('OpenLibrary search error:', err.message);
    return c.json({ data: [] });
  }
});

// GET /api/sources - List sources
app.get('/', async (c) => {
  const status = c.req.query('status') || 'inbox'; // 'inbox', 'later', 'archive', 'all'
  const type = c.req.query('type');
  const search = c.req.query('q')?.trim();
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30')));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0'));

  let sql = `
    SELECT s.*, 
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
    sql += ` AND (s.name LIKE ? OR s.author LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ data: results });
});

// GET /api/sources/:id/epub - Stream EPUB file from R2
app.get('/:id/epub', async (c) => {
  if (!c.env.EPUB_BUCKET) {
    return c.json({ error: 'R2 EPUB_BUCKET is not configured' }, 503);
  }

  const id = c.req.param('id');
  const source = await c.env.DB.prepare(
    `SELECT id, type, metadata FROM sources WHERE id = ? AND deleted = 0`
  )
    .bind(id)
    .first<{ id: string; type: string; metadata: string | null }>();

  if (!source) {
    return c.json({ error: 'Source not found' }, 404);
  }

  let r2Key = `epubs/${id}.epub`;
  if (source.metadata) {
    try {
      const meta = JSON.parse(source.metadata) as { r2_key?: string };
      if (meta.r2_key) r2Key = meta.r2_key;
    } catch {
      // use default key
    }
  }

  const object = await c.env.EPUB_BUCKET.get(r2Key);
  if (!object) {
    return c.json({ error: 'EPUB file not found in R2 storage' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/epub+zip');
  headers.set('Cache-Control', 'private, max-age=3600');
  if (object.size) {
    headers.set('Content-Length', String(object.size));
  }

  return new Response(object.body, { status: 200, headers });
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
    let tags = [];
    try {
      const parsed = JSON.parse(h.tags_json);
      tags = parsed.filter((t: any) => t && t.id);
    } catch {}
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
      contentHtml = String(body.content_html);
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
        contentHtml = article.content;
        wordCount = article.wordCount;
        readingTime = article.readingTimeMinutes;
        metadataObj.site_name = article.siteName;
        metadataObj.excerpt = article.excerpt;
      } catch (err: any) {
        return c.json({ error: `Failed to parse article: ${err.message}` }, 400);
      }
    }
  } else if (body.content_html && String(body.content_html).trim().length > 0) {
    contentHtml = String(body.content_html);
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
    contentHtml = rawHtml;
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

// POST /api/sources/epub - Upload EPUB file to Cloudflare R2 and create source
app.post('/epub', async (c) => {
  if (!c.env.EPUB_BUCKET) {
    return c.json({ error: 'R2 EPUB_BUCKET is not configured' }, 503);
  }

  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ error: 'Expected multipart/form-data with an .epub file' }, 400);
  }

  const rawFile = formData.get('file');
  if (!rawFile || typeof rawFile === 'string') {
    return c.json({ error: 'EPUB file field "file" is required' }, 400);
  }
  const file = rawFile as File;

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    return c.json({ error: 'Uploaded EPUB file is empty' }, 400);
  }

  let fileHash = (formData.get('file_hash') as string | null)?.trim() || '';
  if (!fileHash) {
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    fileHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const existing = await c.env.DB.prepare(
    `SELECT * FROM sources WHERE file_hash = ? AND deleted = 0`
  )
    .bind(fileHash)
    .first();

  if (existing) {
    return c.json({ data: existing, deduplicated: true });
  }

  const id = crypto.randomUUID();
  const r2Key = `epubs/${id}.epub`;
  const rawTitle = (formData.get('title') as string | null)?.trim();
  const title = rawTitle || file.name.replace(/\.epub$/i, '') || 'Untitled EPUB';
  const author = (formData.get('author') as string | null)?.trim() || null;
  const readingStatus = (formData.get('reading_status') as string | null)?.trim() || 'reading';
  const now = new Date().toISOString();

  await c.env.EPUB_BUCKET.put(r2Key, buffer, {
    httpMetadata: {
      contentType: 'application/epub+zip',
    },
    customMetadata: {
      sourceId: id,
      fileHash,
    },
  });

  const metadata = JSON.stringify({
    r2_key: r2Key,
    file_name: file.name,
    file_size: buffer.byteLength,
  });

  await c.env.DB.prepare(
    `INSERT INTO sources (id, name, author, type, url, reading_status, progress, word_count, reading_time, metadata, file_hash, created_at, updated_at)
     VALUES (?, ?, ?, 'epub', ?, ?, 0, 0, 0, ?, ?, ?, ?)`
  )
    .bind(id, title, author, `/api/sources/${id}/epub`, readingStatus, metadata, fileHash, now, now)
    .run();

  const created = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first();
  return c.json({ data: created, deduplicated: false }, 201);
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
  await c.env.DB.prepare(
    `UPDATE sources SET deleted = 1, updated_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), id).run();

  return c.json({ success: true });
});

export default app;
