import { Hono } from 'hono';
import { Bindings } from '../../types';
import { getKv, putKv, getClientIp } from './oauthStore';

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
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['read', 'write', 'mcp'],
  });
});

// 3. RFC 7591 Dynamic Client Registration
const REGISTER_MAX_PER_HOUR = 15;
const CLIENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

app.post('/register', async (c) => {
  const ip = getClientIp(c);
  const regRateKey = `ratelimit:register:${ip}`;
  const currentRegRaw = await getKv(c.env, regRateKey);
  const currentRegCount = currentRegRaw ? parseInt(currentRegRaw, 10) || 0 : 0;
  if (currentRegCount >= REGISTER_MAX_PER_HOUR) {
    return c.json(
      { error: 'too_many_requests', error_description: 'Client registration rate limit exceeded. Try again later.' },
      429
    );
  }
  await putKv(c.env, regRateKey, String(currentRegCount + 1), 3600);

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

  await putKv(c.env, `client:${clientId}`, JSON.stringify(clientData), CLIENT_TTL_SECONDS);

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

export default app;
