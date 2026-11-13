import { Bindings, HighlightWithSource } from '../../types';
import { buildFtsPrefixQuery, toAsciiVietnamese } from '../../core/text';
import { resolveGeminiKey } from '../../core/helpers';
import {
  buildLocalSemanticVector,
  computeContentHash,
  cosineSimilarity,
  ensureEmbeddingsTable,
  generateEmbedding,
  EmbeddingProvider,
} from './embeddings';

export interface SemanticHighlightMatch extends HighlightWithSource {
  similarity: number;
}

export async function semanticSearchHighlights(
  env: Bindings,
  query: string,
  options: { limit?: number; customApiKey?: string } = {}
): Promise<{
  highlights: SemanticHighlightMatch[];
  model: string;
  provider: EmbeddingProvider;
}> {
  await ensureEmbeddingsTable(env.DB);
  const limit = Math.min(40, Math.max(1, options.limit || 20));
  const queryEmbedding = await generateEmbedding(query, env, options.customApiKey);

  // Keyword boost tokens (accent-insensitive for Vietnamese + English)
  const queryWords = toAsciiVietnamese(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Primary path: Cloudflare Vectorize (O(1) ANN query, no full-table D1 scan)
  if (env.VECTORIZE && queryEmbedding.provider !== 'local_trigram') {
    try {
      const topK = Math.min(40, Math.max(limit * 2, 20));
      const vRes = await env.VECTORIZE.query(queryEmbedding.vector, {
        topK,
        returnMetadata: 'all',
      });

      const matches = vRes.matches || [];
      if (matches.length === 0) {
        return {
          highlights: [],
          model: queryEmbedding.model,
          provider: queryEmbedding.provider,
        };
      }

      const scoreById = new Map<string, number>();
      const orderedIds: string[] = [];
      for (const m of matches) {
        const hlId =
          typeof m.metadata?.highlightId === 'string' ? m.metadata.highlightId : m.id;
        if (!scoreById.has(hlId)) {
          scoreById.set(hlId, m.score);
          orderedIds.push(hlId);
        }
      }

      const placeholders = orderedIds.map(() => '?').join(',');
      const { results: matchedRows } = await env.DB.prepare(`
        SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url
        FROM highlights h
        JOIN sources s ON s.id = h.source_id
        WHERE h.deleted = 0 AND s.deleted = 0 AND h.id IN (${placeholders})
      `)
        .bind(...orderedIds)
        .all<HighlightWithSource>();

      const scored: SemanticHighlightMatch[] = matchedRows.map((row) => {
        const sim = Math.max(0, scoreById.get(row.id) ?? 0);
        const lowerCombined = toAsciiVietnamese(
          `${row.content} ${row.note || ''} ${row.source_name} ${row.source_author || ''}`
        ).toLowerCase();
        let keywordBoost = 0;
        if (queryWords.length > 0) {
          const hits = queryWords.filter((w) => lowerCombined.includes(w)).length;
          keywordBoost = (hits / queryWords.length) * 0.25;
        }
        const combinedScore = Math.min(1, Math.max(0, sim * 0.85 + keywordBoost));
        return {
          ...row,
          similarity: Math.round(combinedScore * 100),
        };
      });

      scored.sort((a, b) => b.similarity - a.similarity);

      return {
        highlights: scored.slice(0, limit),
        model: queryEmbedding.model,
        provider: queryEmbedding.provider,
      };
    } catch (err) {
      console.warn('Vectorize query failed, falling back to D1 scan:', err);
    }
  }

  // Fallback path (when env.VECTORIZE is undefined in local dev or query failed)
  // Bound D1 scan via FTS5 pre-filter + LIMIT so memory/CPU stay safe at 5,000+ highlights
  type FallbackRow = HighlightWithSource & {
    cached_embedding: string | null;
    cached_model: string | null;
    cached_hash: string | null;
  };
  let rows: FallbackRow[] = [];
  const ftsQuery = buildFtsPrefixQuery(query);
  if (ftsQuery) {
    try {
      const ftsRes = await env.DB.prepare(`
        SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url,
          e.embedding as cached_embedding, e.model as cached_model, e.content_hash as cached_hash
        FROM highlights h
        JOIN sources s ON s.id = h.source_id
        LEFT JOIN embeddings e ON e.id = h.id AND e.target_type = 'highlight'
        WHERE h.deleted = 0 AND s.deleted = 0
          AND h.id IN (SELECT id FROM highlights_fts WHERE highlights_fts MATCH ?)
        ORDER BY h.created_at DESC
        LIMIT 250
      `)
        .bind(ftsQuery)
        .all<FallbackRow>();
      rows = ftsRes.results;
    } catch {
      rows = [];
    }
  }

  if (rows.length < 50) {
    const existingIds = new Set(rows.map((r) => r.id));
    const { results: recentRows } = await env.DB.prepare(`
      SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url,
        e.embedding as cached_embedding, e.model as cached_model, e.content_hash as cached_hash
      FROM highlights h
      JOIN sources s ON s.id = h.source_id
      LEFT JOIN embeddings e ON e.id = h.id AND e.target_type = 'highlight'
      WHERE h.deleted = 0 AND s.deleted = 0
      ORDER BY h.created_at DESC
      LIMIT 300
    `).all<FallbackRow>();
    for (const r of recentRows) {
      if (!existingIds.has(r.id)) {
        rows.push(r);
        if (rows.length >= 300) break;
      }
    }
  }

  const scored: SemanticHighlightMatch[] = [];
  const localQueryVector =
    queryEmbedding.provider === 'local_trigram'
      ? queryEmbedding.vector
      : buildLocalSemanticVector(query);

  for (const row of rows) {
    const textForEmbed = `${row.content}${row.note ? `\nNote: ${row.note}` : ''}\nSource: ${row.source_name}${row.source_author ? ` by ${row.source_author}` : ''}`;
    const hash = computeContentHash(textForEmbed);

    let vector: number[] | null = null;
    if (
      row.cached_embedding &&
      row.cached_model === queryEmbedding.model &&
      row.cached_hash === hash
    ) {
      try {
        const parsed = JSON.parse(row.cached_embedding) as unknown;
        if (Array.isArray(parsed)) {
          vector = parsed.filter((n): n is number => typeof n === 'number');
        }
      } catch {
        vector = null;
      }
    }

    let sim: number;
    if (vector && vector.length === queryEmbedding.vector.length) {
      sim = cosineSimilarity(queryEmbedding.vector, vector);
    } else {
      // Score unindexed or mismatched-dimension highlights using fast local trigram fallback
      // instead of firing inline remote embedding calls or silently dropping rows
      sim = cosineSimilarity(localQueryVector, buildLocalSemanticVector(textForEmbed)) * 0.75;
    }

    const lowerCombined = toAsciiVietnamese(textForEmbed).toLowerCase();
    let keywordBoost = 0;
    if (queryWords.length > 0) {
      const hits = queryWords.filter((w) => lowerCombined.includes(w)).length;
      keywordBoost = (hits / queryWords.length) * 0.25;
    }

    const combinedScore = Math.min(1, Math.max(0, sim * 0.85 + keywordBoost));
    const {
      cached_embedding: _ce,
      cached_model: _cm,
      cached_hash: _ch,
      ...cleanHighlight
    } = row;

    scored.push({
      ...cleanHighlight,
      similarity: Math.round(combinedScore * 100),
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  // Filter out very weak noise when using local_trigram, keep top relevant matches
  const filtered = scored
    .filter((item, idx) => idx < 5 || item.similarity >= 15)
    .slice(0, limit);

  return {
    highlights: filtered,
    model: queryEmbedding.model,
    provider: queryEmbedding.provider,
  };
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface WorkersAiTextResponse {
  response?: string;
}

export async function generateLibraryText(
  prompt: string,
  env: Bindings,
  customApiKey?: string
): Promise<string> {
  const apiKey = await resolveGeminiKey(env, customApiKey);

  if (apiKey) {
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as GeminiTextResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (res.status !== 404) {
        break;
      }
    }
  }

  if (env.AI) {
    try {
      const aiRes = (await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
      })) as WorkersAiTextResponse;
      if (aiRes.response) return aiRes.response;
    } catch (e) {
      console.warn('Workers AI error:', e instanceof Error ? e.message : e);
    }
  }

  throw new Error('Please configure a free Google Gemini API Key in Settings to use Library AI.');
}

export async function askLibraryAi(
  env: Bindings,
  question: string,
  options: { limit?: number; customApiKey?: string } = {}
): Promise<{ answer: string; citations: SemanticHighlightMatch[] }> {
  const semantic = await semanticSearchHighlights(env, question, {
    limit: options.limit ?? 12,
    customApiKey: options.customApiKey,
  });
  const matchingHighlights = semantic.highlights;

  const libraryContext = matchingHighlights
    .map(
      (m, i) =>
        `[${i + 1}] "${m.content}"\nSource: ${m.source_name}${m.source_author ? ` by ${m.source_author}` : ''}${
          m.note ? `\nUser's Personal Note: ${m.note}` : ''
        }`
    )
    .join('\n\n');

  const prompt = `You are Mnema Library AI, a knowledgeable personal assistant that answers questions based on the user's personal knowledge base and reading highlights.

Question: "${question}"

User's Library Highlights Context:
"""
${libraryContext || 'No directly matching quotes found in library. Use general wisdom while remaining helpful.'}
"""

Instructions:
1. Synthesize insights directly from the user's reading highlights.
2. When referencing ideas, cite the source name (e.g., "[Atomic Habits]").
3. Keep the tone conversational, articulate, and inspiring.`;

  const answer = await generateLibraryText(prompt, env, options.customApiKey);
  return {
    answer,
    citations: matchingHighlights.slice(0, 5),
  };
}
