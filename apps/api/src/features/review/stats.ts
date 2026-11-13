import { Hono } from 'hono';
import { getConfiguredTimezoneOffset } from '../../core/helpers';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/stats/activity - Activity heatmap data (past 365 days)
app.get('/activity', async (c) => {
  const tzOffset = await getConfiguredTimezoneOffset(c.env.DB);
  const offsetMod = `${tzOffset >= 0 ? '+' : ''}${tzOffset} minutes`;
  const { results } = await c.env.DB.prepare(`
    SELECT activity_date as date, COUNT(*) as count
    FROM activity_log
    WHERE activity_date >= date('now', ?, '-365 days')
    GROUP BY activity_date
    ORDER BY activity_date ASC
  `)
    .bind(offsetMod)
    .all();

  return c.json({ data: results });
});

// GET /api/stats/full - Comprehensive analytics
app.get('/full', async (c) => {
  const tzOffset = await getConfiguredTimezoneOffset(c.env.DB);
  const offsetMod = `${tzOffset >= 0 ? '+' : ''}${tzOffset} minutes`;

  // Monthly stats
  const thisMonthHl: any = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM highlights 
    WHERE deleted = 0 AND datetime(created_at, ?) >= date('now', ?, 'start of month')
  `)
    .bind(offsetMod, offsetMod)
    .first();

  const lastMonthHl: any = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM highlights 
    WHERE deleted = 0 
      AND datetime(created_at, ?) >= date('now', ?, 'start of month', '-1 month')
      AND datetime(created_at, ?) < date('now', ?, 'start of month')
  `)
    .bind(offsetMod, offsetMod, offsetMod, offsetMod)
    .first();

  // Source Type breakdown
  const { results: typeBreakdown }: any = await c.env.DB.prepare(`
    SELECT type, COUNT(*) as count FROM sources WHERE deleted = 0 GROUP BY type
  `).all();

  // Top 5 Sources
  const { results: topSources }: any = await c.env.DB.prepare(`
    SELECT s.name, s.author, s.type, COUNT(h.id) as hl_count
    FROM sources s
    JOIN highlights h ON h.source_id = s.id AND h.deleted = 0
    WHERE s.deleted = 0
    GROUP BY s.id
    ORDER BY hl_count DESC
    LIMIT 5
  `).all();

  // Consistency in last 30 days
  const activeDaysLast30: any = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT activity_date) as active_count
    FROM activity_log
    WHERE activity_date >= date('now', '-30 days')
  `).first();

  const streak: any = await c.env.DB.prepare(`SELECT * FROM streak WHERE id = 'default'`).first();
  const totalReviews: any = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM reviews_log`).first();
  const totalHighlights: any = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM highlights WHERE deleted = 0`).first();
  const totalSources: any = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM sources WHERE deleted = 0`).first();

  const consistencyPct = Math.round(((activeDaysLast30?.active_count || 0) / 30) * 100);

  return c.json({
    data: {
      highlightsThisMonth: thisMonthHl?.count || 0,
      highlightsLastMonth: lastMonthHl?.count || 0,
      totalHighlights: totalHighlights?.count || 0,
      totalSources: totalSources?.count || 0,
      totalReviews: totalReviews?.count || 0,
      currentStreak: streak?.current_streak || 0,
      longestStreak: streak?.longest_streak || 0,
      consistencyPct,
      typeBreakdown,
      topSources,
    },
  });
});

// GET /api/stats/summary - Library overall summary
app.get('/summary', async (c) => {
  const sourcesCount: any = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(word_count) as total_words FROM sources WHERE deleted = 0`
  ).first();

  const highlightsCount: any = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(favorite) as total_favorites FROM highlights WHERE deleted = 0`
  ).first();

  const reviewsCount: any = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM reviews_log`
  ).first();

  const streak: any = await c.env.DB.prepare(`SELECT * FROM streak WHERE id = 'default'`).first();

  return c.json({
    data: {
      totalSources: sourcesCount?.count || 0,
      totalWordsRead: sourcesCount?.total_words || 0,
      totalHighlights: highlightsCount?.count || 0,
      totalFavorites: highlightsCount?.total_favorites || 0,
      totalReviewsDone: reviewsCount?.count || 0,
      currentStreak: streak?.current_streak || 0,
      longestStreak: streak?.longest_streak || 0,
    },
  });
});

export default app;

