import { Bindings } from '../../types';
import { attachTagsToHighlight } from '../../core/helpers';
import { runBookPageOcr } from '../capture/ocr';
import { askLibraryAi } from '../ai/rag';
import { indexHighlightVector } from '../ai/embeddings';
import {
  downloadTelegramFileBase64,
  sendTelegramMessage,
} from './telegram';
import {
  TelegramMessage,
  ensureTelegramCapturesSource,
  extractTrailingTags,
  logHighlightActivity,
} from './telegramHandlers';

export async function handleTelegramPhoto(
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
      await indexHighlightVector(env, highlightId).catch((err) => {
        console.error('Failed to index Telegram OCR highlight vector:', err);
      });
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

export async function handleTelegramAsk(
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
