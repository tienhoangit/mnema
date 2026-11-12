import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/shelves - List all shelves with item count
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT s.*, COUNT(ss.source_id) as source_count
    FROM shelves s
    LEFT JOIN source_shelves ss ON ss.shelf_id = s.id
    LEFT JOIN sources src ON src.id = ss.source_id AND src.deleted = 0
    GROUP BY s.id
    ORDER BY s.name ASC
  `).all();

  return c.json({ data: results });
});

// POST /api/shelves - Create new shelf
app.post('/', async (c) => {
  const body = await c.req.json();
  const name = body.name?.trim();
  const color = body.color || '#115e59';
  const description = body.description?.trim() || null;

  if (!name) {
    return c.json({ error: 'Shelf name is required' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO shelves (id, name, color, description) VALUES (?, ?, ?, ?)
  `).bind(id, name, color, description).run();

  const created = await c.env.DB.prepare(`SELECT * FROM shelves WHERE id = ?`).bind(id).first();
  return c.json({ data: created }, 201);
});

// POST /api/shelves/:id/sources - Add source to shelf
app.post('/:id/sources', async (c) => {
  const shelfId = c.req.param('id');
  const body = await c.req.json();
  const sourceId = body.source_id;

  if (!sourceId) {
    return c.json({ error: 'source_id is required' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO source_shelves (source_id, shelf_id) VALUES (?, ?)
  `).bind(sourceId, shelfId).run();

  return c.json({ success: true });
});

// DELETE /api/shelves/:id/sources/:sourceId - Remove source from shelf
app.delete('/:id/sources/:sourceId', async (c) => {
  const shelfId = c.req.param('id');
  const sourceId = c.req.param('sourceId');

  await c.env.DB.prepare(`
    DELETE FROM source_shelves WHERE source_id = ? AND shelf_id = ?
  `).bind(sourceId, shelfId).run();

  return c.json({ success: true });
});

// DELETE /api/shelves/:id - Delete shelf
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM shelves WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

export default app;

