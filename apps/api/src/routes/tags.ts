import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/tags - List all tags with usage count
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*, COUNT(h.id) as count
    FROM tags t
    LEFT JOIN highlight_tags ht ON ht.tag_id = t.id
    LEFT JOIN highlights h ON h.id = ht.highlight_id AND h.deleted = 0
    GROUP BY t.id
    ORDER BY count DESC, t.name ASC
  `).all();

  return c.json({ data: results });
});

// POST /api/tags - Create a new tag
app.post('/', async (c) => {
  const body = await c.req.json();
  const rawName = body.name?.trim().toLowerCase();
  const color = body.color || '#0d9488';

  if (!rawName) {
    return c.json({ error: 'Tag name is required' }, 400);
  }

  // Check if tag already exists
  const existing: any = await c.env.DB.prepare(`SELECT * FROM tags WHERE name = ?`).bind(rawName).first();
  if (existing) {
    return c.json({ data: existing });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO tags (id, name, color, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(id, rawName, color, now).run();

  const created: any = await c.env.DB.prepare(`
    SELECT t.*, 0 as count FROM tags t WHERE t.id = ?
  `).bind(id).first();

  return c.json({ data: created }, 201);
});

// PATCH /api/tags/:id - Update tag name or color
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: string[] = [];
  const params: any[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name.trim().toLowerCase());
  }
  if (body.color !== undefined) {
    updates.push('color = ?');
    params.push(body.color);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  params.push(id);
  await c.env.DB.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated: any = await c.env.DB.prepare(`
    SELECT t.*, COUNT(h.id) as count
    FROM tags t
    LEFT JOIN highlight_tags ht ON ht.tag_id = t.id
    LEFT JOIN highlights h ON h.id = ht.highlight_id AND h.deleted = 0
    WHERE t.id = ?
    GROUP BY t.id
  `).bind(id).first();

  return c.json({ data: updated });
});

// DELETE /api/tags/:id - Delete a tag and remove from highlight_tags
app.delete('/:id', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare(`DELETE FROM highlight_tags WHERE tag_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM tags WHERE id = ?`).bind(id).run();

  return c.json({ success: true, deletedId: id });
});

export default app;
