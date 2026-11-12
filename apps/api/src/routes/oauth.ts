import { Hono } from 'hono';
import { Bindings } from '../types';

const memoryKv = new Map<string, string>();

async function getKv(env: Bindings, key: string): Promise<string | null> {
  if (env.OAUTH_KV) {
    try {
      return await env.OAUTH_KV.get(key);
    } catch {
      // fallback to memory
    }
  }
  return memoryKv.get(key) || null;
}

async function putKv(env: Bindings, key: string, value: string, ttlSeconds?: number): Promise<void> {
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

async function deleteKv(env: Bindings, key: string): Promise<void> {
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

export async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyOAuthToken(env: Bindings, token: string): Promise<boolean> {
  if (!token) return false;
  const tokenData = await getKv(env, `token:${token}`);
  if (!tokenData) return false;
  try {
    const payload = JSON.parse(tokenData);
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      await deleteKv(env, `token:${token}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const app = new Hono<{ Bindings: Bindings }>();

// 1. RFC 9728 Protected Resource Metadata
app.get('/.well-known/oauth-protected-resource', (c) => {
  const url = new URL(c.req.url);
  const origin = url.origin;
  return c.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['read', 'write', 'mcp'],
    bearer_methods_supported: ['header'],
    resource_name: 'Mnema MCP Server',
  });
});

app.get('/.well-known/oauth-protected-resource/api/mcp', (c) => {
  const url = new URL(c.req.url);
  const origin = url.origin;
  return c.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['read', 'write', 'mcp'],
    bearer_methods_supported: ['header'],
    resource_name: 'Mnema MCP Server',
  });
});

// 2. RFC 8414 Authorization Server Metadata
app.get('/.well-known/oauth-authorization-server', (c) => {
  const url = new URL(c.req.url);
  const origin = url.origin;
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    revocation_endpoint: `${origin}/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['read', 'write', 'mcp'],
  });
});

// 3. RFC 7591 Dynamic Client Registration
app.post('/register', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const clientId = `mnema_client_${crypto.randomUUID().replace(/-/g, '')}`;
  const clientSecret = `mnema_sec_${crypto.randomUUID().replace(/-/g, '')}`;
  const clientData = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: body.client_name || 'AI Assistant Client',
    redirect_uris: Array.isArray(body.redirect_uris)
      ? body.redirect_uris
      : typeof body.redirect_uris === 'string'
      ? [body.redirect_uris]
      : [],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: body.token_endpoint_auth_method || 'none',
    created_at: new Date().toISOString(),
  };

  await putKv(c.env, `client:${clientId}`, JSON.stringify(clientData));

  return c.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientData.client_name,
      redirect_uris: clientData.redirect_uris,
      grant_types: clientData.grant_types,
      response_types: clientData.response_types,
      token_endpoint_auth_method: clientData.token_endpoint_auth_method,
    },
    201
  );
});

function escapeAttr(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Render sleek PIN authorization HTML
function renderAuthorizeHtml(params: {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  clientName?: string;
  error?: string;
}) {
  const clientLabel = escapeAttr(params.clientName || (params.clientId ? params.clientId.slice(0, 18) + '...' : 'AI Client'));
  const errorHtml = params.error
    ? `<div class="error-msg">${escapeAttr(params.error)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize MCP — Mnema</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --primary: #0d9488;
      --primary-hover: #0f766e;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Figtree', sans-serif; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      width: 100%;
      max-width: 440px;
      padding: 2.5rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(13, 148, 136, 0.15);
      color: #2dd4bf;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      border: 1px solid rgba(45, 212, 191, 0.2);
    }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.5rem; }
    .client-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      padding: 0.85rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.825rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .client-box span { color: #e2e8f0; font-weight: 600; }
    label { display: block; font-size: 0.775rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
      margin-bottom: 1.5rem;
    }
    input[type="password"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
    }
    button {
      width: 100%;
      padding: 0.85rem;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 0.75rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: var(--primary-hover); }
    .error-msg {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.825rem;
      margin-bottom: 1.25rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Mnema OAuth 2.1
    </div>
    <h1>Connect AI Assistant</h1>
    <p>Grant permission to access your private highlights, articles, and semantic library.</p>
    
    <div class="client-box">
      <span>Application</span>
      <code>${clientLabel}</code>
    </div>

    ${errorHtml}

    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}" />
      <input type="hidden" name="response_type" value="${escapeAttr(params.responseType || 'code')}" />
      <input type="hidden" name="state" value="${escapeAttr(params.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.codeChallengeMethod || 'S256')}" />
      <input type="hidden" name="scope" value="${escapeAttr(params.scope || 'mcp')}" />

      <label for="pin">Secret PIN / Passphrase</label>
      <input type="password" id="pin" name="pin" placeholder="Enter your Mnema access PIN" autofocus required />

      <button type="submit">Authorize Connection</button>
    </form>
  </div>
</body>
</html>`;
}

interface RegisteredClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris?: string[];
}

async function getRegisteredClient(env: Bindings, clientId: string): Promise<RegisteredClient | null> {
  if (!clientId) return null;
  const rawClient = await getKv(env, `client:${clientId}`);
  if (!rawClient) return null;
  try {
    return JSON.parse(rawClient) as RegisteredClient;
  } catch {
    return null;
  }
}

async function validateClientRedirectUri(
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

// 4. Authorization endpoint - GET
app.get('/authorize', async (c) => {
  const clientId = c.req.query('client_id') || '';
  const redirectUri = c.req.query('redirect_uri') || '';
  const responseType = c.req.query('response_type') || 'code';
  const state = c.req.query('state') || '';
  const codeChallenge = c.req.query('code_challenge') || '';
  const codeChallengeMethod = c.req.query('code_challenge_method') || 'S256';
  const scope = c.req.query('scope') || 'mcp';

  const validation = await validateClientRedirectUri(c.env, clientId, redirectUri);
  if (!validation.ok) {
    return c.json({ error: validation.error, error_description: validation.description }, 400);
  }

  const html = renderAuthorizeHtml({
    clientId,
    redirectUri,
    responseType,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
    clientName: validation.client.client_name,
  });

  return c.html(html);
});

function isPinConfigured(env: Bindings): boolean {
  return Boolean(env.MCP_PIN?.trim() || env.MCP_PIN_HASH?.trim() || env.AUTH_PIN_HASH?.trim());
}

// Helper to validate entered PIN against env variables (fails closed if unconfigured)
async function isValidPin(enteredPin: string, env: Bindings): Promise<boolean> {
  if (!enteredPin) return false;
  const trimmed = enteredPin.trim();

  if (env.MCP_PIN?.trim() && trimmed === env.MCP_PIN.trim()) {
    return true;
  }

  const targetHash = (env.MCP_PIN_HASH || env.AUTH_PIN_HASH)?.trim();
  if (targetHash) {
    const hex = await sha256Hex(trimmed);
    return hex.toLowerCase() === targetHash.toLowerCase();
  }

  return false;
}

// 5. Authorization endpoint - POST
app.post('/authorize', async (c) => {
  if (!isPinConfigured(c.env)) {
    return c.json(
      {
        error: 'server_error',
        error_description: 'OAuth PIN is not configured on the server',
      },
      500
    );
  }

  let body: Record<string, string> = {};
  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/json')) {
    body = (await c.req.json()) as Record<string, string>;
  } else {
    body = (await c.req.parseBody()) as Record<string, string>;
  }

  const pin = body.pin || '';
  const clientId = body.client_id || '';
  const redirectUri = body.redirect_uri || '';
  const state = body.state || '';
  const codeChallenge = body.code_challenge || '';
  const codeChallengeMethod = body.code_challenge_method || 'S256';
  const scope = body.scope || 'mcp';

  const validation = await validateClientRedirectUri(c.env, clientId, redirectUri);
  if (!validation.ok) {
    return c.json({ error: validation.error, error_description: validation.description }, 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(redirectUri);
  } catch {
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri is invalid' }, 400);
  }

  const valid = await isValidPin(pin, c.env);
  if (!valid) {
    const html = renderAuthorizeHtml({
      clientId,
      redirectUri,
      responseType: body.response_type || 'code',
      state,
      codeChallenge,
      codeChallengeMethod,
      scope,
      clientName: validation.client.client_name,
      error: 'Invalid PIN or Passphrase. Please try again.',
    });
    return c.html(html, 401);
  }

  // Generate authorization code
  const authCode = `auth_${crypto.randomUUID().replace(/-/g, '')}`;
  const codeData = {
    code: authCode,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    createdAt: Date.now(),
    expiresAt: Date.now() + 600 * 1000, // 10 minutes
  };

  await putKv(c.env, `code:${authCode}`, JSON.stringify(codeData), 600);

  targetUrl.searchParams.set('code', authCode);
  if (state) {
    targetUrl.searchParams.set('state', state);
  }

  return c.redirect(targetUrl.toString(), 302);
});

// 6. Token exchange endpoint - POST /token
app.post('/token', async (c) => {
  let body: Record<string, string> = {};
  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/json')) {
    body = (await c.req.json()) as Record<string, string>;
  } else {
    body = (await c.req.parseBody()) as Record<string, string>;
  }

  const grantType = body.grant_type;

  if (grantType === 'authorization_code') {
    const code = body.code;
    const codeVerifier = body.code_verifier;
    let clientId = body.client_id;

    // Check Basic Auth header if clientId not in body (RFC 6749 Section 2.3.1)
    const authHeader = c.req.header('authorization') || '';
    if (!clientId && authHeader.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = atob(authHeader.slice(6).trim());
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          clientId = decodeURIComponent(decoded.slice(0, colonIdx));
        }
      } catch {}
    }

    const redirectUri = body.redirect_uri;

    if (!code) {
      return c.json({ error: 'invalid_request', error_description: 'code is required' }, 400);
    }

    if (!redirectUri) {
      return c.json({ error: 'invalid_request', error_description: 'redirect_uri is required' }, 400);
    }

    const rawCode = await getKv(c.env, `code:${code}`);
    if (!rawCode) {
      return c.json({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' }, 400);
    }

    let codeData: any = {};
    try {
      codeData = JSON.parse(rawCode);
    } catch {
      return c.json({ error: 'invalid_grant', error_description: 'Malformed code metadata' }, 400);
    }

    // Verify expiration
    if (Date.now() > (codeData.expiresAt || 0)) {
      await deleteKv(c.env, `code:${code}`);
      return c.json({ error: 'invalid_grant', error_description: 'Authorization code has expired' }, 400);
    }

    // Verify client_id matches the authorization code
    const effectiveClientId = clientId || codeData.clientId;
    if (!effectiveClientId || (codeData.clientId && clientId !== codeData.clientId)) {
      return c.json({ error: 'invalid_grant', error_description: 'client_id does not match authorization code' }, 400);
    }

    // Strictly verify redirect_uri matches both the authorization code and registered client redirect_uris
    if (!codeData.redirectUri || codeData.redirectUri !== redirectUri) {
      return c.json({ error: 'invalid_grant', error_description: 'redirect_uri does not match authorization code' }, 400);
    }

    const clientValidation = await validateClientRedirectUri(c.env, effectiveClientId, redirectUri);
    if (!clientValidation.ok) {
      return c.json({ error: 'invalid_grant', error_description: clientValidation.description }, 400);
    }

    // Verify PKCE if code_challenge exists
    if (codeData.codeChallenge) {
      if (!codeVerifier) {
        return c.json({ error: 'invalid_request', error_description: 'code_verifier required for PKCE' }, 400);
      }

      if (codeData.codeChallengeMethod === 'S256') {
        const calculatedChallenge = await sha256Base64Url(codeVerifier);
        if (calculatedChallenge !== codeData.codeChallenge) {
          return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
        }
      } else if (codeData.codeChallengeMethod === 'plain') {
        if (codeVerifier !== codeData.codeChallenge) {
          return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
        }
      }
    }

    // Delete used code
    await deleteKv(c.env, `code:${code}`);

    const accessToken = `mnema_mcp_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const refreshToken = `mnema_ref_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const expiresIn = 2592000; // 30 days

    const tokenPayload = {
      accessToken,
      clientId: clientId || codeData.clientId,
      scope: codeData.scope || 'mcp',
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };

    await putKv(c.env, `token:${accessToken}`, JSON.stringify(tokenPayload), expiresIn);
    await putKv(
      c.env,
      `refresh:${refreshToken}`,
      JSON.stringify({ ...tokenPayload, refreshToken }),
      expiresIn * 3 // 90 days
    );

    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: codeData.scope || 'mcp',
    });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = body.refresh_token;
    if (!refreshToken) {
      return c.json({ error: 'invalid_request', error_description: 'refresh_token is required' }, 400);
    }

    const rawRefresh = await getKv(c.env, `refresh:${refreshToken}`);
    if (!rawRefresh) {
      return c.json({ error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
    }

    let refreshData: any = {};
    try {
      refreshData = JSON.parse(rawRefresh);
    } catch {
      return c.json({ error: 'invalid_grant', error_description: 'Malformed refresh token' }, 400);
    }

    const newAccessToken = `mnema_mcp_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const expiresIn = 2592000;

    const tokenPayload = {
      accessToken: newAccessToken,
      clientId: refreshData.clientId,
      scope: refreshData.scope || 'mcp',
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };

    await putKv(c.env, `token:${newAccessToken}`, JSON.stringify(tokenPayload), expiresIn);

    return c.json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: refreshData.scope || 'mcp',
    });
  }

  return c.json({ error: 'unsupported_grant_type', error_description: `Grant type ${grantType} unsupported` }, 400);
});

// 7. Revoke endpoint - POST /revoke
app.post('/revoke', async (c) => {
  let body: Record<string, string> = {};
  try {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
      body = (await c.req.json()) as Record<string, string>;
    } else {
      body = (await c.req.parseBody()) as Record<string, string>;
    }
  } catch {}

  const token = body.token || c.req.query('token');
  if (token) {
    await deleteKv(c.env, `token:${token}`);
    await deleteKv(c.env, `refresh:${token}`);
  }

  return c.json({ status: 'revoked' });
});

export default app;
