import { Hono } from 'hono';
import { calculateNextReview, SRSState } from '../services/srs';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/reviews/queue - Get today's review batch (up to 15 highlights)
app.get('/queue', async (c) => {
  const limit = Math.min(30, Math.max(5, parseInt(c.req.query('limit') || '15')));
  const now = new Date().toISOString();

  // Pick highlights due for review, or newly added highlights that haven't been reviewed
  const { results } = await c.env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.image_url as source_image
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    WHERE h.deleted = 0 AND s.deleted = 0 AND h.is_in_review_queue = 1
      AND (h.next_review_at <= ? OR h.review_count = 0)
    ORDER BY h.next_review_at ASC, RANDOM()
    LIMIT ?
  `).bind(now, limit).all();

  return c.json({ data: results });
});

// POST /api/reviews/custom - Start custom topic review
app.post('/custom', async (c) => {
  const body = await c.req.json();
  const topic = body.topic?.trim() || '';
  const sourceId = body.source_id;
  const tag = body.tag;
  const count = Math.min(50, Math.max(5, parseInt(body.count || '10')));

  let sql = `
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.image_url as source_image
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    LEFT JOIN highlight_tags ht ON ht.highlight_id = h.id
    LEFT JOIN tags t ON t.id = ht.tag_id
    WHERE h.deleted = 0 AND s.deleted = 0
  `;
  const params: any[] = [];

  if (topic) {
    sql += ` AND (h.content LIKE ? OR h.note LIKE ? OR s.name LIKE ?)`;
    params.push(`%${topic}%`, `%${topic}%`, `%${topic}%`);
  }

  if (sourceId) {
    sql += ` AND h.source_id = ?`;
    params.push(sourceId);
  }

  if (tag) {
    sql += ` AND t.name = ?`;
    params.push(tag);
  }

  sql += ` GROUP BY h.id ORDER BY RANDOM() LIMIT ?`;
  params.push(count);

  const { results }: any = await c.env.DB.prepare(sql).bind(...params).all();

  const id = crypto.randomUUID();
  const highlightIds = results.map((r: any) => r.id);

  await c.env.DB.prepare(`
    INSERT INTO custom_reviews (id, topic, highlight_ids) VALUES (?, ?, ?)
  `).bind(id, topic || (sourceId ? 'Source Review' : 'Custom Review'), JSON.stringify(highlightIds)).run();

  return c.json({
    data: {
      sessionId: id,
      topic: topic || 'Custom Review',
      highlights: results,
    },
  });
});

// POST /api/reviews/:id/action - Process SRS action ('remember' | 'forget' | 'discard')
app.post('/:id/action', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const action = body.action as 'remember' | 'forget' | 'discard';

  if (!['remember', 'forget', 'discard'].includes(action)) {
    return c.json({ error: "Invalid action. Must be 'remember', 'forget', or 'discard'" }, 400);
  }

  const highlight: any = await c.env.DB.prepare(
    `SELECT * FROM highlights WHERE id = ? AND deleted = 0`
  ).bind(id).first();

  if (!highlight) {
    return c.json({ error: 'Highlight not found' }, 404);
  }

  const currentState: SRSState = {
    reviewCount: highlight.review_count || 0,
    easeFactor: highlight.ease_factor || 2.5,
    intervalDays: highlight.interval_days || 0,
  };

  const nextState = calculateNextReview(currentState, action);

  // Update highlight SRS properties
  await c.env.DB.prepare(`
    UPDATE highlights
    SET review_count = ?, ease_factor = ?, interval_days = ?, next_review_at = ?, is_in_review_queue = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    nextState.reviewCount,
    nextState.easeFactor,
    nextState.intervalDays,
    nextState.nextReviewAt,
    nextState.isInReviewQueue ? 1 : 0,
    new Date().toISOString(),
    id
  ).run();

  // Snapshot previous state for undo capability
  const prevState = {
    reviewCount: highlight.review_count || 0,
    easeFactor: highlight.ease_factor || 2.5,
    intervalDays: highlight.interval_days || 0,
    nextReviewAt: highlight.next_review_at || null,
    isInReviewQueue: highlight.is_in_review_queue === 1,
  };

  // Log action with snapshot
  try {
    await c.env.DB.prepare(`
      INSERT INTO reviews_log (id, highlight_id, action, prev_state) VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), id, action, JSON.stringify(prevState)).run();
  } catch {
    // Fallback if prev_state column isn't migrated yet
    await c.env.DB.prepare(`
      INSERT INTO reviews_log (id, highlight_id, action) VALUES (?, ?, ?)
    `).bind(crypto.randomUUID(), id, action).run();
  }

  // Update streak
  const today = new Date().toISOString().split('T')[0];
  const streak: any = await c.env.DB.prepare(`SELECT * FROM streak WHERE id = 'default'`).first();

  if (streak) {
    let current = streak.current_streak || 0;
    let longest = streak.longest_streak || 0;
    const lastDate = streak.last_active_date;

    if (lastDate !== today) {
      if (lastDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        if (lastDate === yStr) {
          current += 1;
        } else {
          current = 1; // Reset streak if missed day
        }
      } else {
        current = 1;
      }
      longest = Math.max(longest, current);

      await c.env.DB.prepare(`
        UPDATE streak SET current_streak = ?, longest_streak = ?, last_active_date = ? WHERE id = 'default'
      `).bind(current, longest, today).run();
    }
  }

  return c.json({ data: nextState });
});

// POST /api/reviews/undo - Revert the last review action in reviews_log
app.post('/undo', async (c) => {
  const lastLog: any = await c.env.DB.prepare(`
    SELECT * FROM reviews_log ORDER BY reviewed_at DESC LIMIT 1
  `).first();

  if (!lastLog) {
    return c.json({ error: 'No recent review action to undo' }, 404);
  }

  const highlightId = lastLog.highlight_id;
  let restored = false;

  if (lastLog.prev_state) {
    try {
      const prev = JSON.parse(lastLog.prev_state);
      await c.env.DB.prepare(`
        UPDATE highlights
        SET review_count = ?, ease_factor = ?, interval_days = ?, next_review_at = ?, is_in_review_queue = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        prev.reviewCount,
        prev.easeFactor,
        prev.intervalDays,
        prev.nextReviewAt,
        prev.isInReviewQueue ? 1 : 0,
        new Date().toISOString(),
        highlightId
      ).run();
      restored = true;
    } catch (e) {
      console.warn('Failed to parse prev_state:', e);
    }
  }

  if (!restored) {
    // Graceful fallback for legacy rows
    await c.env.DB.prepare(`
      UPDATE highlights
      SET review_count = MAX(0, review_count - 1),
          interval_days = 0,
          next_review_at = CURRENT_TIMESTAMP,
          is_in_review_queue = 1,
          updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), highlightId).run();
  }

  // Remove the last review log entry
  await c.env.DB.prepare(`DELETE FROM reviews_log WHERE id = ?`).bind(lastLog.id).run();

  const highlight: any = await c.env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
    FROM highlights h
    LEFT JOIN sources s ON s.id = h.source_id
    WHERE h.id = ?
  `).bind(highlightId).first();

  return c.json({
    data: {
      highlight,
      undoneAction: lastLog.action,
    },
  });
});

// GET /api/reviews/streak - Get streak stats
app.get('/streak', async (c) => {
  const streak: any = await c.env.DB.prepare(`SELECT * FROM streak WHERE id = 'default'`).first();
  const totalReviewed: any = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM reviews_log`).first();

  return c.json({
    data: {
      currentStreak: streak?.current_streak || 0,
      longestStreak: streak?.longest_streak || 0,
      lastActiveDate: streak?.last_active_date || null,
      totalReviewsLogged: totalReviewed?.count || 0,
    },
  });
});

export default app;
