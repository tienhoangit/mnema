import { Hono, Context } from 'hono';
import { Bindings } from '../../types';
import { getSettings } from '../../core/settings';
import {
  handleTelegramUpdate,
  processTelegramMessage,
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramPhotoSize,
  TelegramForwardOrigin,
} from './telegramHandlers';

export {
  handleTelegramUpdate,
  processTelegramMessage,
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramPhotoSize,
  TelegramForwardOrigin,
};

const app = new Hono<{ Bindings: Bindings }>();

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
  const chatId =
    msg?.chat?.id !== undefined
      ? String(msg.chat.id)
      : update.callback_query?.message?.chat?.id !== undefined
        ? String(update.callback_query.message.chat.id)
        : update.callback_query?.from?.id !== undefined
          ? String(update.callback_query.from.id)
          : '';

  // Reject missing or unauthorized chat IDs when allowlist is configured
  if (allowedChatId && (!chatId || chatId !== allowedChatId)) {
    return c.json({ error: 'Forbidden: unauthorized chat ID' }, 403);
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

app.post('/', (c) => handleTelegramWebhook(c));
app.post('/:secret', (c) => handleTelegramWebhook(c));

export default app;
