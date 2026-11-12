import { HighlightWithSource } from '../types';

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

interface TelegramGetFileResponse {
  ok?: boolean;
  description?: string;
  result?: {
    file_id?: string;
    file_path?: string;
  };
}

const TELEGRAM_MAX_TEXT = 4096;

function truncateTelegramText(text: string): string {
  if (text.length <= TELEGRAM_MAX_TEXT) return text;
  return `${text.slice(0, TELEGRAM_MAX_TEXT - 4)}...`;
}

async function callTelegramApi(
  botToken: string,
  method: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`Telegram ${method} HTTP ${res.status}:`, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Telegram ${method} failed:`, err);
    return false;
  }
}

export async function sendTelegramMessage(
  botToken: string | null | undefined,
  chatId: string | number,
  text: string,
  options: {
    replyMarkup?: TelegramInlineKeyboardMarkup;
    disableWebPagePreview?: boolean;
  } = {}
): Promise<boolean> {
  if (!botToken) return false;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: truncateTelegramText(text),
    disable_web_page_preview: options.disableWebPagePreview ?? true,
  };
  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  return callTelegramApi(botToken, 'sendMessage', payload);
}

export async function answerTelegramCallbackQuery(
  botToken: string | null | undefined,
  callbackQueryId: string,
  text?: string
): Promise<boolean> {
  if (!botToken) return false;
  const payload: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  };
  if (text) {
    payload.text = text.slice(0, 200);
  }
  return callTelegramApi(botToken, 'answerCallbackQuery', payload);
}

export async function editTelegramMessageText(
  botToken: string | null | undefined,
  chatId: string | number,
  messageId: number,
  text: string,
  options: {
    replyMarkup?: TelegramInlineKeyboardMarkup;
    disableWebPagePreview?: boolean;
  } = {}
): Promise<boolean> {
  if (!botToken) return false;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: truncateTelegramText(text),
    disable_web_page_preview: options.disableWebPagePreview ?? true,
  };
  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  return callTelegramApi(botToken, 'editMessageText', payload);
}

function inferImageMimeType(filePath: string, headerContentType: string | null): string {
  const ct = (headerContentType || '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('image/')) {
    return ct === 'image/jpg' ? 'image/jpeg' : ct;
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function downloadTelegramFileBase64(
  botToken: string,
  fileId: string
): Promise<{ base64Data: string; mimeType: string }> {
  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const metaJson = (await metaRes.json().catch(() => ({}))) as TelegramGetFileResponse;
  const filePath = metaJson.result?.file_path;
  if (!metaRes.ok || !metaJson.ok || !filePath) {
    throw new Error(metaJson.description || 'Failed to resolve Telegram file path');
  }

  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!fileRes.ok) {
    throw new Error(`Failed to download Telegram file (HTTP ${fileRes.status})`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const base64Data = arrayBufferToBase64(arrayBuffer);
  const mimeType = inferImageMimeType(filePath, fileRes.headers.get('content-type'));
  return { base64Data, mimeType };
}

export function buildSm2InlineKeyboard(highlightId: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Quên (0)', callback_data: `sm2:${highlightId}:0` },
        { text: 'Khó (3)', callback_data: `sm2:${highlightId}:3` },
      ],
      [
        { text: 'Nhớ (4)', callback_data: `sm2:${highlightId}:4` },
        { text: 'Quá dễ (5)', callback_data: `sm2:${highlightId}:5` },
      ],
    ],
  };
}

export function formatReviewHighlightMessage(h: HighlightWithSource): string {
  const quote = h.content.length > 1500 ? `${h.content.slice(0, 1497)}...` : h.content;
  const sourceLine = `${h.source_name || 'Mnema Library'}${h.source_author ? ` · ${h.source_author}` : ''}`;
  const noteLine = h.note ? `\n\n📝 Note: ${h.note}` : '';
  return `📚 Daily Mnema Review\n\n“${quote}”${noteLine}\n\n— ${sourceLine}`;
}

export async function sendTelegramReviewHighlights(
  botToken: string,
  chatId: string,
  highlights: HighlightWithSource[]
): Promise<number> {
  let sentCount = 0;
  for (const h of highlights) {
    const ok = await sendTelegramMessage(botToken, chatId, formatReviewHighlightMessage(h), {
      replyMarkup: buildSm2InlineKeyboard(h.id),
    });
    if (ok) sentCount++;
  }
  return sentCount;
}
