import { Hono } from 'hono';
import { Bindings } from '../../types';

const app = new Hono<{ Bindings: Bindings }>();

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

export default app;
