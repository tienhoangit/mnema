import { Bindings } from '../../types';

const memoryKv = new Map<string, string>();

export async function getKv(env: Bindings, key: string): Promise<string | null> {
  if (env.OAUTH_KV) {
    try {
      return await env.OAUTH_KV.get(key);
    } catch {
      // fallback to memory
    }
  }
  return memoryKv.get(key) || null;
}

export async function putKv(env: Bindings, key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (env.OAUTH_KV) {
    try {
      await env.OAUTH_KV.put(key, value, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
      return;
    } catch {
      // fallback to memory
    }
  }
  memoryKv.set(key, value);
}

export async function deleteKv(env: Bindings, key: string): Promise<void> {
  if (env.OAUTH_KV) {
    try {
      await env.OAUTH_KV.delete(key);
      return;
    } catch {
      // fallback to memory
    }
  }
  memoryKv.delete(key);
}

export async function sha256Base64Url(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const subtleAny = crypto.subtle as unknown as {
    timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
  };
  if (typeof subtleAny.timingSafeEqual === 'function') {
    return subtleAny.timingSafeEqual(a, b);
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('cf-connecting-ip')?.trim() ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

export async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyOAuthToken(
  env: Bindings,
  token: string
): Promise<{ valid: true; scope: string } | null> {
  if (!token) return null;
  const tokenData = await getKv(env, `token:${token}`);
  if (!tokenData) return null;
  try {
    const payload = JSON.parse(tokenData) as { expiresAt?: number; scope?: string };
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      await deleteKv(env, `token:${token}`);
      return null;
    }
    return { valid: true, scope: payload.scope || 'mcp' };
  } catch {
    return null;
  }
}

export interface RegisteredClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
}

export async function getRegisteredClient(env: Bindings, clientId: string): Promise<RegisteredClient | null> {
  if (!clientId) return null;
  const rawClient = await getKv(env, `client:${clientId}`);
  if (!rawClient) return null;
  try {
    return JSON.parse(rawClient) as RegisteredClient;
  } catch {
    return null;
  }
}

export async function validateClientRedirectUri(
  env: Bindings,
  clientId: string,
  redirectUri: string
): Promise<{ ok: true; client: RegisteredClient } | { ok: false; error: string; description: string }> {
  if (!clientId) {
    return { ok: false, error: 'invalid_request', description: 'client_id is required' };
  }
  if (!redirectUri) {
    return { ok: false, error: 'invalid_request', description: 'redirect_uri is required' };
  }
  const client = await getRegisteredClient(env, clientId);
  if (!client) {
    return { ok: false, error: 'invalid_client', description: 'Unknown or unregistered client_id' };
  }
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
    return {
      ok: false,
      error: 'invalid_request',
      description: 'redirect_uri does not match any registered redirect_uris for this client_id',
    };
  }
  return { ok: true, client };
}

export const AUTH_MAX_FAILURES = 8;
export const AUTH_WINDOW_SECONDS = 900; // 15 minutes
export const CSRF_COOKIE_NAME = 'mnema_oauth_csrf';
