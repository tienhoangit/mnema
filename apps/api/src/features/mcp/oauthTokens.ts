import { Hono } from 'hono';
import { Bindings } from '../../types';
import {
  getKv,
  putKv,
  deleteKv,
  sha256Base64Url,
  constantTimeEqual,
  getRegisteredClient,
  validateClientRedirectUri,
} from './oauthStore';

const app = new Hono<{ Bindings: Bindings }>();

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

  // Extract client credentials from Basic Auth or body (RFC 6749 Section 2.3)
  let reqClientId = body.client_id || '';
  let reqClientSecret = body.client_secret || '';
  const authHeader = c.req.header('authorization') || '';
  if (authHeader.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(authHeader.slice(6).trim());
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        if (!reqClientId) reqClientId = decodeURIComponent(decoded.slice(0, colonIdx));
        if (!reqClientSecret) reqClientSecret = decodeURIComponent(decoded.slice(colonIdx + 1));
      }
    } catch {}
  }

  if (grantType === 'authorization_code') {
    const code = body.code;
    const codeVerifier = body.code_verifier;
    const clientId = reqClientId;
    const redirectUri = body.redirect_uri;

    if (!code) {
      return c.json({ error: 'invalid_request', error_description: 'code is required' }, 400);
    }

    if (!redirectUri) {
      return c.json({ error: 'invalid_request', error_description: 'redirect_uri is required' }, 400);
    }

    const rawCode = await getKv(c.env, `code:${code}`);
    if (!rawCode) {
      // Idempotency grace cache for concurrent duplicate /token POSTs (e.g., ChatGPT Web)
      const cachedTokenRes = await getKv(c.env, `code_used:${code}`);
      if (cachedTokenRes) {
        try {
          return c.json(JSON.parse(cachedTokenRes));
        } catch {}
      }
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

    // Verify client_secret for confidential clients (or whenever client_secret is supplied)
    const authMethod = clientValidation.client.token_endpoint_auth_method || 'none';
    if (authMethod !== 'none' || reqClientSecret) {
      const expectedSecret = clientValidation.client.client_secret || '';
      const encoder = new TextEncoder();
      if (
        !reqClientSecret ||
        !expectedSecret ||
        !constantTimeEqual(encoder.encode(reqClientSecret), encoder.encode(expectedSecret))
      ) {
        return c.json({ error: 'invalid_client', error_description: 'Invalid client credentials' }, 401);
      }
    }

    // Require PKCE S256 verification
    if (!codeData.codeChallenge || codeData.codeChallengeMethod !== 'S256') {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE S256 challenge is required' }, 400);
    }
    if (!codeVerifier) {
      return c.json({ error: 'invalid_request', error_description: 'code_verifier required for PKCE' }, 400);
    }
    const calculatedChallenge = await sha256Base64Url(codeVerifier);
    if (calculatedChallenge !== codeData.codeChallenge) {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
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

    const responseBody = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: codeData.scope || 'mcp',
    };

    // Cache token response briefly under code_used:${code} so duplicate concurrent POSTs succeed idempotently
    await putKv(c.env, `code_used:${code}`, JSON.stringify(responseBody), 60);

    return c.json(responseBody);
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

    // Verify client_id & client_secret if confidential or provided
    if (reqClientId && refreshData.clientId && reqClientId !== refreshData.clientId) {
      return c.json({ error: 'invalid_grant', error_description: 'client_id does not match refresh token' }, 400);
    }
    const regClient = refreshData.clientId ? await getRegisteredClient(c.env, refreshData.clientId) : null;
    if (regClient) {
      const authMethod = regClient.token_endpoint_auth_method || 'none';
      if (authMethod !== 'none' || reqClientSecret) {
        const expectedSecret = regClient.client_secret || '';
        const encoder = new TextEncoder();
        if (
          !reqClientSecret ||
          !expectedSecret ||
          !constantTimeEqual(encoder.encode(reqClientSecret), encoder.encode(expectedSecret))
        ) {
          return c.json({ error: 'invalid_client', error_description: 'Invalid client credentials' }, 401);
        }
      }
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
