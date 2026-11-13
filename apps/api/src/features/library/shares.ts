import { Hono } from 'hono';
import { Bindings, HighlightWithSource, PublicShareRow, SourceRow, TagRow } from '../../types';

const app = new Hono<{ Bindings: Bindings }>();

function createSlug(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// GET /api/shares - List active shares (optionally filtered by target_type & target_id)
app.get('/', async (c) => {
  const targetType = c.req.query('target_type');
  const targetId = c.req.query('target_id');

  let sql = `SELECT * FROM public_shares WHERE is_active = 1`;
  const params: string[] = [];

  if (targetType) {
    sql += ` AND target_type = ?`;
    params.push(targetType);
  }
  if (targetId) {
    sql += ` AND target_id = ?`;
    params.push(targetId);
  }

  sql += ` ORDER BY created_at DESC`;
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<PublicShareRow>();
  return c.json({ data: results });
});

// POST /api/shares - Create or reuse public share link
app.post('/', async (c) => {
  const body = (await c.req.json()) as {
    target_type?: 'highlight' | 'source';
    target_id?: string;
  };

  if (!body.target_type || !['highlight', 'source'].includes(body.target_type)) {
    return c.json({ error: "target_type must be 'highlight' or 'source'" }, 400);
  }
  if (!body.target_id) {
    return c.json({ error: 'target_id is required' }, 400);
  }

  // Verify target exists and is not deleted
  if (body.target_type === 'highlight') {
    const hl = await c.env.DB.prepare(
      `SELECT id FROM highlights WHERE id = ? AND deleted = 0`
    )
      .bind(body.target_id)
      .first<{ id: string }>();
    if (!hl) return c.json({ error: 'Highlight not found' }, 404);
  } else {
    const src = await c.env.DB.prepare(
      `SELECT id FROM sources WHERE id = ? AND deleted = 0`
    )
      .bind(body.target_id)
      .first<{ id: string }>();
    if (!src) return c.json({ error: 'Source not found' }, 404);
  }

  const existing = await c.env.DB.prepare(
    `SELECT * FROM public_shares WHERE target_type = ? AND target_id = ? AND is_active = 1`
  )
    .bind(body.target_type, body.target_id)
    .first<PublicShareRow>();

  const origin = new URL(c.req.url).origin;

  if (existing) {
    return c.json({
      data: {
        ...existing,
        share_path: `/share/${existing.slug}`,
        share_url: `${origin}/share/${existing.slug}`,
      },
    });
  }

  const id = crypto.randomUUID();
  const slug = createSlug();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO public_shares (id, slug, target_type, target_id, is_active, view_count, created_at)
     VALUES (?, ?, ?, ?, 1, 0, ?)`
  )
    .bind(id, slug, body.target_type, body.target_id, now)
    .run();

  const created = await c.env.DB.prepare(`SELECT * FROM public_shares WHERE id = ?`)
    .bind(id)
    .first<PublicShareRow>();

  return c.json(
    {
      data: {
        ...created,
        share_path: `/share/${slug}`,
        share_url: `${origin}/share/${slug}`,
      },
    },
    201
  );
});

// DELETE /api/shares/:slug - Revoke share link
app.delete('/:slug', async (c) => {
  const slug = c.req.param('slug');
  await c.env.DB.prepare(`UPDATE public_shares SET is_active = 0 WHERE slug = ?`)
    .bind(slug)
    .run();
  return c.json({ success: true });
});

// Public router for /api/public/share/:slug
export const publicShareRouter = new Hono<{ Bindings: Bindings }>();

publicShareRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const share = await c.env.DB.prepare(
    `SELECT * FROM public_shares WHERE slug = ? AND is_active = 1`
  )
    .bind(slug)
    .first<PublicShareRow>();

  if (!share) {
    return c.json({ error: 'Shared link not found or has been revoked' }, 404);
  }

  if (share.target_type === 'highlight') {
    const hl = await c.env.DB.prepare(`
      SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url, s.image_url as source_image
      FROM highlights h
      JOIN sources s ON s.id = h.source_id
      WHERE h.id = ? AND h.deleted = 0 AND s.deleted = 0
    `)
      .bind(share.target_id)
      .first<HighlightWithSource & { source_image?: string | null }>();

    if (!hl) {
      return c.json({ error: 'Shared highlight is no longer available' }, 404);
    }

    // Increment view count only after verifying target exists
    await c.env.DB.prepare(
      `UPDATE public_shares SET view_count = view_count + 1 WHERE id = ?`
    )
      .bind(share.id)
      .run();

    const { results: tags } = await c.env.DB.prepare(`
      SELECT t.id, t.name, t.color
      FROM tags t
      JOIN highlight_tags ht ON ht.tag_id = t.id
      WHERE ht.highlight_id = ?
    `)
      .bind(hl.id)
      .all<TagRow>();

    return c.json({
      data: {
        slug: share.slug,
        target_type: 'highlight' as const,
        view_count: share.view_count + 1,
        created_at: share.created_at,
        highlight: {
          ...hl,
          tags,
        },
      },
    });
  }

  const source = await c.env.DB.prepare(
    `SELECT id, name, author, type, url, image_url, reading_status, word_count, reading_time, source_notes, created_at
     FROM sources WHERE id = ? AND deleted = 0`
  )
    .bind(share.target_id)
    .first<Partial<SourceRow>>();

  if (!source) {
    return c.json({ error: 'Shared source is no longer available' }, 404);
  }

  // Increment view count only after verifying target exists
  await c.env.DB.prepare(
    `UPDATE public_shares SET view_count = view_count + 1 WHERE id = ?`
  )
    .bind(share.id)
    .run();

  const { results: highlights } = await c.env.DB.prepare(`
    SELECT h.id, h.source_id, h.content, h.note, h.color, h.location, h.favorite, h.created_at,
      json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color)) as tags_json
    FROM highlights h
    LEFT JOIN highlight_tags ht ON ht.highlight_id = h.id
    LEFT JOIN tags t ON t.id = ht.tag_id
    WHERE h.source_id = ? AND h.deleted = 0
    GROUP BY h.id
    ORDER BY h.created_at ASC
  `)
    .bind(share.target_id)
    .all<HighlightWithSource & { tags_json: string }>();

  const formattedHighlights = highlights.map((h) => {
    let tags: TagRow[] = [];
    try {
      const parsed = JSON.parse(h.tags_json) as Array<TagRow>;
      tags = parsed.filter((t) => Boolean(t && t.id));
    } catch {
      tags = [];
    }
    const { tags_json: _tj, ...rest } = h;
    return { ...rest, tags };
  });

  return c.json({
    data: {
      slug: share.slug,
      target_type: 'source' as const,
      view_count: share.view_count + 1,
      created_at: share.created_at,
      source,
      highlights: formattedHighlights,
    },
  });
});

export default app;
