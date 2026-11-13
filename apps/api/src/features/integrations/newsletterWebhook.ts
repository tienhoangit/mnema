import { Hono } from 'hono';
import { Bindings, SourceRow } from '../../types';
import { getSettings } from '../../core/settings';
import { parseIncomingNewsletter } from './emailParser';

const app = new Hono<{ Bindings: Bindings }>();

// Ingest newsletter email payload (JSON or raw MIME)
export async function ingestNewsletterPayload(
  env: Bindings,
  payload: string | Record<string, unknown>
): Promise<SourceRow | null> {
  const email = parseIncomingNewsletter(payload);
  if (!email.html && !email.text) {
    return null;
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

  await env.DB.prepare(
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
    await env.DB.prepare(
      `INSERT INTO activity_log (id, activity_date, action_type, source_id) VALUES (?, ?, 'read_article', ?)`
    )
      .bind(crypto.randomUUID(), now.split('T')[0], id)
      .run();
  } catch {
    // non-fatal
  }

  return await env.DB.prepare(`SELECT * FROM sources WHERE id = ?`)
    .bind(id)
    .first<SourceRow>();
}

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

  const created = await ingestNewsletterPayload(c.env, parsedPayload);
  if (!created) {
    return c.json({ error: 'Email content is empty' }, 400);
  }

  return c.json({ success: true, data: created }, 201);
}

app.post('/', (c) => handleNewsletterWebhook(c));
app.post('/:secret', (c) => handleNewsletterWebhook(c));

export default app;
