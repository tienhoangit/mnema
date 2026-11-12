import { Hono } from 'hono';
import { Bindings } from '../types';
import { parseArticleFromUrl } from '../services/readability';
import { escapeHtml, sanitizeNewsletterHtml } from '../services/emailParser';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '../services/youtube';
import { verifyOAuthToken } from './oauth';
import { extractApiKeyFromHeaders, verifyApiKey } from '../middleware/apiKeyAuth';
import { indexHighlightVector, semanticSearchHighlights } from '../services/semantic';

const app = new Hono<{
  Bindings: Bindings;
  Variables: { apiKeyScopes?: string };
}>();

const MUTATING_MCP_TOOLS = new Set(['save_article', 'add_highlight']);

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
    const valid = await verifyOAuthToken(c.env, token);
    if (!valid) {
      const origin = new URL(c.req.url).origin;
      c.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
      );
      return c.json({ error: 'invalid_token', message: 'The access token is invalid or expired' }, 401);
    }
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

// List of available MCP tools
const MCP_TOOLS = [
  {
    name: 'search_library',
    description: 'Search articles, books, and YouTube transcripts in your Mnema library',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or phrases' },
        status: { type: 'string', enum: ['inbox', 'later', 'archive', 'all'], description: 'Filter by reading status' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_highlights',
    description: 'Retrieve saved highlights and quotes with notes and sources',
    inputSchema: {
      type: 'object',
      properties: {
        favorite_only: { type: 'boolean', description: 'Only return starred/favorite highlights' },
        limit: { type: 'number', description: 'Max number of highlights (default 20)' },
      },
    },
  },
  {
    name: 'save_article',
    description: 'Save a web article or YouTube link to your Mnema library',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Web URL of the article or YouTube video' },
        status: { type: 'string', enum: ['inbox', 'later'], description: 'Where to save (default inbox)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'add_highlight',
    description: 'Add a new highlight or note to an existing source in your library',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'string', description: 'ID of the source' },
        content: { type: 'string', description: 'The quote or highlight text' },
        note: { type: 'string', description: 'Optional personal note' },
      },
      required: ['source_id', 'content'],
    },
  },
  {
    name: 'search_semantic',
    description: 'Search highlights semantically using AI embeddings and conceptual similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Conceptual search query or phrase' },
        limit: { type: 'number', description: 'Maximum number of results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_tags',
    description: 'Add tags to a highlight or ensure tags exist in your Mnema library',
    inputSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag names to assign or create',
        },
        highlight_id: {
          type: 'string',
          description: 'Optional highlight ID to attach these tags to',
        },
        color: {
          type: 'string',
          description: 'Optional hex color for new tags (default #0d9488)',
        },
      },
      required: ['tags'],
    },
  },
];

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

    const apiKeyScopes = c.get('apiKeyScopes');
    if (apiKeyScopes && typeof name === 'string' && MUTATING_MCP_TOOLS.has(name)) {
      const scopes = apiKeyScopes
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!scopes.includes('write') && !scopes.includes('*')) {
        return c.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: 'API key lacks write scope' },
          },
          403
        );
      }
    }

    try {
      if (name === 'search_library') {
        const query = `%${args?.query || ''}%`;
        const { results } = await c.env.DB.prepare(
          `SELECT id, name, author, type, reading_status, word_count FROM sources WHERE deleted = 0 AND (name LIKE ? OR author LIKE ?) LIMIT 15`
        ).bind(query, query).all();

        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          },
        });
      }

      if (name === 'list_highlights') {
        const limit = args?.limit || 20;
        let sql = `SELECT h.id, h.content, h.note, h.favorite, s.name as source_name, s.author as source_author FROM highlights h JOIN sources s ON s.id = h.source_id WHERE h.deleted = 0`;
        if (args?.favorite_only) sql += ` AND h.favorite = 1`;
        sql += ` ORDER BY h.created_at DESC LIMIT ?`;

        const { results } = await c.env.DB.prepare(sql).bind(limit).all();
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          },
        });
      }

      if (name === 'save_article') {
        const url = typeof args?.url === 'string' ? args.url.trim() : '';
        if (!url || !/^https?:\/\//i.test(url)) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Valid http(s) url is required' },
          });
        }

        const status = args?.status === 'later' ? 'later' : 'inbox';
        const existingSource = await c.env.DB.prepare(
          `SELECT id, name, type, reading_status FROM sources WHERE url = ? AND deleted = 0 LIMIT 1`
        )
          .bind(url)
          .first<{ id: string; name: string; type: string; reading_status: string }>();

        if (existingSource) {
          return c.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      id: existingSource.id,
                      name: existingSource.name,
                      type: existingSource.type,
                      status: existingSource.reading_status,
                      deduplicated: true,
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
        }

        const sourceId = crypto.randomUUID();
        const now = new Date().toISOString();
        const ytId = extractYouTubeVideoId(url);
        let sourceType: 'article' | 'youtube' = ytId ? 'youtube' : 'article';
        let title = url;
        let author: string | null = null;
        let imageUrl: string | null = null;
        let contentHtml = '';
        let wordCount = 0;
        let readingTime = 1;
        const metadataObj: Record<string, unknown> = { saved_via: 'mcp' };

        if (ytId) {
          sourceType = 'youtube';
          imageUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
          metadataObj.youtube_id = ytId;
          try {
            const yt = await fetchYouTubeTranscript(ytId);
            title = yt.title || title;
            author = yt.author || null;
            metadataObj.transcript = yt.segments;
            wordCount = yt.segments.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
            readingTime = Math.max(1, Math.round(wordCount / 180));
          } catch {
            // Keep metadata fallback if transcript unavailable
          }
        } else {
          try {
            const article = await parseArticleFromUrl(url);
            title = article.title || title;
            author = article.byline || null;
            imageUrl = article.leadImageUrl || null;
            contentHtml = sanitizeNewsletterHtml(article.content || '');
            wordCount = article.wordCount;
            readingTime = article.readingTimeMinutes;
            metadataObj.site_name = article.siteName;
            metadataObj.excerpt = article.excerpt;
          } catch {
            const safeUrl = escapeHtml(url);
            contentHtml = `<p>Saved via MCP: <a href="${safeUrl}">${safeUrl}</a></p>`;
          }
        }

        await c.env.DB.prepare(
          `INSERT INTO sources (id, name, author, type, url, image_url, content_html, reading_status, word_count, reading_time, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            sourceId,
            title,
            author,
            sourceType,
            url,
            imageUrl,
            contentHtml,
            status,
            wordCount,
            readingTime,
            JSON.stringify(metadataObj),
            now,
            now
          )
          .run();

        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ id: sourceId, name: title, type: sourceType, status }, null, 2),
              },
            ],
          },
        });
      }

      if (name === 'add_highlight') {
        const hlId = crypto.randomUUID();
        const now = new Date().toISOString();
        await c.env.DB.prepare(
          `INSERT INTO highlights (id, source_id, content, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(hlId, args?.source_id, args?.content, args?.note || null, now, now).run();

        try {
          c.executionCtx.waitUntil(indexHighlightVector(c.env, hlId).catch(() => {}));
        } catch {}

        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Highlight added successfully with id: ${hlId}` }],
          },
        });
      }

      if (name === 'search_semantic') {
        const query = typeof args?.query === 'string' ? args.query.trim() : '';
        if (!query) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'query parameter is required' },
          });
        }
        const limit = typeof args?.limit === 'number' ? Math.max(1, Math.min(20, args.limit)) : 5;
        const searchRes = await semanticSearchHighlights(c.env, query, { limit });
        const matches = searchRes.highlights;

        const formatted = matches.map((m) => ({
          id: m.id,
          content: m.content,
          note: m.note,
          source_name: m.source_name,
          source_author: m.source_author,
          similarity: Number(m.similarity.toFixed(4)),
        }));

        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
          },
        });
      }

      if (name === 'add_tags') {
        const rawTags: string[] = Array.isArray(args?.tags) ? args.tags : [];
        if (rawTags.length === 0) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'tags array is required' },
          });
        }

        const highlightId = args?.highlight_id;
        const color = args?.color || '#0d9488';
        const now = new Date().toISOString();
        const savedTags: Array<{ id: string; name: string; color: string }> = [];

        for (const rawName of rawTags) {
          const cleanName = String(rawName).trim().toLowerCase();
          if (!cleanName) continue;

          let tag = await c.env.DB.prepare('SELECT id, name, color FROM tags WHERE name = ?').bind(cleanName).first<any>();
          if (!tag) {
            const tagId = crypto.randomUUID();
            await c.env.DB.prepare('INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').bind(tagId, cleanName, color, now).run();
            tag = (await c.env.DB.prepare('SELECT id, name, color FROM tags WHERE name = ?').bind(cleanName).first<any>()) || { id: tagId, name: cleanName, color };
          }
          savedTags.push(tag);

          if (highlightId) {
            await c.env.DB.prepare('INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)').bind(highlightId, tag.id).run();
          }
        }

        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    highlight_id: highlightId || null,
                    tags: savedTags,
                    message: highlightId
                      ? `Successfully attached ${savedTags.length} tags to highlight ${highlightId}`
                      : `Successfully ensured ${savedTags.length} tags in library`,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        });
      }

      return c.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool ${name} not recognized` },
      });
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
