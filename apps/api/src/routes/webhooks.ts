import { Hono, Context } from 'hono';
import { Bindings, HighlightRow, SourceRow } from '../types';
import { getSettings } from '../services/settings';
import { parseIncomingNewsletter, escapeHtml, sanitizeNewsletterHtml } from '../services/emailParser';
import { parseArticleFromUrl } from '../services/readability';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '../services/youtube';
import { runBookPageOcr } from '../services/ocr';
import { askLibraryAi } from '../services/semantic';
import { calculateSM2ByQuality, SM2Quality, SRSState } from '../services/srs';
import {
  answerTelegramCallbackQuery,
  downloadTelegramFileBase64,
  editTelegramMessageText,
  sendTelegramMessage,
} from '../services/telegram';

const app = new Hono<{ Bindings: Bindings }>();

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramForwardOrigin {
  type?: string;
  sender_user?: { first_name?: string; username?: string };
  sender_user_name?: string;
  chat?: { title?: string; username?: string };
}

export interface TelegramMessage {
  message_id?: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  forward_origin?: TelegramForwardOrigin;
  forward_from?: { first_name?: string; username?: string };
  forward_from_chat?: { title?: string; username?: string };
  forward_sender_name?: string;
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

interface TelegramCallbackQuery {
  id: string;
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
  };
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const QUALITY_LABELS: Record<SM2Quality, string> = {
  0: 'Quên (0)',
  3: 'Khó (3)',
  4: 'Nhớ (4)',
  5: 'Quá dễ (5)',
};

function extractTrailingTags(rawText: string): { cleanText: string; tags: string[] } {
  const match = rawText.match(/((?:\s+#[\p{L}\p{N}_-]+)+)\s*$/u);
  if (!match) {
    return { cleanText: rawText.trim(), tags: [] };
  }

  const tagBlock = match[1];
  const tags: string[] = [];
  const seen = new Set<string>();
  const tagRegex = /#([\p{L}\p{N}_-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(tagBlock)) !== null) {
    const clean = m[1].toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      tags.push(clean);
    }
  }

  const stripped = rawText.slice(0, match.index).trim();
  return {
    cleanText: stripped || rawText.trim(),
    tags,
  };
}

function buildTelegramNote(message: TelegramMessage): string {
  const forwardName =
    message.forward_origin?.chat?.title ||
    message.forward_origin?.sender_user?.first_name ||
    message.forward_origin?.sender_user_name ||
    message.forward_from_chat?.title ||
    message.forward_from?.first_name ||
    message.forward_sender_name;

  if (forwardName) {
    return `Forwarded from ${forwardName} via Telegram`;
  }
  if (message.from?.username) {
    return `Captured via @${message.from.username}`;
  }
  return 'Captured via Telegram';
}

async function ensureTelegramCapturesSource(db: D1Database, now: string): Promise<string> {
  const captureSource = await db
    .prepare(`SELECT id FROM sources WHERE name = 'Telegram Captures' AND deleted = 0 LIMIT 1`)
    .first<Pick<SourceRow, 'id'>>();

  if (captureSource?.id) {
    return captureSource.id;
  }

  const sourceId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO sources (id, name, author, type, reading_status, created_at, updated_at)
       VALUES (?, 'Telegram Captures', 'Telegram Bot', 'custom', 'archive', ?, ?)`
    )
    .bind(sourceId, now, now)
    .run();
  return sourceId;
}

async function attachTagsToHighlight(
  db: D1Database,
  highlightId: string,
  tags: string[]
): Promise<void> {
  for (const tagName of tags) {
    const cleanName = tagName.trim().toLowerCase();
    if (!cleanName) continue;

    const existing = await db
      .prepare(`SELECT id FROM tags WHERE name = ?`)
      .bind(cleanName)
      .first<{ id: string }>();
    let tagId = existing?.id;

    if (!tagId) {
      tagId = crypto.randomUUID();
      await db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).bind(tagId, cleanName).run();
    }

    await db
      .prepare(`INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)`)
      .bind(highlightId, tagId)
      .run();
  }
}

async function logHighlightActivity(
  db: D1Database,
  now: string,
  sourceId: string,
  highlightId: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO activity_log (id, activity_date, action_type, source_id, highlight_id)
         VALUES (?, ?, 'created_highlight', ?, ?)`
      )
      .bind(crypto.randomUUID(), now.split('T')[0], sourceId, highlightId)
      .run();
  } catch {
    // non-fatal
  }
}

export async function processTelegramMessage(
  db: D1Database,
  message: TelegramMessage
): Promise<{
  action: 'article_saved' | 'highlight_saved';
  sourceId: string;
  highlightId?: string;
  tags?: string[];
  replyText: string;
}> {
  const rawText = (message.text || message.caption || '').trim();
  const urlMatch = rawText.match(/https?:\/\/[^\s<>()]+/i);
  const now = new Date().toISOString();

  if (urlMatch) {
    const url = urlMatch[0].replace(/[.,;!?)]+$/, '');
    const rawRemaining = rawText.replace(urlMatch[0], '').trim();
    const { cleanText: remainingNote, tags } = extractTrailingTags(rawRemaining);
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
        .bind(highlightId, sourceId, remainingNote, buildTelegramNote(message), now, now)
        .run();

      if (tags.length > 0) {
        await attachTagsToHighlight(db, highlightId, tags);
      }
      await logHighlightActivity(db, now, sourceId, highlightId);
    }

    return {
      action: 'article_saved',
      sourceId,
      highlightId,
      tags,
      replyText: `Saved "${name}" to your Mnema Inbox!`,
    };
  }

  // Plain text / forwarded message -> save into "Telegram Captures" source with optional #tags
  const { cleanText, tags } = extractTrailingTags(rawText);
  const sourceId = await ensureTelegramCapturesSource(db, now);
  const highlightId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO highlights (id, source_id, content, note, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'yellow', ?, ?)`
    )
    .bind(highlightId, sourceId, cleanText, buildTelegramNote(message), now, now)
    .run();

  if (tags.length > 0) {
    await attachTagsToHighlight(db, highlightId, tags);
  }
  await logHighlightActivity(db, now, sourceId, highlightId);

  const tagSuffix = tags.length > 0 ? `\nTags: ${tags.map((t) => `#${t}`).join(' ')}` : '';
  return {
    action: 'highlight_saved',
    sourceId,
    highlightId,
    tags,
    replyText: `Saved quote to "Telegram Captures" in Mnema!${tagSuffix}`,
  };
}

async function handleTelegramPhoto(
  env: Bindings,
  botToken: string,
  chatId: string,
  message: TelegramMessage
): Promise<void> {
  const photos = message.photo || [];
  if (photos.length === 0) return;

  const bestPhoto = photos.reduce((best, curr) => {
    const bestScore = best.file_size ?? best.width * best.height;
    const currScore = curr.file_size ?? curr.width * curr.height;
    return currScore >= bestScore ? curr : best;
  }, photos[0]);

  try {
    const { base64Data, mimeType } = await downloadTelegramFileBase64(botToken, bestPhoto.file_id);
    const ocrResult = await runBookPageOcr(
      {
        imageBase64: base64Data,
        mimeType,
        mode: 'highlights_only',
      },
      env
    );

    const passages =
      ocrResult.passages.length > 0
        ? ocrResult.passages
        : ocrResult.text
          ? [ocrResult.text]
          : [];

    if (passages.length === 0) {
      await sendTelegramMessage(botToken, chatId, 'Không trích xuất được đoạn văn nào từ ảnh này.');
      return;
    }

    const now = new Date().toISOString();
    const sourceId = await ensureTelegramCapturesSource(env.DB, now);
    const { cleanText: captionNote, tags } = extractTrailingTags(message.caption || '');
    const note = captionNote ? `${captionNote} (Book OCR via Telegram)` : 'Book OCR via Telegram';

    for (const passage of passages) {
      const highlightId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO highlights (id, source_id, content, note, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'yellow', ?, ?)`
      )
        .bind(highlightId, sourceId, passage, note, now, now)
        .run();

      if (tags.length > 0) {
        await attachTagsToHighlight(env.DB, highlightId, tags);
      }
      await logHighlightActivity(env.DB, now, sourceId, highlightId);
    }

    const formatted = passages.map((p, idx) => `${idx + 1}. “${p}”`).join('\n\n');
    const tagLine = tags.length > 0 ? `\n\nTags: ${tags.map((t) => `#${t}`).join(' ')}` : '';
    await sendTelegramMessage(
      botToken,
      chatId,
      `📖 Đã lưu ${passages.length} highlight từ ảnh sách:\n\n${formatted}${tagLine}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Book OCR failed';
    await sendTelegramMessage(botToken, chatId, `❌ Lỗi OCR: ${msg}`);
  }
}

async function handleTelegramAsk(
  env: Bindings,
  botToken: string,
  chatId: string,
  query: string
): Promise<void> {
  if (!query) {
    await sendTelegramMessage(botToken, chatId, 'Cách dùng: /ask <câu hỏi của bạn>');
    return;
  }

  try {
    const { answer, citations } = await askLibraryAi(env, query, { limit: 10 });
    const citationLines = citations
      .slice(0, 5)
      .map((c) => {
        const snippet = c.content.length > 120 ? `${c.content.slice(0, 117)}...` : c.content;
        return `• [${c.source_name || 'Mnema'}] “${snippet}”`;
      })
      .join('\n');

    const reply = citationLines
      ? `${answer}\n\n📚 Nguồn trích dẫn:\n${citationLines}`
      : answer;
    await sendTelegramMessage(botToken, chatId, reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Library AI failed';
    await sendTelegramMessage(botToken, chatId, `❌ Lỗi /ask: ${msg}`);
  }
}

async function handleTelegramCallbackQuery(
  env: Bindings,
  botToken: string,
  cq: TelegramCallbackQuery
): Promise<void> {
  const data = cq.data?.trim() || '';
  const match = data.match(/^sm2:([^:]+):(0|3|4|5)$/);
  if (!match) {
    await answerTelegramCallbackQuery(botToken, cq.id);
    return;
  }

  const highlightId = match[1];
  const quality = Number(match[2]) as SM2Quality;

  const highlight = await env.DB.prepare(
    `SELECT h.*, s.name as source_name, s.author as source_author
     FROM highlights h
     LEFT JOIN sources s ON s.id = h.source_id
     WHERE h.id = ? AND h.deleted = 0`
  )
    .bind(highlightId)
    .first<HighlightRow & { source_name?: string; source_author?: string | null }>();

  if (!highlight) {
    await answerTelegramCallbackQuery(botToken, cq.id, 'Highlight not found');
    return;
  }

  const currentState: SRSState = {
    reviewCount: highlight.review_count || 0,
    easeFactor: highlight.ease_factor || 2.5,
    intervalDays: highlight.interval_days || 0,
  };

  const nextState = calculateSM2ByQuality(currentState, quality);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE highlights
     SET review_count = ?, ease_factor = ?, interval_days = ?, next_review_at = ?, is_in_review_queue = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      nextState.reviewCount,
      nextState.easeFactor,
      nextState.intervalDays,
      nextState.nextReviewAt,
      nextState.isInReviewQueue ? 1 : 0,
      now,
      highlightId
    )
    .run();

  const logAction = quality === 0 ? 'forget' : 'remember';
  const prevState = {
    reviewCount: currentState.reviewCount,
    easeFactor: currentState.easeFactor,
    intervalDays: currentState.intervalDays,
    nextReviewAt: highlight.next_review_at || null,
    isInReviewQueue: highlight.is_in_review_queue === 1,
  };

  try {
    await env.DB.prepare(
      `INSERT INTO reviews_log (id, highlight_id, action, prev_state) VALUES (?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), highlightId, logAction, JSON.stringify(prevState))
      .run();
  } catch {
    try {
      await env.DB.prepare(
        `INSERT INTO reviews_log (id, highlight_id, action) VALUES (?, ?, ?)`
      )
        .bind(crypto.randomUUID(), highlightId, logAction)
        .run();
    } catch {
      // non-fatal
    }
  }

  await answerTelegramCallbackQuery(botToken, cq.id, `Đã lưu: ${QUALITY_LABELS[quality]}`);

  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  if (chatId !== undefined && messageId !== undefined) {
    const quote =
      highlight.content.length > 1500
        ? `${highlight.content.slice(0, 1497)}...`
        : highlight.content;
    const sourceLine = `${highlight.source_name || 'Mnema Library'}${
      highlight.source_author ? ` · ${highlight.source_author}` : ''
    }`;
    const nextDateLabel = nextState.nextReviewAt.split('T')[0];
    const updatedText = `✅ Đã ôn tập (${QUALITY_LABELS[quality]})\n\n“${quote}”\n\n— ${sourceLine}\n📅 Lần ôn tiếp theo: ${nextDateLabel} (sau ${nextState.intervalDays} ngày)`;
    await editTelegramMessageText(botToken, chatId, messageId, updatedText);
  }
}

export async function handleTelegramUpdate(
  env: Bindings,
  update: TelegramUpdate
): Promise<void> {
  const settings = await getSettings(env.DB);
  const allowedChatId = settings.telegram_allowed_chat_id?.trim() || '';
  const botToken = settings.telegram_bot_token?.trim() || '';

  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId =
      cq.message?.chat?.id !== undefined
        ? String(cq.message.chat.id)
        : cq.from?.id !== undefined
          ? String(cq.from.id)
          : '';
    if (allowedChatId && chatId !== allowedChatId) {
      return;
    }
    if (botToken) {
      await handleTelegramCallbackQuery(env, botToken, cq);
    }
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat?.id !== undefined && msg.chat?.id !== null ? String(msg.chat.id) : '';
  if (allowedChatId && chatId !== allowedChatId) {
    return;
  }

  if (msg.photo && msg.photo.length > 0) {
    if (botToken && chatId) {
      await handleTelegramPhoto(env, botToken, chatId, msg);
    }
    return;
  }

  const rawText = (msg.text || msg.caption || '').trim();
  if (!rawText) return;

  const askMatch = rawText.match(/^\/ask(?:@\S+)?(?:\s+([\s\S]+))?$/i);
  if (askMatch) {
    if (botToken && chatId) {
      await handleTelegramAsk(env, botToken, chatId, (askMatch[1] || '').trim());
    }
    return;
  }

  const result = await processTelegramMessage(env.DB, msg);
  if (botToken && chatId) {
    await sendTelegramMessage(botToken, chatId, result.replyText);
  }
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
async function handleTelegramWebhook(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const settings = await getSettings(c.env.DB);
  const providedSecret =
    c.req.param('secret') ||
    c.req.header('x-telegram-bot-api-secret-token') ||
    c.req.header('x-webhook-secret') ||
    c.req.query('secret');

  if (settings.telegram_webhook_secret && providedSecret !== settings.telegram_webhook_secret) {
    return c.json({ error: 'Invalid Telegram webhook secret' }, 401);
  }

  const update = await c.req.json<TelegramUpdate>().catch(() => ({} as TelegramUpdate));
  const allowedChatId = settings.telegram_allowed_chat_id?.trim() || '';
  const msg = update.message || update.edited_message;
  const chatId = msg?.chat?.id !== undefined
    ? String(msg.chat.id)
    : update.callback_query?.message?.chat?.id !== undefined
      ? String(update.callback_query.message.chat.id)
      : update.callback_query?.from?.id !== undefined
        ? String(update.callback_query.from.id)
        : '';

  // Silently return 200 OK for unauthorized chat IDs
  if (allowedChatId && chatId && chatId !== allowedChatId) {
    return c.json({ ok: true, ignored: true });
  }

  const task = handleTelegramUpdate(c.env, update).catch((err) => {
    console.error('Telegram webhook background error:', err);
  });

  try {
    c.executionCtx.waitUntil(task);
  } catch {
    await task;
  }

  return c.json({ ok: true });
}

app.post('/telegram', (c) => handleTelegramWebhook(c));
app.post('/telegram/:secret', (c) => handleTelegramWebhook(c));

export default app;
