import { Hono } from 'hono';
import { Bindings } from '../../types';
import { renderAuthorizeHtml } from './oauthHtml';
import {
  getKv,
  putKv,
  deleteKv,
  sha256Base64Url,
  sha256Hex,
  verifyOAuthToken,
  validateClientRedirectUri,
  getClientIp,
  parseCookie,
  AUTH_MAX_FAILURES,
  AUTH_WINDOW_SECONDS,
  CSRF_COOKIE_NAME,
} from './oauthStore';
import oauthMetadataApp from './oauthMetadata';
import oauthTokensApp from './oauthTokens';

export { sha256Base64Url, sha256Hex, verifyOAuthToken };

const app = new Hono<{ Bindings: Bindings }>();

// Mount RFC 9728, RFC 8414 metadata and RFC 7591 dynamic client registration
app.route('/', oauthMetadataApp);

// Mount RFC 6749 token exchange and RFC 7009 revocation
app.route('/', oauthTokensApp);

function isPinConfigured(env: Bindings): boolean {
  return Boolean(env.MCP_PIN?.trim() || env.MCP_PIN_HASH?.trim() || env.AUTH_PIN_HASH?.trim());
}

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

  // Issue CSRF token for the consent form submission
  const csrfToken = `csrf_${crypto.randomUUID().replace(/-/g, '')}`;
  const ip = getClientIp(c);
  await putKv(c.env, `csrf:${csrfToken}`, JSON.stringify({ ip, clientId, createdAt: Date.now() }), 900);

  c.header('Set-Cookie', `${CSRF_COOKIE_NAME}=${csrfToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`);

  const html = renderAuthorizeHtml({
    clientId,
    redirectUri,
    responseType,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
    clientName: validation.client.client_name,
    csrfToken,
  });

  return c.html(html);
});

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

  const ip = getClientIp(c);
  const failKey = `authfail:${ip}`;
  const failCountRaw = await getKv(c.env, failKey);
  const failCount = failCountRaw ? parseInt(failCountRaw, 10) || 0 : 0;
  if (failCount >= AUTH_MAX_FAILURES) {
    return c.text('Too many failed authorization attempts. Please try again in 15 minutes.', 429);
  }

  const recordAuthFailure = async () => {
    const next = failCount + 1;
    await putKv(c.env, failKey, String(next), AUTH_WINDOW_SECONDS);
  };

  let body: Record<string, string> = {};
  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/json')) {
    body = (await c.req.json()) as Record<string, string>;
  } else {
    body = (await c.req.parseBody()) as Record<string, string>;
  }

  let formCsrf = '';
  const isFormPost = contentType.includes('application/x-www-form-urlencoded');
  if (isFormPost) {
    formCsrf = body.csrf_token || '';
    const cookieCsrf = parseCookie(c.req.header('cookie'), CSRF_COOKIE_NAME);
    if (!formCsrf || !cookieCsrf || formCsrf !== cookieCsrf) {
      return c.text('CSRF validation failed. Please reload the authorization page and try again.', 403);
    }
    const csrfStored = await getKv(c.env, `csrf:${formCsrf}`);
    if (!csrfStored) {
      return c.text('CSRF token expired. Please reload and try again.', 403);
    }
    await deleteKv(c.env, `csrf:${formCsrf}`);
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
    await recordAuthFailure();
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
      csrfToken: formCsrf,
    });
    return c.html(html, 401);
  }

  if (failCount > 0) {
    await deleteKv(c.env, failKey);
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

export default app;
