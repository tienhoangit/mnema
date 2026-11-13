import { Hono } from 'hono';
import { Bindings } from '../../types';
import { getSettings } from '../../core/settings';
import { ingestNewsletterPayload } from './newsletterWebhook';
import { processTelegramMessage } from './telegramWebhook';
import notionRouter from './notion';

const app = new Hono<{ Bindings: Bindings }>();

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
}

// POST /api/integrations/telegram/set-webhook
app.post('/telegram/set-webhook', async (c) => {
  const settings = await getSettings(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as {
    bot_token?: string;
  };

  const botToken = (body.bot_token || settings.telegram_bot_token || '').trim();
  if (!botToken) {
    return c.json({ error: 'Telegram Bot Token is required' }, 400);
  }

  // Never trust arbitrary body.origin; derive from PUBLIC_ORIGIN or the request URL origin
  const rawOrigin = c.env.PUBLIC_ORIGIN?.trim() || new URL(c.req.url).origin;
  let origin: string;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    return c.json({ error: 'Invalid PUBLIC_ORIGIN configuration' }, 500);
  }
  const webhookUrl = `${origin}/api/webhooks/telegram/${settings.telegram_webhook_secret}`;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: settings.telegram_webhook_secret,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as TelegramApiResponse;
  if (!res.ok || !data.ok) {
    return c.json(
      { error: data.description || `Telegram setWebhook failed (HTTP ${res.status})` },
      502
    );
  }

  return c.json({ success: true, data: { webhookUrl, description: data.description } });
});

// POST /api/integrations/telegram/test - Simulate a Telegram capture directly
app.post('/telegram/test', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { text?: string };
  const text =
    body.text?.trim() ||
    'The secret of getting ahead is getting started. — Mark Twain (Captured via Telegram test)';

  const result = await processTelegramMessage(c.env.DB, {
    text,
    from: { username: 'mnema_test' },
  });

  return c.json({ success: true, data: result });
});

// POST /api/integrations/newsletter/test - Simulate a Newsletter capture directly
app.post('/newsletter/test', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
  };
  const created = await ingestNewsletterPayload(c.env, {
    from: body.from || 'Stratechery <ben@stratechery.com>',
    subject: body.subject || 'Sample Newsletter Issue',
    text: body.text || 'Sample newsletter content.',
    html: body.html,
  });
  if (!created) {
    return c.json({ error: 'Email content is empty' }, 400);
  }
  return c.json({ success: true, data: created }, 201);
});

// Mount /notion subrouter
app.route('/notion', notionRouter);

export default app;
