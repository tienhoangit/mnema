import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from './types';
// Feature routers
import sourcesRouter from './features/library/sources';
import highlightsRouter from './features/library/highlights';
import tagsRouter from './features/library/tags';
import shelvesRouter from './features/library/shelves';
import trashRouter from './features/library/trash';
import toolsRouter from './features/library/tools';
import sharesRouter, { publicShareRouter } from './features/library/shares';

import importRouter from './features/capture/import';
import rssRouter, { runScheduledRssSync } from './features/capture/rss';

import aiRouter from './features/ai/ai';
import searchRouter from './features/ai/search';
import { getActiveEmbeddingConfig, syncHighlightEmbeddings } from './features/ai/embeddings';

import reviewsRouter from './features/review/reviews';
import statsRouter from './features/review/stats';

import mcpRouter from './features/mcp/mcp';
import oauthRouter from './features/mcp/oauth';

import integrationsRouter from './features/integrations/integrations';
import webhooksRouter, { ingestNewsletterPayload } from './features/integrations/webhooks';
import emailRouter from './features/integrations/email';
import exportRouter from './features/integrations/export';
import apiKeysRouter from './features/integrations/apiKeys';
import { runScheduledDigest } from './features/integrations/emailService';

// Core
import { apiKeyMiddleware } from './core/apiKeyAuth';
import { checkWorkersAiBudget } from './core/helpers';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend and extensions
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (!origin) return undefined;
      if (origin.startsWith('chrome-extension://')) return origin;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
      const publicOriginRaw = c.env.PUBLIC_ORIGIN?.trim();
      if (publicOriginRaw) {
        try {
          if (origin === new URL(publicOriginRaw).origin) return origin;
        } catch {
          // ignore malformed PUBLIC_ORIGIN
        }
      }
      return undefined;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Mnema-Client',
      'X-Gemini-Key',
      'X-Webhook-Secret',
      'X-Telegram-Bot-Api-Secret-Token',
      'X-Api-Key',
    ],
  })
);

// Dynamic host-aware security headers and Content Security Policy middleware
app.use('*', async (c, next) => {
  try {
    await next();
  } finally {
    const host = c.req.header('host') || '';
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

    const connectSrc = isLocal
      ? "connect-src 'self' http://localhost:* http://127.0.0.1:* ws: wss: https:"
      : "connect-src 'self' https: wss:";

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      connectSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    c.res.headers.set('Content-Security-Policy', csp);
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }
});

// Health check
app.get('/api', (c) => c.json({ status: 'ok', name: 'Mnema API', version: '2.0.0' }));
app.get('/api/health', (c) => c.json({ status: 'ok', name: 'Mnema API', version: '2.0.0' }));

// Public REST API Key authentication middleware for /api/*
app.use('/api/*', apiKeyMiddleware);

// Mount sub-routers under /api
app.route('/', oauthRouter);
app.route('/api/sources', sourcesRouter);
app.route('/api/highlights', highlightsRouter);
app.route('/api/reviews', reviewsRouter);
app.route('/api/import', importRouter);
app.route('/api/tags', tagsRouter);
app.route('/api/ai', aiRouter);
app.route('/api/shelves', shelvesRouter);
app.route('/api/stats', statsRouter);
app.route('/api/mcp', mcpRouter);
app.route('/api/tools', toolsRouter);
app.route('/api/trash', trashRouter);
app.route('/api/search', searchRouter);
app.route('/api/email', emailRouter);
app.route('/api/rss', rssRouter);
app.route('/api/export', exportRouter);
app.route('/api/shares', sharesRouter);
app.route('/api/public/share', publicShareRouter);
app.route('/api/webhooks', webhooksRouter);
app.route('/api/integrations', integrationsRouter);
app.route('/api/keys', apiKeysRouter);

// Global fallback & 404 handler (SPA static assets or JSON error for API)
app.notFound(async (c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Endpoint not found' }, 404);
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

// Global Error handler
app.onError((err, c) => {
  console.error('Unhandled API Error:', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

export default {
  fetch: app.fetch,
  async email(
    message: { from: string; headers: Headers; raw: ReadableStream<Uint8Array> | string },
    env: Bindings,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const raw =
          typeof message.raw === 'string' ? message.raw : await new Response(message.raw).text();
        await ingestNewsletterPayload(env, {
          from: message.from,
          subject: message.headers.get('subject') || 'Newsletter',
          raw,
        });
      })()
    );
  },
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '*/10 * * * *') {
      ctx.waitUntil(
        (async () => {
          const config = await getActiveEmbeddingConfig(env);
          if (config.provider === 'local_trigram') {
            return;
          }
          if (config.provider === 'workers_ai') {
            const budget = await checkWorkersAiBudget(env);
            if (!budget.allowed) {
              console.warn(
                `Scheduled embedding paused: Workers AI daily budget reached (${budget.used}/${budget.limit} neurons).`
              );
              return;
            }
          }
          const res = await syncHighlightEmbeddings(env, { batchLimit: 30 });
          console.log('Scheduled embedding sync:', JSON.stringify(res));
        })().catch((err) => {
          console.error('Scheduled embedding sync error:', err);
        })
      );
      return;
    }

    const runDailyR2Backup = async () => {
      if (!env.EPUB_BUCKET) return;
      const dateStr = new Date().toISOString().split('T')[0];
      const backupKey = `backups/mnema-backup-${dateStr}.json`;
      const existing = await env.EPUB_BUCKET.head(backupKey);
      if (existing) return;

      const [sourcesRes, highlightsRes, tagsRes, highlightTagsRes, shelvesRes] = await Promise.all([
        env.DB.prepare(
          `SELECT id, name, author, type, url, image_url, reading_status, progress, word_count, reading_time, metadata, source_notes, deleted, created_at, updated_at FROM sources`
        ).all(),
        env.DB.prepare(`SELECT * FROM highlights`).all(),
        env.DB.prepare(`SELECT * FROM tags`).all(),
        env.DB.prepare(`SELECT * FROM highlight_tags`).all(),
        env.DB.prepare(`SELECT * FROM shelves`).all().catch(() => ({ results: [] })),
      ]);

      const snapshot = {
        version: 1,
        created_at: new Date().toISOString(),
        sources: sourcesRes.results,
        highlights: highlightsRes.results,
        tags: tagsRes.results,
        highlight_tags: highlightTagsRes.results,
        shelves: shelvesRes.results,
      };

      await env.EPUB_BUCKET.put(backupKey, JSON.stringify(snapshot), {
        httpMetadata: { contentType: 'application/json' },
      });
      console.log(`Scheduled R2 backup written: ${backupKey}`);
    };

    ctx.waitUntil(
      Promise.allSettled([
        runScheduledDigest(env).then((res) => {
          console.log('Scheduled digest check:', JSON.stringify(res));
        }),
        runScheduledRssSync(env.DB, 4).then((res) => {
          console.log('Scheduled RSS sync:', JSON.stringify(res));
        }),
        runDailyR2Backup(),
      ]).then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.error('Scheduled background task failed:', r.reason);
          }
        }
      })
    );
  },
};
