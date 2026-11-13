import { Hono } from 'hono';
import { Bindings, HighlightWithSource, SourceRow } from '../../types';
import {
  buildDigestEmail,
  buildHighlightEmail,
  buildSourceEmail,
  getDigestHighlights,
  logEmailSend,
  sendViaResend,
} from './emailService';
import {
  getSettings,
  SettingsUpdateInput,
  toPublicSettings,
  updateSettings,
} from '../../core/settings';

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/email/settings
app.get('/settings', async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.json({ data: toPublicSettings(settings) });
});

// PUT /api/email/settings
app.put('/settings', async (c) => {
  const body = (await c.req.json()) as SettingsUpdateInput;
  const updated = await updateSettings(c.env.DB, body);
  const publicData = toPublicSettings(updated);
  return c.json({
    data: {
      ...publicData,
      ...(body.regenerate_newsletter_secret ? { newsletter_secret: updated.newsletter_secret || '' } : {}),
      ...(body.regenerate_telegram_secret ? { telegram_webhook_secret: updated.telegram_webhook_secret || '' } : {}),
    },
  });
});

// GET /api/email/digest/preview
app.get('/digest/preview', async (c) => {
  const settings = await getSettings(c.env.DB);
  const countParam = Number(c.req.query('count') || settings.digest_count || 5);
  const count = Number.isFinite(countParam) ? Math.min(20, Math.max(1, countParam)) : 5;

  const highlights = await getDigestHighlights(c.env.DB, count);
  const origin = new URL(c.req.url).origin;
  const tzOffset = typeof settings.timezone_offset_minutes === 'number' ? settings.timezone_offset_minutes : 420;
  const rendered = buildDigestEmail(highlights, origin, tzOffset);

  return c.json({
    data: {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      highlightsCount: highlights.length,
      highlights,
    },
  });
});

// POST /api/email/digest/send
app.post('/digest/send', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    to?: string;
    count?: number;
    resend_api_key?: string;
    from_email?: string;
  };
  const settings = await getSettings(c.env.DB);

  const recipient = (body.to || settings.digest_email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return c.json({ error: 'Valid recipient email address is required' }, 400);
  }

  const apiKey = (
    body.resend_api_key ||
    settings.resend_api_key ||
    c.env.RESEND_API_KEY ||
    ''
  ).trim();
  const count = Math.min(20, Math.max(1, Number(body.count || settings.digest_count || 5)));
  const highlights = await getDigestHighlights(c.env.DB, count);

  if (highlights.length === 0) {
    return c.json({ error: 'No highlights in your library to send in a digest' }, 400);
  }

  const origin = new URL(c.req.url).origin;
  const tzOffset = typeof settings.timezone_offset_minutes === 'number' ? settings.timezone_offset_minutes : 420;
  const rendered = buildDigestEmail(highlights, origin, tzOffset);

  if (!apiKey) {
    return c.json(
      {
        error:
          'No Resend API key configured. Get a free API key at resend.com (100 emails/day free) and save it in Settings.',
        preview: rendered,
      },
      400
    );
  }

  const from =
    (body.from_email || settings.from_email || '').trim() ||
    'Mnema Digest <onboarding@resend.dev>';

  try {
    const result = await sendViaResend({
      apiKey,
      from,
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    const now = new Date();
    const todayUtc = now.toISOString().split('T')[0];
    await c.env.DB.prepare(
      `UPDATE user_settings SET last_digest_sent_date = ?, last_digest_sent_at = ?, updated_at = ? WHERE id = 'default'`
    )
      .bind(todayUtc, now.toISOString(), now.toISOString())
      .run();

    await logEmailSend(c.env.DB, {
      emailType: 'digest',
      recipient,
      subject: rendered.subject,
      status: 'sent',
    });

    return c.json({
      success: true,
      data: {
        id: result.id,
        recipient,
        highlightsCount: highlights.length,
        subject: rendered.subject,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    await logEmailSend(c.env.DB, {
      emailType: 'digest',
      recipient,
      subject: rendered.subject,
      status: 'failed',
      errorMessage: message,
    });
    return c.json({ error: message }, 502);
  }
});

// POST /api/email/send-highlight
app.post('/send-highlight', async (c) => {
  const body = (await c.req.json()) as {
    highlight_id?: string;
    to?: string;
    include_note?: boolean;
    subject?: string;
    preview_only?: boolean;
  };

  if (!body.highlight_id) {
    return c.json({ error: 'highlight_id is required' }, 400);
  }

  const highlight = await c.env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    WHERE h.id = ? AND h.deleted = 0 AND s.deleted = 0
  `)
    .bind(body.highlight_id)
    .first<HighlightWithSource>();

  if (!highlight) {
    return c.json({ error: 'Highlight not found' }, 404);
  }

  const rendered = buildHighlightEmail(
    highlight,
    body.include_note !== false,
    body.subject
  );

  if (body.preview_only) {
    return c.json({ data: { preview: rendered } });
  }

  const settings = await getSettings(c.env.DB);
  const recipient = (body.to || settings.digest_email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return c.json({ error: 'Valid recipient email address is required' }, 400);
  }

  const apiKey = (settings.resend_api_key || c.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return c.json(
      {
        error:
          'No Resend API key configured. Save a free Resend API key in Settings, or use the mailto / preview option.',
        preview: rendered,
      },
      400
    );
  }

  const from =
    (settings.from_email || '').trim() || 'Mnema Notes <onboarding@resend.dev>';

  try {
    const result = await sendViaResend({
      apiKey,
      from,
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    await logEmailSend(c.env.DB, {
      emailType: 'highlight',
      recipient,
      subject: rendered.subject,
      status: 'sent',
    });

    return c.json({
      success: true,
      data: { id: result.id, recipient, subject: rendered.subject },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    await logEmailSend(c.env.DB, {
      emailType: 'highlight',
      recipient,
      subject: rendered.subject,
      status: 'failed',
      errorMessage: message,
    });
    return c.json({ error: message }, 502);
  }
});

// POST /api/email/send-source
app.post('/send-source', async (c) => {
  const body = (await c.req.json()) as {
    source_id?: string;
    to?: string;
    include_notes?: boolean;
    subject?: string;
    preview_only?: boolean;
  };

  if (!body.source_id) {
    return c.json({ error: 'source_id is required' }, 400);
  }

  const source = await c.env.DB.prepare(
    `SELECT * FROM sources WHERE id = ? AND deleted = 0`
  )
    .bind(body.source_id)
    .first<SourceRow>();

  if (!source) {
    return c.json({ error: 'Source not found' }, 404);
  }

  const { results: highlights } = await c.env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    WHERE h.source_id = ? AND h.deleted = 0
    ORDER BY h.created_at ASC
  `)
    .bind(body.source_id)
    .all<HighlightWithSource>();

  const rendered = buildSourceEmail(
    source,
    highlights,
    body.include_notes !== false,
    body.subject
  );

  if (body.preview_only) {
    return c.json({ data: { preview: rendered, highlightsCount: highlights.length } });
  }

  const settings = await getSettings(c.env.DB);
  const recipient = (body.to || settings.digest_email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return c.json({ error: 'Valid recipient email address is required' }, 400);
  }

  const apiKey = (settings.resend_api_key || c.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return c.json(
      {
        error:
          'No Resend API key configured. Save a free Resend API key in Settings, or use the mailto / preview option.',
        preview: rendered,
      },
      400
    );
  }

  const from =
    (settings.from_email || '').trim() || 'Mnema Notes <onboarding@resend.dev>';

  try {
    const result = await sendViaResend({
      apiKey,
      from,
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    await logEmailSend(c.env.DB, {
      emailType: 'source',
      recipient,
      subject: rendered.subject,
      status: 'sent',
    });

    return c.json({
      success: true,
      data: {
        id: result.id,
        recipient,
        subject: rendered.subject,
        highlightsCount: highlights.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    await logEmailSend(c.env.DB, {
      emailType: 'source',
      recipient,
      subject: rendered.subject,
      status: 'failed',
      errorMessage: message,
    });
    return c.json({ error: message }, 502);
  }
});

// GET /api/email/logs
app.get('/logs', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 20`
  ).all();
  return c.json({ data: results });
});

export default app;
