import { Bindings, HighlightRow, SourceRow } from '../../types';
import { attachTagsToHighlight } from '../../core/helpers';
import { getSettings } from '../../core/settings';
import { parseArticleFromUrl } from '../capture/readability';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '../capture/youtube';
import { indexHighlightVector } from '../ai/embeddings';
import { calculateSM2ByQuality, SM2Quality, SRSState } from '../review/srs';
import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  sendTelegramMessage,
} from './telegram';
import { escapeHtml, sanitizeNewsletterHtml } from './emailParser';
import { handleTelegramPhoto, handleTelegramAsk } from './telegramActions';

export { handleTelegramPhoto, handleTelegramAsk };

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramForwardOrigin {
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

export interface TelegramCallbackQuery {
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

export function extractTrailingTags(rawText: string): { cleanText: string; tags: string[] } {
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

export function buildTelegramNote(message: TelegramMessage): string {
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

export async function ensureTelegramCapturesSource(db: D1Database, now: string): Promise<string> {
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

export async function logHighlightActivity(
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



export async function handleTelegramCallbackQuery(
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
    nextReviewAt: highlight.next_review_at || null,
    fsrsState: highlight.fsrs_state ?? null,
    fsrsStability: highlight.fsrs_stability ?? null,
    fsrsDifficulty: highlight.fsrs_difficulty ?? null,
    fsrsReps: highlight.fsrs_reps ?? null,
    fsrsLapses: highlight.fsrs_lapses ?? null,
    fsrsLastReview: highlight.fsrs_last_review ?? null,
  };

  const nextState = calculateSM2ByQuality(currentState, quality);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE highlights
     SET review_count = ?, ease_factor = ?, interval_days = ?, next_review_at = ?, is_in_review_queue = ?,
         fsrs_state = ?, fsrs_stability = ?, fsrs_difficulty = ?, fsrs_reps = ?, fsrs_lapses = ?, fsrs_last_review = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      nextState.reviewCount,
      nextState.easeFactor,
      nextState.intervalDays,
      nextState.nextReviewAt,
      nextState.isInReviewQueue ? 1 : 0,
      nextState.fsrsState,
      nextState.fsrsStability,
      nextState.fsrsDifficulty,
      nextState.fsrsReps,
      nextState.fsrsLapses,
      nextState.fsrsLastReview,
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
  if (result.highlightId) {
    await indexHighlightVector(env, result.highlightId).catch((err) => {
      console.error('Failed to index Telegram highlight vector:', err);
    });
  }
  if (botToken && chatId) {
    await sendTelegramMessage(botToken, chatId, result.replyText);
  }
}
