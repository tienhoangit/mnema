import { Hono } from 'hono';
import { Bindings, HighlightWithSource, SourceRow } from '../types';
import { getSettings } from '../services/settings';
import { processTelegramMessage } from './webhooks';

const app = new Hono<{ Bindings: Bindings }>();

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
}

interface NotionDatabaseResponse {
  id?: string;
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, { id: string; type: string; name?: string }>;
  message?: string;
}

interface NotionPageResponse {
  id?: string;
  url?: string;
  message?: string;
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

// POST /api/integrations/notion/test - Verify Notion Token & Database ID
app.post('/notion/test', async (c) => {
  const settings = await getSettings(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as {
    notion_token?: string;
    notion_database_id?: string;
  };

  const token = (body.notion_token || settings.notion_token || '').trim();
  const dbId = (body.notion_database_id || settings.notion_database_id || '').trim();

  if (!token || !dbId) {
    return c.json({ error: 'Both Notion Integration Token and Database ID are required' }, 400);
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(dbId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  });

  const data = (await res.json().catch(() => ({}))) as NotionDatabaseResponse;
  if (!res.ok) {
    return c.json(
      { error: data.message || `Notion API error (HTTP ${res.status})` },
      502
    );
  }

  const dbTitle =
    data.title?.map((t) => t.plain_text || '').join('') || 'Untitled Notion Database';
  const propertyNames = Object.keys(data.properties || {});

  return c.json({
    success: true,
    data: {
      databaseId: data.id,
      title: dbTitle,
      properties: propertyNames,
    },
  });
});

// POST /api/integrations/notion/sync - Sync unsynced sources & highlights to Notion
app.post('/notion/sync', async (c) => {
  const settings = await getSettings(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as {
    notion_token?: string;
    notion_database_id?: string;
    force?: boolean;
  };

  const token = (body.notion_token || settings.notion_token || '').trim();
  const dbId = (body.notion_database_id || settings.notion_database_id || '').trim();

  if (!token || !dbId) {
    return c.json({ error: 'Notion Integration Token and Database ID are required' }, 400);
  }

  // Fetch database schema to locate title property name
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(dbId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  });
  const dbJson = (await dbRes.json().catch(() => ({}))) as NotionDatabaseResponse;
  if (!dbRes.ok) {
    return c.json(
      { error: dbJson.message || `Failed to read Notion database (HTTP ${dbRes.status})` },
      502
    );
  }

  let titlePropName = 'Name';
  const props = dbJson.properties || {};
  for (const [propKey, propDef] of Object.entries(props)) {
    if (propDef.type === 'title') {
      titlePropName = propKey;
      break;
    }
  }

  const { results: sources } = await c.env.DB.prepare(
    `SELECT * FROM sources WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 25`
  ).all<SourceRow>();

  let syncedCount = 0;
  let skippedCount = 0;

  for (const src of sources) {
    let metaObj: Record<string, unknown> = {};
    if (src.metadata) {
      try {
        metaObj = JSON.parse(src.metadata) as Record<string, unknown>;
      } catch {
        metaObj = {};
      }
    }

    if (!body.force && typeof metaObj.notion_page_id === 'string' && metaObj.notion_page_id) {
      skippedCount++;
      continue;
    }

    const { results: highlights } = await c.env.DB.prepare(
      `SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
       FROM highlights h
       JOIN sources s ON s.id = h.source_id
       WHERE h.source_id = ? AND h.deleted = 0
       ORDER BY h.created_at ASC
       LIMIT 40`
    )
      .bind(src.id)
      .all<HighlightWithSource>();

    const children: Array<Record<string, unknown>> = [];

    if (src.author || src.url) {
      children.push({
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: [
                  src.author ? `Author: ${src.author}` : null,
                  `Type: ${src.type}`,
                  src.url ? `URL: ${src.url}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              },
            },
          ],
        },
      });
    }

    if (src.source_notes && src.source_notes.trim()) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: 'Source Notes' } }],
        },
      });
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: src.source_notes.slice(0, 1900) } }],
        },
      });
    }

    if (highlights.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: 'Highlights' } }],
        },
      });
      for (const h of highlights) {
        children.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: h.content.slice(0, 1900) } }],
          },
        });
        if (h.note) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                { type: 'text', text: { content: `Note: ${h.note.slice(0, 1900)}` } },
              ],
            },
          });
        }
      }
    }

    const pageProperties: Record<string, unknown> = {
      [titlePropName]: {
        title: [{ type: 'text', text: { content: src.name.slice(0, 200) } }],
      },
    };

    if (props.Author?.type === 'rich_text' && src.author) {
      pageProperties.Author = {
        rich_text: [{ type: 'text', text: { content: src.author.slice(0, 200) } }],
      };
    }
    if (props.Type?.type === 'select') {
      pageProperties.Type = { select: { name: src.type } };
    }
    if (props.URL?.type === 'url' && src.url) {
      pageProperties.URL = { url: src.url };
    }

    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: pageProperties,
        children: children.slice(0, 95),
      }),
    });

    const pageData = (await createRes.json().catch(() => ({}))) as NotionPageResponse;
    if (!createRes.ok) {
      return c.json(
        {
          error: pageData.message || `Notion page creation failed (HTTP ${createRes.status})`,
          syncedCount,
        },
        502
      );
    }

    metaObj.notion_page_id = pageData.id;
    metaObj.notion_synced_at = new Date().toISOString();
    await c.env.DB.prepare(`UPDATE sources SET metadata = ? WHERE id = ?`)
      .bind(JSON.stringify(metaObj), src.id)
      .run();

    syncedCount++;
  }

  return c.json({
    success: true,
    data: {
      syncedCount,
      skippedCount,
      databaseTitle: dbJson.title?.map((t) => t.plain_text || '').join('') || 'Notion DB',
    },
  });
});

export default app;
