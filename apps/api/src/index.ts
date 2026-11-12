import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from './types';
import sourcesRouter from './routes/sources';
import highlightsRouter from './routes/highlights';
import reviewsRouter from './routes/reviews';
import importRouter from './routes/import';
import tagsRouter from './routes/tags';
import aiRouter from './routes/ai';
import shelvesRouter from './routes/shelves';
import statsRouter from './routes/stats';
import mcpRouter from './routes/mcp';
import toolsRouter from './routes/tools';
import trashRouter from './routes/trash';
import searchRouter from './routes/search';
import emailRouter from './routes/email';
import rssRouter from './routes/rss';
import exportRouter from './routes/export';
import sharesRouter, { publicShareRouter } from './routes/shares';
import webhooksRouter from './routes/webhooks';
import integrationsRouter from './routes/integrations';
import oauthRouter from './routes/oauth';
import { runScheduledDigest } from './services/email';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend and extensions
app.use(
  '*',
  cors({
    origin: '*',
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

// Auto-ensure legacy prev_state column
let schemaMigrated = false;
app.use('*', async (c, next) => {
  if (!schemaMigrated && c.env.DB) {
    try {
      await c.env.DB.prepare('ALTER TABLE reviews_log ADD COLUMN prev_state TEXT').run();
    } catch {
      // already exists
    }
    schemaMigrated = true;
  }
  await next();
});

// Health check
app.get('/api', (c) => c.json({ status: 'ok', name: 'Mnema API', version: '2.0.0' }));
app.get('/api/health', (c) => c.json({ status: 'ok', name: 'Mnema API', version: '2.0.0' }));

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
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduledDigest(env).then((res) => {
        console.log('Scheduled digest check:', JSON.stringify(res));
      })
    );
  },
};
