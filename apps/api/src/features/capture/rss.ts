import { Hono } from 'hono';
import { Bindings, RssFeedRow } from '../../types';
import { safeFetch } from '../../core/urlSafety';
import { parseArticleFromUrl } from './readability';
import { escapeHtml, sanitizeNewsletterHtml } from '../../services/emailParser';

export interface ParsedFeedItem {
  title: string;
  url: string;
  author: string | null;
  publishedAt: string | null;
  contentHtml: string;
  summary: string;
  imageUrl: string | null;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string | null;
  items: ParsedFeedItem[];
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(block: string, tagNames: string[]): string | null {
  for (const tag of tagNames) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = block.match(regex);
    if (match && match[1]) {
      return decodeXmlEntities(match[1]);
    }
  }
  return null;
}

function extractAtomLink(block: string): string | null {
  const linkTags = block.match(/<link\b[^>]*>/gi) || [];
  let fallback: string | null = null;

  for (const tag of linkTags) {
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    const rel = relMatch?.[1]?.toLowerCase() || 'alternate';
    if (rel === 'alternate') {
      return decodeXmlEntities(hrefMatch[1]);
    }
    if (!fallback && rel !== 'self' && rel !== 'enclosure') {
      fallback = decodeXmlEntities(hrefMatch[1]);
    }
  }

  // Also check <link>url</link>
  const textLink = extractTag(block, ['link']);
  return textLink || fallback;
}

function extractImageFromBlock(block: string, html: string): string | null {
  const mediaMatch =
    block.match(/<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["']/i) ||
    block.match(/<enclosure\b[^>]*type=["']image\/[^"']*["'][^>]*\burl=["']([^"']+)["']/i);
  if (mediaMatch?.[1]) return mediaMatch[1];

  const imgMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return imgMatch?.[1] || null;
}

export function parseFeedXml(xmlText: string, feedUrl: string): ParsedFeed {
  const trimmed = xmlText.trim();
  const isAtom = /<feed[\s>]/i.test(trimmed) && !/<channel[\s>]/i.test(trimmed);

  if (isAtom) {
    const feedHeader = trimmed.split(/<entry[\s>]/i)[0] || trimmed;
    const feedTitle = stripTags(extractTag(feedHeader, ['title']) || '') || new URL(feedUrl).hostname;
    const siteUrl = extractAtomLink(feedHeader);

    const entryMatches = trimmed.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    const items: ParsedFeedItem[] = [];

    for (const entry of entryMatches) {
      const title = stripTags(extractTag(entry, ['title']) || 'Untitled');
      const link = extractAtomLink(entry);
      if (!link) continue;

      const authorBlock = extractTag(entry, ['author']);
      const author = authorBlock
        ? stripTags(extractTag(authorBlock, ['name']) || authorBlock)
        : null;

      const publishedAt = extractTag(entry, ['published', 'updated']);
      const contentRaw =
        extractTag(entry, ['content', 'summary']) || '';
      const contentHtml = contentRaw.includes('<')
        ? contentRaw
        : contentRaw
        ? `<p>${contentRaw}</p>`
        : '';

      items.push({
        title,
        url: link,
        author: author || null,
        publishedAt,
        contentHtml,
        summary: stripTags(contentRaw).slice(0, 220),
        imageUrl: extractImageFromBlock(entry, contentHtml),
      });
    }

    return { title: feedTitle, siteUrl, items };
  }

  // RSS 2.0 / RDF
  const channelHeader = trimmed.split(/<item[\s>]/i)[0] || trimmed;
  const feedTitle = stripTags(extractTag(channelHeader, ['title']) || '') || new URL(feedUrl).hostname;
  const siteUrl = extractTag(channelHeader, ['link']);

  const itemMatches = trimmed.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items: ParsedFeedItem[] = [];

  for (const item of itemMatches) {
    const title = stripTags(extractTag(item, ['title']) || 'Untitled');
    const link = extractTag(item, ['link', 'guid']);
    if (!link || !/^https?:\/\//i.test(link)) continue;

    const author =
      stripTags(extractTag(item, ['dc:creator', 'author']) || '') || null;
    const publishedAt = extractTag(item, ['pubDate', 'dc:date', 'published']);
    const contentRaw =
      extractTag(item, ['content:encoded', 'description', 'summary']) || '';
    const contentHtml = contentRaw.includes('<')
      ? contentRaw
      : contentRaw
      ? `<p>${contentRaw}</p>`
      : '';

    items.push({
      title,
      url: link,
      author,
      publishedAt,
      contentHtml,
      summary: stripTags(contentRaw).slice(0, 220),
      imageUrl: extractImageFromBlock(item, contentHtml),
    });
  }

  return { title: feedTitle, siteUrl, items };
}

export async function fetchAndParseFeed(feedUrl: string): Promise<ParsedFeed> {
  const { response: res, finalUrl } = await safeFetch(feedUrl, {
    headers: {
      'User-Agent': 'MnemaRSS/1.0 (+https://mnema.mnema.workers.dev)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch RSS feed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  if (!xml.includes('<rss') && !xml.includes('<feed') && !xml.includes('<rdf:RDF') && !xml.includes('<channel')) {
    throw new Error('URL does not appear to be a valid RSS or Atom feed');
  }

  return parseFeedXml(xml, finalUrl);
}

const app = new Hono<{ Bindings: Bindings }>();

async function syncFeedItems(
  db: D1Database,
  feed: RssFeedRow,
  maxItems = 10,
  preParsed?: ParsedFeed,
  enrichWithReadability = true,
  budget?: { remainingFetches: number }
): Promise<{ added: number; skipped: number; feedTitle: string }> {
  if (budget && !preParsed) {
    if (budget.remainingFetches <= 0) {
      return { added: 0, skipped: 0, feedTitle: feed.title };
    }
    budget.remainingFetches--;
  }
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

    let finalHtml = item.contentHtml;
    let wordCount = 0;
    let readingTime = 1;

    if (enrichWithReadability && (!finalHtml || finalHtml.length < 500)) {
      if (!budget || budget.remainingFetches > 0) {
        try {
          if (budget) budget.remainingFetches--;
          const fullArticle = await parseArticleFromUrl(item.url);
          if (fullArticle?.content) {
            finalHtml = fullArticle.content;
          }
        } catch {
          // fallback to feed snippet
        }
      }
    }

    finalHtml = sanitizeNewsletterHtml(finalHtml || `<p>${escapeHtml(item.summary || item.title)}</p>`);

    const textOnly = finalHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    wordCount = textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0;
    readingTime = Math.max(1, Math.round(wordCount / 200));

    const sourceId = crypto.randomUUID();
    const now = new Date().toISOString();

    const metadata = JSON.stringify({
      feed_id: feed.id,
      feed_title: feed.title,
      summary: item.summary,
      original_published_at: item.publishedAt,
    });

    await db
      .prepare(`
        INSERT INTO sources (id, name, author, type, url, image_url, content_html, reading_status, progress, word_count, reading_time, metadata, created_at, updated_at)
        VALUES (?, ?, ?, 'article', ?, ?, ?, 'inbox', 0, ?, ?, ?, ?, ?)
      `)
      .bind(
        sourceId,
        item.title || 'Untitled RSS Post',
        item.author || feed.title,
        item.url,
        item.imageUrl,
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

  await db
    .prepare(`UPDATE rss_feeds SET last_fetched_at = ?, last_error = NULL WHERE id = ?`)
    .bind(new Date().toISOString(), feed.id)
    .run();

  return { added, skipped, feedTitle: feed.title };
}

// GET /api/rss - List all subscribed feeds with unread article count
app.get('/', async (c) => {
  const { results: feeds } = await c.env.DB.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM sources s 
       WHERE s.type = 'article' 
         AND s.deleted = 0 
         AND s.reading_status = 'inbox' 
         AND s.metadata LIKE ('%"feed_id":"' || f.id || '"%')
      ) as unread_count
    FROM rss_feeds f
    ORDER BY f.created_at DESC
  `).all();

  return c.json({ success: true, data: feeds });
});

// POST /api/rss - Subscribe to a new RSS/Atom feed
app.post('/', async (c) => {
  const body = (await c.req.json()) as { url?: string; title?: string };
  const rawUrl = body.url?.trim();
  if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
    return c.json({ error: 'A valid http(s) feed URL is required' }, 400);
  }

  const existing = await c.env.DB.prepare(`SELECT * FROM rss_feeds WHERE url = ?`)
    .bind(rawUrl)
    .first<RssFeedRow>();

  if (existing) {
    return c.json({ success: true, data: { feed: existing, alreadySubscribed: true } });
  }

  try {
    const parsed = await fetchAndParseFeed(rawUrl);
    const feedId = crypto.randomUUID();
    const now = new Date().toISOString();
    const finalTitle = body.title?.trim() || parsed.title || 'Untitled Feed';

    await c.env.DB.prepare(`
      INSERT INTO rss_feeds (id, title, url, site_url, last_fetched_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(feedId, finalTitle, rawUrl, parsed.siteUrl, now, now)
      .run();

    const createdFeed: RssFeedRow = {
      id: feedId,
      title: finalTitle,
      url: rawUrl,
      site_url: parsed.siteUrl,
      last_fetched_at: now,
      last_error: null,
      created_at: now,
    };

    const initialSync = await syncFeedItems(c.env.DB, createdFeed, 10, parsed, false);

    return c.json(
      {
        success: true,
        data: {
          feed: createdFeed,
          addedArticles: initialSync.added,
          skippedArticles: initialSync.skipped,
        },
      },
      201
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse RSS feed';
    return c.json({ error: msg }, 400);
  }
});

// POST /api/rss/:id/sync - Manually trigger sync for a single feed
app.post('/:id/sync', async (c) => {
  const feedId = c.req.param('id');
  const feed = await c.env.DB.prepare(`SELECT * FROM rss_feeds WHERE id = ?`)
    .bind(feedId)
    .first<RssFeedRow>();

  if (!feed) {
    return c.json({ error: 'Feed not found' }, 404);
  }

  try {
    const result = await syncFeedItems(c.env.DB, feed, 15, undefined, true);
    return c.json({
      success: true,
      data: {
        feedId,
        addedArticles: result.added,
        skippedArticles: result.skipped,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    await c.env.DB.prepare(`UPDATE rss_feeds SET last_error = ? WHERE id = ?`)
      .bind(msg, feedId)
      .run();
    return c.json({ error: msg }, 500);
  }
});

// DELETE /api/rss/:id - Unsubscribe from a feed
app.delete('/:id', async (c) => {
  const feedId = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM rss_feeds WHERE id = ?`).bind(feedId).run();
  return c.json({ success: true, message: 'Feed deleted successfully' });
});

// Background cron helper: checks oldest feeds first with safety rate-limiting
export async function runScheduledRssSync(
  db: D1Database,
  maxFeedsPerRun = 5
): Promise<{ feedsChecked: number; addedArticles: number; errors: number }> {
  const { results: feeds } = await db
    .prepare(`
      SELECT * FROM rss_feeds 
      ORDER BY last_fetched_at ASC NULLS FIRST 
      LIMIT ?
    `)
    .bind(maxFeedsPerRun)
    .all<RssFeedRow>();

  let feedsChecked = 0;
  let addedArticles = 0;
  let errors = 0;

  const budget = { remainingFetches: 15 };

  for (const feed of feeds) {
    if (budget.remainingFetches <= 0) break;
    try {
      const res = await syncFeedItems(db, feed, 5, undefined, false, budget);
      feedsChecked++;
      addedArticles += res.added;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : 'Scheduled sync failed';
      await db
        .prepare(`UPDATE rss_feeds SET last_error = ?, last_fetched_at = ? WHERE id = ?`)
        .bind(msg, new Date().toISOString(), feed.id)
        .run();
    }
  }

  return { feedsChecked, addedArticles, errors };
}

export default app;
