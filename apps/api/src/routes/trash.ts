import { Hono } from 'hono';
import { Bindings } from '../types';

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/trash - List deleted sources and highlights
app.get('/', async (c) => {
  const { results: deletedSources } = await c.env.DB.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM highlights h WHERE h.source_id = s.id) as highlight_count
    FROM sources s
    WHERE s.deleted = 1
    ORDER BY s.updated_at DESC
  `).all();

  const { results: deletedHighlights } = await c.env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
    FROM highlights h
    LEFT JOIN sources s ON s.id = h.source_id
    WHERE h.deleted = 1
    ORDER BY h.updated_at DESC
  `).all();

  return c.json({
    data: {
      sources: deletedSources,
      highlights: deletedHighlights,
      totalCount: deletedSources.length + deletedHighlights.length,
    },
  });
});

// POST /api/trash/restore - Restore a soft-deleted source or highlight
app.post('/restore', async (c) => {
  const body = await c.req.json();
  const { type, id } = body;
  const now = new Date().toISOString();

  if (!id || !type) {
    return c.json({ error: 'id and type (source | highlight) are required' }, 400);
  }

  if (type === 'source') {
    await c.env.DB.prepare(`
      UPDATE sources SET deleted = 0, updated_at = ? WHERE id = ?
    `).bind(now, id).run();
    // Also optionally restore highlights for this source if deleted with it
    await c.env.DB.prepare(`
      UPDATE highlights SET deleted = 0, updated_at = ? WHERE source_id = ?
    `).bind(now, id).run();
  } else if (type === 'highlight') {
    await c.env.DB.prepare(`
      UPDATE highlights SET deleted = 0, updated_at = ? WHERE id = ?
    `).bind(now, id).run();
  } else {
    return c.json({ error: 'Invalid type' }, 400);
  }

  return c.json({ success: true, restored: { type, id } });
});

// DELETE /api/trash/permanent - Permanently delete an item or empty entire trash
app.delete('/permanent', async (c) => {
  const type = c.req.query('type');
  const id = c.req.query('id');
  const emptyAll = c.req.query('all') === 'true';

  if (emptyAll) {
    // Collect highlight IDs being permanently purged so we can clean up embeddings & Vectorize
    const { results: purgedRows } = await c.env.DB.prepare(
      `SELECT id FROM highlights WHERE deleted = 1 OR source_id IN (SELECT id FROM sources WHERE deleted = 1)`
    ).all<{ id: string }>();
    const purgedIds = purgedRows.map((r) => r.id);

    // Delete all deleted highlights and any highlights belonging to deleted sources
    await c.env.DB.prepare(
      `DELETE FROM highlights WHERE deleted = 1 OR source_id IN (SELECT id FROM sources WHERE deleted = 1)`
    ).run();
    // Delete all sources with deleted = 1
    await c.env.DB.prepare(`DELETE FROM sources WHERE deleted = 1`).run();

    // Clean up orphaned embeddings in D1 and Vectorize
    await c.env.DB.prepare(
      `DELETE FROM embeddings WHERE target_type = 'highlight' AND id NOT IN (SELECT id FROM highlights)`
    ).run();
    if (c.env.VECTORIZE && purgedIds.length > 0) {
      for (let i = 0; i < purgedIds.length; i += 100) {
        try {
          await c.env.VECTORIZE.deleteByIds(purgedIds.slice(i, i + 100));
        } catch {
          // ignore Vectorize cleanup errors
        }
      }
    }
    return c.json({ success: true, emptied: true });
  }

  if (type === 'source' && id) {
    const { results: hlRows } = await c.env.DB.prepare(
      `SELECT id FROM highlights WHERE source_id = ?`
    ).bind(id).all<{ id: string }>();
    const hlIds = hlRows.map((r) => r.id);

    await c.env.DB.prepare(`DELETE FROM highlights WHERE source_id = ?`).bind(id).run();
    await c.env.DB.prepare(`DELETE FROM sources WHERE id = ?`).bind(id).run();
    if (hlIds.length > 0) {
      const placeholders = hlIds.map(() => '?').join(',');
      await c.env.DB.prepare(
        `DELETE FROM embeddings WHERE target_type = 'highlight' AND id IN (${placeholders})`
      ).bind(...hlIds).run();
      if (c.env.VECTORIZE) {
        try {
          await c.env.VECTORIZE.deleteByIds(hlIds);
        } catch {}
      }
    }
    return c.json({ success: true, permanentlyDeleted: id });
  }

  if (type === 'highlight' && id) {
    await c.env.DB.prepare(`DELETE FROM highlights WHERE id = ?`).bind(id).run();
    await c.env.DB.prepare(
      `DELETE FROM embeddings WHERE target_type = 'highlight' AND id = ?`
    ).bind(id).run();
    if (c.env.VECTORIZE) {
      try {
        await c.env.VECTORIZE.deleteByIds([id]);
      } catch {}
    }
    return c.json({ success: true, permanentlyDeleted: id });
  }

  return c.json({ error: 'Specify type and id or ?all=true' }, 400);
});

export default app;

