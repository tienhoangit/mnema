import { Hono } from 'hono';
import { Bindings, HighlightWithSource, SourceRow } from '../types';
import {
  askLibraryAi,
  ensureEmbeddingsTable,
  semanticSearchHighlights,
  syncHighlightEmbeddings,
} from '../services/semantic';

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/search - Fulltext search across sources, highlights, and notes
app.get('/', async (c) => {
  const query = c.req.query('q')?.trim() || '';
  const filterType = c.req.query('type') || 'all';

  if (!query) {
    return c.json({
      data: {
        sources: [],
        highlights: [],
        notes: [],
        total: 0,
      },
    });
  }

  const searchTerm = `%${query}%`;
  const ftsQuery = query
    .replace(/["*]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => `"${w}"*`)
    .join(' ');

  let sources: Array<SourceRow & { highlight_count: number }> = [];
  let highlights: HighlightWithSource[] = [];
  let notes: HighlightWithSource[] = [];

  if (['all', 'sources', 'book', 'article'].includes(filterType)) {
    let ftsSuccess = false;
    if (ftsQuery) {
      try {
        let ftsSql = `
          SELECT s.*,
            (SELECT COUNT(*) FROM highlights h WHERE h.source_id = s.id AND h.deleted = 0) as highlight_count
          FROM sources_fts fts
          JOIN sources s ON s.id = fts.id
          WHERE s.deleted = 0 AND sources_fts MATCH ?
        `;
        const ftsParams: string[] = [ftsQuery];
        if (filterType === 'book' || filterType === 'article') {
          ftsSql += ` AND s.type = ?`;
          ftsParams.push(filterType);
        }
        ftsSql += ` ORDER BY rank LIMIT 20`;
        const { results } = await c.env.DB.prepare(ftsSql)
          .bind(...ftsParams)
          .all<SourceRow & { highlight_count: number }>();
        if (results.length > 0) {
          sources = results;
          ftsSuccess = true;
        }
      } catch {
        ftsSuccess = false;
      }
    }

    if (!ftsSuccess) {
      let sourceSql = `
        SELECT s.*,
          (SELECT COUNT(*) FROM highlights h WHERE h.source_id = s.id AND h.deleted = 0) as highlight_count
        FROM sources s
        WHERE s.deleted = 0 AND (s.name LIKE ? OR s.author LIKE ? OR s.source_notes LIKE ?)
      `;
      const sourceParams: string[] = [searchTerm, searchTerm, searchTerm];

      if (filterType === 'book' || filterType === 'article') {
        sourceSql += ` AND s.type = ?`;
        sourceParams.push(filterType);
      }

      sourceSql += ` ORDER BY s.created_at DESC LIMIT 20`;
      const { results } = await c.env.DB.prepare(sourceSql)
        .bind(...sourceParams)
        .all<SourceRow & { highlight_count: number }>();
      sources = results;
    }
  }

  if (['all', 'highlights'].includes(filterType)) {
    let ftsSuccess = false;
    if (ftsQuery) {
      try {
        const { results } = await c.env.DB.prepare(`
          SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
          FROM highlights_fts fts
          JOIN highlights h ON h.id = fts.id
          JOIN sources s ON s.id = h.source_id
          WHERE h.deleted = 0 AND s.deleted = 0 AND highlights_fts MATCH ?
          ORDER BY rank LIMIT 30
        `)
          .bind(ftsQuery)
          .all<HighlightWithSource>();
        if (results.length > 0) {
          highlights = results;
          ftsSuccess = true;
        }
      } catch {
        ftsSuccess = false;
      }
    }

    if (!ftsSuccess) {
      const { results } = await c.env.DB.prepare(`
        SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
        FROM highlights h
        JOIN sources s ON s.id = h.source_id
        WHERE h.deleted = 0 AND s.deleted = 0 AND h.content LIKE ?
        ORDER BY h.created_at DESC LIMIT 30
      `)
        .bind(searchTerm)
        .all<HighlightWithSource>();
      highlights = results;
    }
  }

  if (['all', 'notes'].includes(filterType)) {
    let ftsSuccess = false;
    if (ftsQuery) {
      try {
        const { results } = await c.env.DB.prepare(`
          SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
          FROM highlights_fts fts
          JOIN highlights h ON h.id = fts.id
          JOIN sources s ON s.id = h.source_id
          WHERE h.deleted = 0 AND s.deleted = 0 AND h.note IS NOT NULL AND h.note != '' AND highlights_fts MATCH ?
          ORDER BY rank LIMIT 30
        `)
          .bind(ftsQuery)
          .all<HighlightWithSource>();
        if (results.length > 0) {
          notes = results;
          ftsSuccess = true;
        }
      } catch {
        ftsSuccess = false;
      }
    }

    if (!ftsSuccess) {
      const { results } = await c.env.DB.prepare(`
        SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type
        FROM highlights h
        JOIN sources s ON s.id = h.source_id
        WHERE h.deleted = 0 AND s.deleted = 0 AND h.note IS NOT NULL AND h.note != '' AND h.note LIKE ?
        ORDER BY h.updated_at DESC LIMIT 30
      `)
        .bind(searchTerm)
        .all<HighlightWithSource>();
      notes = results;
    }
  }

  return c.json({
    data: {
      sources,
      highlights,
      notes,
      total: sources.length + highlights.length + notes.length,
    },
  });
});

// GET /api/search/semantic & POST /api/search/semantic
async function handleSemanticSearch(
  query: string,
  limit: number,
  apiKey: string | undefined,
  env: Bindings
) {
  const result = await semanticSearchHighlights(env, query, {
    limit,
    customApiKey: apiKey,
  });

  return {
    highlights: result.highlights,
    model: result.model,
    provider: result.provider,
    total: result.highlights.length,
  };
}

app.get('/semantic', async (c) => {
  const query = c.req.query('q')?.trim() || '';
  const limit = Math.min(40, Math.max(1, Number(c.req.query('limit') || '15')));
  const apiKey = c.req.header('X-Gemini-Key') || undefined;

  if (!query) {
    return c.json({
      data: { highlights: [], model: 'none', provider: 'local_trigram', total: 0 },
    });
  }

  const data = await handleSemanticSearch(query, limit, apiKey, c.env);
  return c.json({ data });
});

app.post('/semantic', async (c) => {
  const body = (await c.req.json()) as {
    q?: string;
    query?: string;
    limit?: number;
    apiKey?: string;
  };
  const query = (body.q || body.query || '').trim();
  const limit = Math.min(40, Math.max(1, Number(body.limit || 15)));
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  if (!query) {
    return c.json({
      data: { highlights: [], model: 'none', provider: 'local_trigram', total: 0 },
    });
  }

  const data = await handleSemanticSearch(query, limit, apiKey, c.env);
  return c.json({ data });
});

// POST /api/search/embeddings/sync - Index library highlights for semantic search
app.post('/embeddings/sync', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    apiKey?: string;
    batchLimit?: number;
  };
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');
  const result = await syncHighlightEmbeddings(c.env, {
    customApiKey: apiKey,
    batchLimit: body.batchLimit,
  });

  return c.json({ success: true, data: result });
});

// GET /api/search/embeddings/status - Check how many highlights are indexed
app.get('/embeddings/status', async (c) => {
  await ensureEmbeddingsTable(c.env.DB);
  const totalRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM highlights h JOIN sources s ON s.id = h.source_id WHERE h.deleted = 0 AND s.deleted = 0`
  ).first<{ count: number }>();

  const indexedRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, MAX(model) as model, MAX(updated_at) as updated_at FROM embeddings WHERE target_type = 'highlight'`
  ).first<{ count: number; model: string | null; updated_at: string | null }>();

  return c.json({
    data: {
      totalHighlights: totalRes?.count || 0,
      indexedHighlights: indexedRes?.count || 0,
      model: indexedRes?.model || null,
      lastIndexedAt: indexedRes?.updated_at || null,
    },
  });
});

// GET /api/search/similar/:highlightId - Find semantically similar highlights (used in Daily Review)
app.get('/similar/:highlightId', async (c) => {
  const highlightId = c.req.param('highlightId');
  const apiKey = c.req.header('X-Gemini-Key');

  const target = await c.env.DB.prepare(
    `SELECT content, note FROM highlights WHERE id = ? AND deleted = 0`
  )
    .bind(highlightId)
    .first<{ content: string; note: string | null }>();

  if (!target) {
    return c.json({ error: 'Highlight not found' }, 404);
  }

  const queryText = `${target.content} ${target.note || ''}`.trim();
  const result = await semanticSearchHighlights(c.env, queryText, {
    limit: 6,
    customApiKey: apiKey,
  });

  const similar = result.highlights.filter((h) => h.id !== highlightId).slice(0, 4);
  return c.json({
    data: {
      similar,
      model: result.model,
      provider: result.provider,
    },
  });
});

// POST /api/search/ask - Ask question across the user's entire library with AI synthesis
app.post('/ask', async (c) => {
  const body = (await c.req.json()) as { question?: string; apiKey?: string };
  const question = body.question?.trim();
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  if (!question) {
    return c.json({ error: 'Question is required' }, 400);
  }

  try {
    const data = await askLibraryAi(c.env, question, {
      limit: 12,
      customApiKey: apiKey,
    });
    return c.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Library AI query failed';
    return c.json({ error: msg }, 500);
  }
});

export default app;
