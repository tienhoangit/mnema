import { Hono } from 'hono';
import { Bindings } from '../../types';
import { verifyOAuthToken } from './oauth';
import { extractApiKeyFromHeaders, verifyApiKey } from '../../core/apiKeyAuth';
import { MCP_TOOLS, MUTATING_MCP_TOOLS, executeMcpTool } from './mcpTools';

export { MCP_TOOLS, MUTATING_MCP_TOOLS };

const app = new Hono<{
  Bindings: Bindings;
  Variables: { apiKeyScopes?: string; oauthScopes?: string };
}>();

// OAuth 2.1 + X-Api-Key Protection Middleware (mandatory by default; only bypassed when explicit local-dev flag is set)
app.use('*', async (c, next) => {
  const rawApiKey = extractApiKeyFromHeaders({
    xApiKey: c.req.header('X-Api-Key'),
    authorization: c.req.header('authorization'),
  });
  if (rawApiKey) {
    let execCtx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    try {
      execCtx = c.executionCtx;
    } catch {
      execCtx = undefined;
    }
    const validKey = await verifyApiKey(c.env, rawApiKey, execCtx);
    if (!validKey) {
      return c.json({ error: 'invalid_token', message: 'Invalid or revoked API key' }, 401);
    }
    c.set('apiKeyScopes', validKey.scopes);
    return next();
  }

  const authHeader = c.req.header('authorization') || '';
  if (/^bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^bearer\s+/i, '').trim();
    const oauthResult = await verifyOAuthToken(c.env, token);
    if (!oauthResult) {
      const origin = new URL(c.req.url).origin;
      c.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
      );
      return c.json({ error: 'invalid_token', message: 'The access token is invalid or expired' }, 401);
    }
    c.set('oauthScopes', oauthResult.scope);
  } else {
    const allowUnauth = c.env.ALLOW_UNAUTH_MCP === 'true' && c.env.REQUIRE_MCP_AUTH !== 'true';
    if (!allowUnauth) {
      const origin = new URL(c.req.url).origin;
      c.header(
        'WWW-Authenticate',
        `Bearer realm="OAuth", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
      );
      return c.json({ error: 'unauthorized', message: 'OAuth 2.1 authorization required' }, 401);
    }
  }
  await next();
});

// Stateless Streamable HTTP / Server Info
app.get('/', (c) => {
  return c.json({
    jsonrpc: '2.0',
    result: {
      name: 'mnema-mcp-server',
      version: '2.0.0',
      description: 'Mnema Personal Knowledge & Reading Assistant MCP Server',
      tools: MCP_TOOLS,
    },
  });
});

// MCP JSON-RPC 2.0 Handler
app.post('/', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  const { id, method, params } = body;

  if (method === 'initialize') {
    return c.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'mnema-mcp-server',
          version: '2.0.0',
        },
      },
    });
  }

  if (method === 'notifications/initialized') {
    return c.body(null, 204);
  }

  if (method === 'ping') {
    return c.json({
      jsonrpc: '2.0',
      id,
      result: {},
    });
  }

  if (method === 'tools/list') {
    return c.json({
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};

    const effectiveScopes = c.get('apiKeyScopes') ?? c.get('oauthScopes');
    if (effectiveScopes !== undefined && typeof name === 'string' && MUTATING_MCP_TOOLS.has(name)) {
      const scopes = effectiveScopes
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!scopes.includes('write') && !scopes.includes('*')) {
        return c.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: 'Token lacks write scope' },
          },
          403
        );
      }
    }

    let execCtx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    try {
      execCtx = c.executionCtx;
    } catch {
      execCtx = undefined;
    }

    try {
      const toolRes = await executeMcpTool(name, args, c.env, execCtx);
      if (toolRes.success) {
        return c.json({
          jsonrpc: '2.0',
          id,
          result: toolRes.result,
        });
      } else {
        return c.json({
          jsonrpc: '2.0',
          id,
          error: toolRes.error,
        });
      }
    } catch (err: any) {
      return c.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err.message },
      });
    }
  }

  return c.json({
    jsonrpc: '2.0',
    id,
    result: { status: 'MCP Server active', supportedMethods: ['initialize', 'ping', 'tools/list', 'tools/call'] },
  });
});

export interface McpHandlerOptions {
  requireAuth?: boolean;
}

/**
 * Creates stateless streamable HTTP MCP handler for Cloudflare Workers
 */
export function createMcpHandler(_options?: McpHandlerOptions) {
  return app;
}

export default app;
