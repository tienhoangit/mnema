import { Hono } from 'hono';
import { Bindings, SourceRow } from '../types';
import { getSettings } from '../services/settings';
import { parseIncomingNewsletter, escapeHtml, sanitizeNewsletterHtml } from '../services/emailParser';
import { parseArticleFromUrl } from '../services/readability';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '../services/youtube';

const app = new Hono<{ Bindings: Bindings }>();

interface TelegramMessage {
  message_id?: number;
  text?: string;
  caption?: string;
  chat?: {
    id: number | string;
    type?: string;
    title?: string;
  };
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
  };
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

async function replyTelegram(
  botToken: string | null,
  chatId: string | number,
  text: string
): Promise<void> {
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.warn('Telegram reply failed:', err);
  }
}

export async function processTelegramMessage(
  db: D1Database,
  message: TelegramMessage
): Promise<{ action: 'article_saved' | 'highlight_saved'; sourceId: string; highlightId?: string; replyText: string }> {
  const rawText = (message.text || message.caption || '').trim();
  const urlMatch = rawText.match(/https?:\/\/[^\s<>()]+/i);
  const now = new Date().toISOString();

  if (urlMatch) {
    const url = urlMatch[0].replace(/[.,;!?)]+$/, '');
    const remainingNote = rawText.replace(urlMatch[0], '').trim();
    const youtubeId = extractYouTubeVideoId(url);
    const sourceId = crypto.randomUUID();

    let name = url;
    let author: string | null = null;
    let type = 'article';
    let imageUrl: string | null = null;
    let contentHtml: string | null = null;
    let wordCount = 0;
    let readingTime = 1;
    const metadataObj: Record<string, unknown> = {
      telegram_capture: true,
      captured_at: now,
    };

    if (youtubeId) {
      type = 'youtube';
      imageUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
      metadataObj.youtube_id = youtubeId;
      try {
        const yt = await fetchYouTubeTranscript(youtubeId);
        name = yt.title || name;
        author = yt.author || null;
        metadataObj.transcript = yt.segments;
        wordCount = yt.segments.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
        readingTime = Math.max(1, Math.round(wordCount / 180));
      } catch {
        // Fallback if transcript unavailable
      }
    } else {
      try {
        const article = await parseArticleFromUrl(url);
        name = article.title || name;
        author = article.byline || null;
        imageUrl = article.leadImageUrl || null;
        contentHtml = sanitizeNewsletterHtml(article.content || '');
        wordCount = article.wordCount;
        readingTime = article.readingTimeMinutes;
        metadataObj.site_name = article.siteName;
        metadataObj.excerpt = article.excerpt;
      } catch {
        const safeUrl = escapeHtml(url);
        contentHtml = `<p>Saved from Telegram: <a href="${safeUrl}">${safeUrl}</a></p>`;
      }
    }

    await db
      .prepare(
        `INSERT INTO sources (id, name, author, type, url, image_url, content_html, reading_status, word_count, reading_time, metadata, source_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        sourceId,
        name,
        author,
        type,
        url,
        imageUrl,
        contentHtml,
        wordCount,
        readingTime,
        JSON.stringify(metadataObj),
        remainingNote || null,
        now,
        now
      )
      .run();

    let highlightId: string | undefined;
    if (remainingNote) {
      highlightId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO highlights (id, source_id, content, note, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'yellow', ?, ?)`
        )
        .bind(highlightId, sourceId, remainingNote, 'Captured via Telegram', now, now)
        .run();
    }

    return {
      action: 'article_saved',
      sourceId,
      highlightId,
      replyText: `Saved "${name}" to your Mnema Inbox!`,
    };
  }

  // Plain text / quote -> save into "Telegram Captures" source
  let captureSource = await db
    .prepare(
      `SELECT id FROM sources WHERE name = 'Telegram Captures' AND deleted = 0 LIMIT 1`
    )
    .first<Pick<SourceRow, 'id'>>();

  let sourceId = captureSource?.id;
  if (!sourceId) {
    sourceId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO sources (id, name, author, type, reading_status, created_at, updated_at)
         VALUES (?, 'Telegram Captures', 'Telegram Bot', 'custom', 'archive', ?, ?)`
      )
      .bind(sourceId, now, now)
      .run();
  }

  const highlightId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO highlights (id, source_id, content, note, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'yellow', ?, ?)`
    )
    .bind(
      highlightId,
      sourceId,
      rawText,
      message.from?.username ? `Captured via @${message.from.username}` : 'Captured via Telegram',
      now,
      now
    )
    .run();

  return {
    action: 'highlight_saved',
    sourceId,
    highlightId,
    replyText: `Saved quote to "Telegram Captures" in Mnema!`,
  };
}

// POST /api/webhooks/newsletter and /api/webhooks/newsletter/:secret
async function handleNewsletterWebhook(c: {
  req: {
    param: (name: string) => string | undefined;
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
    text: () => Promise<string>;
  };
  env: Bindings;
  json: (data: unknown, status?: number) => Response;
}): Promise<Response> {
  const settings = await getSettings(c.env.DB);
  const contentType = c.req.header('content-type') || '';
  const rawBody = await c.req.text();

  let parsedPayload: string | Record<string, unknown> = rawBody;
  let bodySecret: string | undefined;

  if (contentType.includes('application/json') || rawBody.trim().startsWith('{')) {
    try {
      const jsonObj = JSON.parse(rawBody) as Record<string, unknown>;
      parsedPayload = jsonObj;
      if (typeof jsonObj.secret === 'string') {
        bodySecret = jsonObj.secret;
      }
    } catch {
      parsedPayload = rawBody;
    }
  }

  const providedSecret =
    c.req.param('secret') ||
    c.req.header('x-webhook-secret') ||
    c.req.query('secret') ||
    bodySecret;

  if (settings.newsletter_secret && providedSecret !== settings.newsletter_secret) {
    return c.json({ error: 'Invalid newsletter webhook secret' }, 401);
  }

  const email = parseIncomingNewsletter(parsedPayload);
  if (!email.html && !email.text) {
    return c.json({ error: 'Email content is empty' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const wordCount = email.text ? email.text.split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.round(wordCount / 200));
  const metadata = JSON.stringify({
    newsletter: true,
    from_email: email.fromEmail,
    from_name: email.fromName,
    received_at: now,
    excerpt: email.text.slice(0, 180),
  });

  await c.env.DB.prepare(
    `INSERT INTO sources (id, name, author, type, content_html, reading_status, word_count, reading_time, metadata, created_at, updated_at)
     VALUES (?, ?, ?, 'article', ?, 'inbox', ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      email.subject,
      email.fromName || email.fromEmail || 'Newsletter',
      email.html,
      wordCount,
      readingTime,
      metadata,
      now,
      now
    )
    .run();

  try {
    await c.env.DB.prepare(
      `INSERT INTO activity_log (id, activity_date, action_type, source_id) VALUES (?, ?, 'read_article', ?)`
    )
      .bind(crypto.randomUUID(), now.split('T')[0], id)
      .run();
  } catch {
    // non-fatal
  }

  const created = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`)
    .bind(id)
    .first<SourceRow>();

  return c.json({ success: true, data: created }, 201);
}

app.post('/newsletter', (c) => handleNewsletterWebhook(c));
app.post('/newsletter/:secret', (c) => handleNewsletterWebhook(c));

// POST /api/webhooks/telegram and /api/webhooks/telegram/:secret
async function handleTelegramWebhook(c: {
  req: {
    param: (name: string) => string | undefined;
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
    json: <T>() => Promise<T>;
  };
  env: Bindings;
  json: (data: unknown, status?: number) => Response;
}): Promise<Response> {
  const settings = await getSettings(c.env.DB);
  const providedSecret =
    c.req.param('secret') ||
    c.req.header('x-telegram-bot-api-secret-token') ||
    c.req.header('x-webhook-secret') ||
    c.req.query('secret');

  if (settings.telegram_webhook_secret && providedSecret !== settings.telegram_webhook_secret) {
    return c.json({ error: 'Invalid Telegram webhook secret' }, 401);
  }

  const update = await c.req.json<TelegramUpdate>();
  const msg = update.message || update.edited_message;
  if (!msg || !(msg.text || msg.caption)?.trim()) {
    return c.json({ ok: true, ignored: true });
  }

  const chatId = msg.chat?.id !== undefined && msg.chat?.id !== null ? String(msg.chat.id) : '';
  if (
    settings.telegram_allowed_chat_id?.trim() &&
    chatId !== settings.telegram_allowed_chat_id.trim()
  ) {
    return c.json({ error: 'Chat ID not authorized' }, 403);
  }

  const result = await processTelegramMessage(c.env.DB, msg);

  if (chatId && settings.telegram_bot_token) {
    await replyTelegram(settings.telegram_bot_token, chatId, result.replyText);
  }

  return c.json({ ok: true, data: result });
}

app.post('/telegram', (c) => handleTelegramWebhook(c));
app.post('/telegram/:secret', (c) => handleTelegramWebhook(c));

export default app;
