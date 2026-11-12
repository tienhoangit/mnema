import { Hono } from 'hono';
import { Bindings } from '../types';
import { sha256Hex } from './oauth';
import { PublicApiKey } from '../middleware/apiKeyAuth';

const app = new Hono<{ Bindings: Bindings }>();

function generateRawApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `mnema_live_${hex}`;
}

// GET /api/keys - List all API keys (never returns key_hash)
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_at
     FROM api_keys
     ORDER BY created_at DESC`
  ).all<PublicApiKey>();

  return c.json({ data: results || [] });
});

// POST /api/keys - Create a new API key (returns plaintext key once)
app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    scopes?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: 'API key name is required' }, 400);
  }
  if (name.length > 100) {
    return c.json({ error: 'API key name must be 100 characters or fewer' }, 400);
  }

  const rawScopes = (body.scopes || 'read,write')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === 'read' || s === 'write');
  const scopes = rawScopes.length > 0 ? Array.from(new Set(rawScopes)).join(',') : 'read,write';

  const id = crypto.randomUUID();
  const rawKey = generateRawApiKey();
  const keyPrefix = `${rawKey.slice(0, 18)}...`;
  const keyHash = await sha256Hex(rawKey);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, name, key_prefix, key_hash, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, name, keyPrefix, keyHash, scopes, now)
    .run();

  return c.json(
    {
      data: {
        id,
        name,
        key_prefix: keyPrefix,
        scopes,
        last_used_at: null,
        revoked_at: null,
        created_at: now,
        key: rawKey,
      },
    },
    201
  );
});

// DELETE /api/keys/:id - Revoke an API key
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    `SELECT id, revoked_at FROM api_keys WHERE id = ?`
  )
    .bind(id)
    .first<{ id: string; revoked_at: string | null }>();

  if (!existing) {
    return c.json({ error: 'API key not found' }, 404);
  }

  if (existing.revoked_at) {
    return c.json({ data: { id, revoked: true, alreadyRevoked: true } });
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();

  return c.json({ data: { id, revoked: true, revoked_at: now } });
});

export default app;

