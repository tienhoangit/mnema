import { Context, Next } from 'hono';
import { ApiKeyRow, Bindings } from '../types';
import { sha256Hex } from '../routes/oauth';

export type PublicApiKey = Omit<ApiKeyRow, 'key_hash'>;

export function extractApiKeyFromHeaders(headers: {
  xApiKey?: string | null;
  authorization?: string | null;
}): string | null {
  const xApiKey = headers.xApiKey?.trim();
  if (xApiKey) return xApiKey;

  const auth = headers.authorization?.trim() || '';
  if (/^bearer\s+mnema_live_/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return null;
}

export async function verifyApiKey(
  env: Bindings,
  rawKey: string,
  executionCtx?: { waitUntil?: (promise: Promise<unknown>) => void }
): Promise<PublicApiKey | null> {
  if (!rawKey || !env.DB) return null;

  const keyHash = await sha256Hex(rawKey);
  const row = await env.DB.prepare(
    `SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_at
     FROM api_keys
     WHERE key_hash = ? AND revoked_at IS NULL`
  )
    .bind(keyHash)
    .first<PublicApiKey>();

  if (!row) return null;

  const now = new Date().toISOString();
  const touchPromise = env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(now, row.id)
    .run()
    .catch(() => {});

  try {
    if (executionCtx && typeof executionCtx.waitUntil === 'function') {
      executionCtx.waitUntil(touchPromise);
    } else {
      await touchPromise;
    }
  } catch {
    await touchPromise;
  }

  return row;
}

const PUBLIC_API_PATHS = new Set(['/api', '/api/health']);

export async function apiKeyMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next
): Promise<Response | void> {
  const path = c.req.path;

  // Skip health checks, public shares, webhooks, and MCP (MCP validates X-Api-Key + OAuth itself)
  if (
    PUBLIC_API_PATHS.has(path) ||
    path.startsWith('/api/public/') ||
    path.startsWith('/api/webhooks/') ||
    path.startsWith('/api/mcp')
  ) {
    return next();
  }

  const rawKey = extractApiKeyFromHeaders({
    xApiKey: c.req.header('X-Api-Key'),
    authorization: c.req.header('Authorization'),
  });

  if (rawKey) {
    let execCtx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    try {
      execCtx = c.executionCtx;
    } catch {
      execCtx = undefined;
    }

    const validKey = await verifyApiKey(c.env, rawKey, execCtx);
    if (!validKey) {
      return c.json({ error: 'Invalid or revoked API key' }, 401);
    }

    // Enforce write scope on mutating methods if scopes are restricted
    const method = c.req.method.toUpperCase();
    const scopes = validKey.scopes
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isReadOnlyMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (!isReadOnlyMethod && !scopes.includes('write') && !scopes.includes('*')) {
      return c.json({ error: 'API key lacks write scope' }, 403);
    }

    return next();
  }

  if (c.env.REQUIRE_API_KEY === 'true') {
    return c.json(
      { error: 'API key required. Pass a valid key via X-Api-Key header.' },
      401
    );
  }

  return next();
}
