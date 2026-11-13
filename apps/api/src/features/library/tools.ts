import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// POST /api/tools/merge-duplicates - Merges duplicate sources with identical titles
app.post('/merge-duplicates', async (c) => {
  const { results: duplicates }: any = await c.env.DB.prepare(`
    SELECT LOWER(TRIM(name)) as clean_name, COUNT(*) as count, GROUP_CONCAT(id) as ids
    FROM sources
    WHERE deleted = 0
    GROUP BY clean_name
    HAVING count > 1
  `).all();

  let mergedCount = 0;

  for (const dup of duplicates) {
    const idList = dup.ids.split(',');
    const primaryId = idList[0];
    const secondaryIds = idList.slice(1);

    for (const secId of secondaryIds) {
      // Re-link all highlights from secondary to primary
      await c.env.DB.prepare(
        `UPDATE highlights SET source_id = ? WHERE source_id = ?`
      ).bind(primaryId, secId).run();

      // Soft delete secondary source
      await c.env.DB.prepare(
        `UPDATE sources SET deleted = 1 WHERE id = ?`
      ).bind(secId).run();

      mergedCount++;
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO tools_log (id, tool_name, affected_count) VALUES (?, 'merge-duplicates', ?)
  `).bind(crypto.randomUUID(), mergedCount).run();

  return c.json({ success: true, mergedSources: mergedCount });
});

// POST /api/tools/remove-empty - Remove sources that have 0 highlights
app.post('/remove-empty', async (c) => {
  const { results: emptySources }: any = await c.env.DB.prepare(`
    SELECT s.id
    FROM sources s
    LEFT JOIN highlights h ON h.source_id = s.id AND h.deleted = 0
    WHERE s.deleted = 0 AND s.type = 'book'
    GROUP BY s.id
    HAVING COUNT(h.id) = 0
  `).all();

  const count = emptySources.length;
  if (count > 0) {
    const placeholders = emptySources.map(() => '?').join(',');
    const ids = emptySources.map((s: any) => s.id);
    await c.env.DB.prepare(
      `UPDATE sources SET deleted = 1 WHERE id IN (${placeholders})`
    ).bind(...ids).run();
  }

  await c.env.DB.prepare(`
    INSERT INTO tools_log (id, tool_name, affected_count) VALUES (?, 'remove-empty', ?)
  `).bind(crypto.randomUUID(), count).run();

  return c.json({ success: true, removedCount: count });
});

// POST /api/tools/trash-tiny - Soft delete highlights with less than 15 characters
app.post('/trash-tiny', async (c) => {
  const result: any = await c.env.DB.prepare(`
    UPDATE highlights
    SET deleted = 1, updated_at = CURRENT_TIMESTAMP
    WHERE deleted = 0 AND LENGTH(TRIM(content)) < 15
  `).run();

  const count = result.meta?.changes || 0;

  await c.env.DB.prepare(`
    INSERT INTO tools_log (id, tool_name, affected_count) VALUES (?, 'trash-tiny', ?)
  `).bind(crypto.randomUUID(), count).run();

  return c.json({ success: true, trashedCount: count });
});

export default app;

