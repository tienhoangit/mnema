import { Hono } from 'hono';
import { Bindings, RssFeedRow } from '../types';
import { fetchAndParseFeed, ParsedFeed } from '../services/rss';
import { parseArticleFromUrl } from '../services/readability';
import { escapeHtml, sanitizeNewsletterHtml } from '../services/emailParser';

const app = new Hono<{ Bindings: Bindings }>();

async function ensureRssTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS rss_feeds (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      site_url TEXT,
      last_fetched_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function syncFeedItems(
  db: D1Database,
  feed: RssFeedRow,
  maxItems = 10,
  preParsed?: ParsedFeed
): Promise<{ added: number; skipped: number; feedTitle: string }> {
  const parsed = preParsed ?? (await fetchAndParseFeed(feed.url));
  let added = 0;
  let skipped = 0;

  for (const item of parsed.items.slice(0, maxItems)) {
    const existing = await db
      .prepare(`SELECT id FROM sources WHERE url = ? AND deleted = 0`)
      .bind(item.url)
      .first<{ id: string }>();

    if (existing) {
      skipped++;
      continue;
    }

    let contentHtml = sanitizeNewsletterHtml(item.contentHtml || '');
    let author = item.author;
    let imageUrl = item.imageUrl;
    let wordCount = contentHtml
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
    let readingTime = Math.max(1, Math.round(wordCount / 200));
    let excerpt = item.summary;

    // Try enriching with Readability if feed only gave a short snippet
    if (wordCount < 120) {
      try {
        const full = await parseArticleFromUrl(item.url);
        if (full.wordCount > wordCount) {
          contentHtml = sanitizeNewsletterHtml(full.content || '');
          author = full.byline || author;
          imageUrl = full.leadImageUrl || imageUrl;
          wordCount = full.wordCount;
          readingTime = full.readingTimeMinutes;
          excerpt = full.excerpt;
        }
      } catch {
        // Keep feed's own content if full fetch is blocked
      }
    }

    const finalHtml =
      contentHtml.trim() || `<p>${escapeHtml(excerpt || item.title)}</p>`;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const metadata = JSON.stringify({
      rss_feed_id: feed.id,
      rss_feed_title: parsed.title,
      published_at: item.publishedAt,
      excerpt,
    });

    await db
      .prepare(
        `INSERT INTO sources (id, name, author, type, url, image_url, content_html, reading_status, word_count, reading_time, metadata, created_at, updated_at)
         VALUES (?, ?, ?, 'article', ?, ?, ?, 'inbox', ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        item.title,
        author,
        item.url,
        imageUrl,
        finalHtml,
        wordCount,
        readingTime,
        metadata,
        now,
        now
      )
      .run();

    added++;
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE rss_feeds SET title = ?, site_url = COALESCE(?, site_url), last_fetched_at = ?, last_error = NULL WHERE id = ?`
    )
    .bind(parsed.title || feed.title, parsed.siteUrl, now, feed.id)
    .run();

  return { added, skipped, feedTitle: parsed.title || feed.title };
}

// GET /api/rss - List all feeds
app.get('/', async (c) => {
  await ensureRssTable(c.env.DB);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM rss_feeds ORDER BY created_at DESC`
  ).all<RssFeedRow>();

  return c.json({ data: results });
});

// POST /api/rss - Subscribe to a new RSS/Atom feed and sync recent articles
app.post('/', async (c) => {
  await ensureRssTable(c.env.DB);
  const body = (await c.req.json()) as { url?: string; sync?: boolean };
  const feedUrl = body.url?.trim();

  if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) {
    return c.json({ error: 'Valid http(s) RSS/Atom feed URL is required' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT * FROM rss_feeds WHERE url = ?`
  )
    .bind(feedUrl)
    .first<RssFeedRow>();

  if (existing) {
    return c.json({ error: 'Already subscribed to this feed' }, 409);
  }

  let parsed;
  try {
    parsed = await fetchAndParseFeed(feedUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse feed';
    return c.json({ error: message }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO rss_feeds (id, title, url, site_url, last_fetched_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, parsed.title, feedUrl, parsed.siteUrl, now, now)
    .run();

  const created = await c.env.DB.prepare(`SELECT * FROM rss_feeds WHERE id = ?`)
    .bind(id)
    .first<RssFeedRow>();

  let syncResult = { added: 0, skipped: 0, feedTitle: parsed.title };
  if (created && body.sync !== false) {
    syncResult = await syncFeedItems(c.env.DB, created, 8, parsed);
  }

  return c.json(
    {
      data: {
        feed: created,
        addedArticles: syncResult.added,
        skippedArticles: syncResult.skipped,
      },
    },
    201
  );
});

// POST /api/rss/sync-all - Refresh all subscribed feeds
app.post('/sync-all', async (c) => {
  await ensureRssTable(c.env.DB);
  const { results: feeds } = await c.env.DB.prepare(
    `SELECT * FROM rss_feeds`
  ).all<RssFeedRow>();

  let totalAdded = 0;
  let errors = 0;

  for (const feed of feeds) {
    try {
      const res = await syncFeedItems(c.env.DB, feed, 8);
      totalAdded += res.added;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : 'Sync failed';
      await c.env.DB.prepare(`UPDATE rss_feeds SET last_error = ? WHERE id = ?`)
        .bind(msg, feed.id)
        .run();
    }
  }

  return c.json({
    success: true,
    data: {
      feedsSynced: feeds.length,
      addedArticles: totalAdded,
      errors,
    },
  });
});

// POST /api/rss/:id/sync - Sync single feed
app.post('/:id/sync', async (c) => {
  const id = c.req.param('id');
  const feed = await c.env.DB.prepare(`SELECT * FROM rss_feeds WHERE id = ?`)
    .bind(id)
    .first<RssFeedRow>();

  if (!feed) {
    return c.json({ error: 'Feed not found' }, 404);
  }

  try {
    const res = await syncFeedItems(c.env.DB, feed, 10);
    return c.json({
      success: true,
      data: {
        addedArticles: res.added,
        skippedArticles: res.skipped,
        feedTitle: res.feedTitle,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Feed sync failed';
    await c.env.DB.prepare(`UPDATE rss_feeds SET last_error = ? WHERE id = ?`)
      .bind(msg, feed.id)
      .run();
    return c.json({ error: msg }, 502);
  }
});

// DELETE /api/rss/:id - Unsubscribe
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM rss_feeds WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

export default app;
