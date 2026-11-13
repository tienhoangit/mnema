import { Hono } from 'hono';
import { Bindings } from '../../types';
import { indexHighlightVector } from '../ai/embeddings';
import { buildFtsPrefixQuery } from '../../core/text';
import { parseTagsJson } from '../../core/helpers';

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/highlights - List highlights across all sources
app.get('/', async (c) => {
  const favorite = c.req.query('favorite');
  const sourceId = c.req.query('source_id');
  const tag = c.req.query('tag');
  const search = c.req.query('q')?.trim();
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50')));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0'));

  let sql = `
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url,
      json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color)) as tags_json
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    LEFT JOIN highlight_tags ht ON ht.highlight_id = h.id
    LEFT JOIN tags t ON t.id = ht.tag_id
    WHERE h.deleted = 0 AND s.deleted = 0
  `;
  const params: any[] = [];

  if (favorite === '1' || favorite === 'true') {
    sql += ` AND h.favorite = 1`;
  }

  if (sourceId) {
    sql += ` AND h.source_id = ?`;
    params.push(sourceId);
  }

  if (search) {
    const ftsQuery = buildFtsPrefixQuery(search);
    if (ftsQuery) {
      sql += ` AND h.id IN (SELECT id FROM highlights_fts WHERE highlights_fts MATCH ?)`;
      params.push(ftsQuery);
    } else {
      sql += ` AND (h.content LIKE ? OR h.note LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
  }

  sql += ` GROUP BY h.id`;

  if (tag) {
    sql += ` HAVING tags_json LIKE ?`;
    params.push(`%"name":"${tag}"%`);
  }

  sql += ` ORDER BY h.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  const formatted = results.map((h: any) => {
    const tags = parseTagsJson(h.tags_json);
    const { tags_json, ...rest } = h;
    return { ...rest, tags };
  });

  return c.json({ data: formatted });
});

// POST /api/highlights - Create highlight
app.post('/', async (c) => {
  const body = await c.req.json();
  let { source_id, content, text, note, color, location, tags = [] } = body;
  const highlightContent = (content || text || '').trim();

  if (!highlightContent) {
    return c.json({ error: 'content or text is required' }, 400);
  }

  const now = new Date().toISOString();

  // If source_id is missing, find or create source using url/title
  if (!source_id && (body.url || body.title)) {
    const rawUrl = body.url?.trim() || null;
    let existingSource: any = null;
    if (rawUrl) {
      existingSource = await c.env.DB.prepare(
        'SELECT id FROM sources WHERE url = ? AND deleted = 0 LIMIT 1'
      ).bind(rawUrl).first();
    }

    if (existingSource) {
      source_id = existingSource.id;
    } else {
      source_id = crypto.randomUUID();
      const sourceTitle = body.title?.trim() || rawUrl || 'Web Highlight';
      await c.env.DB.prepare(`
        INSERT INTO sources (id, name, type, url, reading_status, word_count, reading_time, created_at, updated_at)
        VALUES (?, ?, 'article', ?, 'inbox', 0, 1, ?, ?)
      `).bind(source_id, sourceTitle, rawUrl, now, now).run();
    }
  }

  if (!source_id) {
    return c.json({ error: 'source_id or url/title is required' }, 400);
  }

  // Deduplicate highlight if identical content already exists on this source
  const existingHl = await c.env.DB.prepare(
    'SELECT * FROM highlights WHERE source_id = ? AND content = ? AND deleted = 0 LIMIT 1'
  ).bind(source_id, highlightContent).first<any>();

  if (existingHl) {
    const incomingNote = note?.trim();
    if (incomingNote && existingHl.note !== incomingNote) {
      const nextNote = existingHl.note
        ? `${existingHl.note}\n\n${incomingNote}`
        : incomingNote;
      await c.env.DB.prepare(
        'UPDATE highlights SET note = ?, updated_at = ? WHERE id = ?'
      ).bind(nextNote, now, existingHl.id).run();
      const updatedExisting = await c.env.DB.prepare('SELECT * FROM highlights WHERE id = ?')
        .bind(existingHl.id)
        .first();
      try {
        c.executionCtx.waitUntil(
          indexHighlightVector(c.env, existingHl.id).catch((err) => {
            console.error('Background vector indexing failed:', err);
          })
        );
      } catch {
        // ignore
      }
      return c.json({ data: updatedExisting, message: 'Highlight note updated' }, 200);
    }
    return c.json({ data: existingHl, message: 'Highlight already exists' }, 200);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO highlights (id, source_id, content, note, color, location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    source_id,
    highlightContent,
    note?.trim() || null,
    color || 'yellow',
    location || null,
    now,
    now
  ).run();

  // Attach tags if provided
  if (Array.isArray(tags) && tags.length > 0) {
    for (const tagName of tags) {
      const cleanName = tagName.trim().toLowerCase();
      if (!cleanName) continue;

      let tag = await c.env.DB.prepare(`SELECT id FROM tags WHERE name = ?`).bind(cleanName).first();
      let tagId = tag?.id;

      if (!tagId) {
        tagId = crypto.randomUUID();
        await c.env.DB.prepare(
          `INSERT INTO tags (id, name) VALUES (?, ?)`
        ).bind(tagId, cleanName).run();
      }

      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)
      `).bind(id, tagId).run();
    }
  }

  // Record activity
  try {
    const today = now.split('T')[0];
    await c.env.DB.prepare(`
      INSERT INTO activity_log (id, activity_date, action_type, source_id, highlight_id)
      VALUES (?, ?, 'created_highlight', ?, ?)
    `).bind(crypto.randomUUID(), today, source_id, id).run();
  } catch {}

  const created = await c.env.DB.prepare(`SELECT * FROM highlights WHERE id = ?`).bind(id).first();

  try {
    c.executionCtx.waitUntil(
      indexHighlightVector(c.env, id).catch((err) => {
        console.error('Background vector indexing failed:', err);
      })
    );
  } catch {
    // executionCtx may be unavailable in non-worker test environments
  }

  return c.json({ data: created }, 201);
});

// PATCH /api/highlights/:id - Update highlight
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: string[] = [];
  const params: any[] = [];

  if (body.content !== undefined) {
    updates.push('content = ?');
    params.push(body.content.trim());
  }
  if (body.note !== undefined) {
    updates.push('note = ?');
    params.push(body.note ? body.note.trim() : null);
  }
  if (body.color !== undefined) {
    updates.push('color = ?');
    params.push(body.color);
  }
  if (body.favorite !== undefined) {
    updates.push('favorite = ?');
    params.push(body.favorite ? 1 : 0);
  }
  if (body.is_in_review_queue !== undefined) {
    updates.push('is_in_review_queue = ?');
    params.push(body.is_in_review_queue ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await c.env.DB.prepare(`
    UPDATE highlights SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM highlights WHERE id = ?`).bind(id).first();

  if (body.content !== undefined || body.note !== undefined) {
    await c.env.DB.prepare(
      `DELETE FROM embeddings WHERE target_type = 'highlight' AND id = ?`
    )
      .bind(id)
      .run();
    try {
      c.executionCtx.waitUntil(
        indexHighlightVector(c.env, id).catch((err) => {
          console.error('Background vector re-indexing failed:', err);
        })
      );
    } catch {
      // ignore
    }
  }

  return c.json({ data: updated });
});

// DELETE /api/highlights/:id - Soft delete
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE highlights SET deleted = 1, updated_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), id).run();

  await c.env.DB.prepare(
    `DELETE FROM embeddings WHERE target_type = 'highlight' AND id = ?`
  ).bind(id).run();

  if (c.env.VECTORIZE) {
    try {
      c.executionCtx.waitUntil(
        c.env.VECTORIZE.deleteByIds([id]).catch((err) => {
          console.error('Background Vectorize delete failed:', err);
        })
      );
    } catch {
      // ignore
    }
  }

  return c.json({ success: true });
});

// POST /api/highlights/bulk-delete - Bulk delete highlights
app.post('/bulk-delete', async (c) => {
  const body = await c.req.json();
  const ids: string[] = body.ids || [];
  if (ids.length === 0) return c.json({ success: true, count: 0 });

  const placeholders = ids.map(() => '?').join(',');
  await c.env.DB.prepare(
    `UPDATE highlights SET deleted = 1, updated_at = ? WHERE id IN (${placeholders})`
  ).bind(new Date().toISOString(), ...ids).run();

  await c.env.DB.prepare(
    `DELETE FROM embeddings WHERE target_type = 'highlight' AND id IN (${placeholders})`
  ).bind(...ids).run();

  if (c.env.VECTORIZE) {
    try {
      c.executionCtx.waitUntil(
        c.env.VECTORIZE.deleteByIds(ids).catch((err) => {
          console.error('Background Vectorize batch delete failed:', err);
        })
      );
    } catch {
      // ignore
    }
  }

  return c.json({ success: true, count: ids.length });
});

// POST /api/highlights/bulk-review-queue - Bulk toggle review queue
app.post('/bulk-review-queue', async (c) => {
  const body = await c.req.json();
  const ids: string[] = body.ids || [];
  const inQueue = body.inQueue ? 1 : 0;
  if (ids.length === 0) return c.json({ success: true, count: 0 });

  const placeholders = ids.map(() => '?').join(',');
  await c.env.DB.prepare(
    `UPDATE highlights SET is_in_review_queue = ?, updated_at = ? WHERE id IN (${placeholders})`
  ).bind(inQueue, new Date().toISOString(), ...ids).run();

  return c.json({ success: true, count: ids.length });
});

// POST /api/highlights/merge - Merge 2 or more highlights into one
app.post('/merge', async (c) => {
  const body = await c.req.json();
  const ids: string[] = body.ids || [];
  if (ids.length < 2) return c.json({ error: 'Need at least 2 highlights to merge' }, 400);

  const placeholders = ids.map(() => '?').join(',');
  const { results }: any = await c.env.DB.prepare(
    `SELECT * FROM highlights WHERE id IN (${placeholders}) AND deleted = 0 ORDER BY created_at ASC`
  ).bind(...ids).all();

  if (results.length < 2) return c.json({ error: 'Highlights not found' }, 404);

  const mergedContent = results.map((r: any) => r.content).join(' ');
  const combinedNote = results.map((r: any) => r.note).filter(Boolean).join('\n---\n') || null;
  const primary = results[0];

  // Update primary
  await c.env.DB.prepare(
    `UPDATE highlights SET content = ?, note = ?, updated_at = ? WHERE id = ?`
  ).bind(mergedContent, combinedNote, new Date().toISOString(), primary.id).run();

  // Delete other highlights
  const others = results.slice(1).map((r: any) => r.id);
  const otherPlaceholders = others.map(() => '?').join(',');
  await c.env.DB.prepare(
    `UPDATE highlights SET deleted = 1, updated_at = ? WHERE id IN (${otherPlaceholders})`
  ).bind(new Date().toISOString(), ...others).run();
  await c.env.DB.prepare(
    `DELETE FROM embeddings WHERE target_type = 'highlight' AND id IN (${otherPlaceholders})`
  ).bind(...others).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM highlights WHERE id = ?`).bind(primary.id).first();

  try {
    c.executionCtx.waitUntil(
      Promise.allSettled([
        indexHighlightVector(c.env, primary.id),
        c.env.VECTORIZE && others.length > 0 ? c.env.VECTORIZE.deleteByIds(others) : Promise.resolve(),
      ])
    );
  } catch {
    // ignore
  }

  return c.json({ data: updated });
});

export default app;
