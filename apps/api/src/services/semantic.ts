import { Bindings, EmbeddingRow, HighlightWithSource } from '../types';
import { getSettings } from './settings';

export type EmbeddingProvider = 'gemini' | 'workers_ai' | 'local_trigram';

export interface EmbeddingResult {
  vector: number[];
  model: string;
  provider: EmbeddingProvider;
}

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

interface WorkersAiEmbeddingResponse {
  data?: number[][];
}

const LOCAL_DIM = 256;

function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeVector(vec: number[]): number[] {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function buildLocalSemanticVector(text: string): number[] {
  const vec = new Array<number>(LOCAL_DIM).fill(0);
  const normalized = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return vec;

  const words = normalized.split(' ').filter(Boolean);
  for (const word of words) {
    const idx = fnv1aHash(`w:${word}`) % LOCAL_DIM;
    vec[idx] += 2.0;

    // Simple prefix stem for morphological similarity (e.g. habit/habits, compound/compounding)
    if (word.length >= 4) {
      const stem = word.slice(0, Math.min(word.length, 5));
      const stemIdx = fnv1aHash(`s:${stem}`) % LOCAL_DIM;
      vec[stemIdx] += 1.2;
    }

    // Character trigrams
    const padded = `_${word}_`;
    for (let i = 0; i <= padded.length - 3; i++) {
      const tri = padded.slice(i, i + 3);
      const triIdx = fnv1aHash(`t:${tri}`) % LOCAL_DIM;
      vec[triIdx] += 0.6;
    }
  }

  return normalizeVector(vec);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function computeContentHash(text: string): string {
  return `${text.length}:${fnv1aHash(text).toString(16)}`;
}

async function resolveGeminiKey(env: Bindings, customApiKey?: string): Promise<string | null> {
  if (customApiKey?.trim()) return customApiKey.trim();
  if (env.GEMINI_API_KEY?.trim()) return env.GEMINI_API_KEY.trim();
  try {
    const settings = await getSettings(env.DB);
    return settings.gemini_api_key || null;
  } catch {
    return null;
  }
}

export async function generateEmbedding(
  text: string,
  env: Bindings,
  customApiKey?: string
): Promise<EmbeddingResult> {
  const trimmed = text.trim().slice(0, 4000);
  const geminiKey = await resolveGeminiKey(env, customApiKey);

  if (geminiKey) {
    const models = ['gemini-embedding-001', 'text-embedding-004'];
    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: `models/${model}`,
              content: { parts: [{ text: trimmed }] },
            }),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as GeminiEmbeddingResponse;
          const values = data.embedding?.values;
          if (Array.isArray(values) && values.length > 0) {
            return {
              vector: normalizeVector(values),
              model,
              provider: 'gemini',
            };
          }
        }
      } catch (err) {
        console.warn(`Gemini embedding (${model}) error:`, err);
      }
    }
  }

  if (env.AI) {
    try {
      const model = '@cf/baai/bge-small-en-v1.5';
      const raw = (await env.AI.run(model, { text: [trimmed] })) as WorkersAiEmbeddingResponse;
      const vector = raw?.data?.[0];
      if (Array.isArray(vector) && vector.length > 0) {
        return {
          vector: normalizeVector(vector),
          model,
          provider: 'workers_ai',
        };
      }
    } catch (err) {
      console.warn('Workers AI embedding fallback:', err);
    }
  }

  return {
    vector: buildLocalSemanticVector(trimmed),
    model: 'local-trigram-256',
    provider: 'local_trigram',
  };
}

export async function ensureEmbeddingsTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL DEFAULT 'highlight',
      embedding TEXT NOT NULL,
      model TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

export interface HighlightForIndex {
  id: string;
  content: string;
  note: string | null;
  source_name: string;
  source_author: string | null;
}

export async function syncHighlightEmbeddings(
  env: Bindings,
  options: { customApiKey?: string; batchLimit?: number } = {}
): Promise<{
  indexedCount: number;
  totalHighlights: number;
  model: string;
  provider: EmbeddingProvider;
}> {
  await ensureEmbeddingsTable(env.DB);
  const limit = Math.min(100, Math.max(1, options.batchLimit || 40));

  // Probe provider & model once
  const probe = await generateEmbedding('probe', env, options.customApiKey);
  const activeModel = probe.model;
  const activeProvider = probe.provider;

  const { results: highlights } = await env.DB.prepare(`
    SELECT h.id, h.content, h.note, s.name as source_name, s.author as source_author
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    WHERE h.deleted = 0 AND s.deleted = 0
    ORDER BY h.created_at DESC
  `).all<HighlightForIndex>();

  const { results: existing } = await env.DB.prepare(
    `SELECT id, model, content_hash FROM embeddings WHERE target_type = 'highlight'`
  ).all<Pick<EmbeddingRow, 'id' | 'model' | 'content_hash'>>();

  const existingMap = new Map<string, { model: string; content_hash: string }>();
  for (const row of existing) {
    existingMap.set(row.id, { model: row.model, content_hash: row.content_hash });
  }

  let indexedCount = 0;
  for (const hl of highlights) {
    if (indexedCount >= limit) break;
    const textForEmbed = `${hl.content}${hl.note ? `\nNote: ${hl.note}` : ''}\nSource: ${hl.source_name}${hl.source_author ? ` by ${hl.source_author}` : ''}`;
    const hash = computeContentHash(textForEmbed);
    const prev = existingMap.get(hl.id);

    if (prev && prev.model === activeModel && prev.content_hash === hash) {
      continue;
    }

    const emb = await generateEmbedding(textForEmbed, env, options.customApiKey);
    await env.DB.prepare(`
      INSERT INTO embeddings (id, target_type, embedding, model, content_hash, updated_at)
      VALUES (?, 'highlight', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        embedding = excluded.embedding,
        model = excluded.model,
        content_hash = excluded.content_hash,
        updated_at = excluded.updated_at
    `)
      .bind(hl.id, JSON.stringify(emb.vector), emb.model, hash, new Date().toISOString())
      .run();

    indexedCount++;
  }

  return {
    indexedCount,
    totalHighlights: highlights.length,
    model: activeModel,
    provider: activeProvider,
  };
}

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

  // Fetch all active highlights joined with their cached embedding for this model
  const { results: rows } = await env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url,
      e.embedding as cached_embedding, e.model as cached_model, e.content_hash as cached_hash
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    LEFT JOIN embeddings e ON e.id = h.id AND e.target_type = 'highlight'
    WHERE h.deleted = 0 AND s.deleted = 0
  `).all<
    HighlightWithSource & {
      cached_embedding: string | null;
      cached_model: string | null;
      cached_hash: string | null;
    }
  >();

  // Keyword boost tokens
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scored: SemanticHighlightMatch[] = [];
  let inlineIndexed = 0;

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

    if (!vector) {
      if (queryEmbedding.provider === 'local_trigram') {
        vector = buildLocalSemanticVector(textForEmbed);
      } else if (inlineIndexed < 15) {
        const generated = await generateEmbedding(textForEmbed, env, options.customApiKey);
        vector = generated.vector;
        inlineIndexed++;
        await env.DB.prepare(`
          INSERT INTO embeddings (id, target_type, embedding, model, content_hash, updated_at)
          VALUES (?, 'highlight', ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            embedding = excluded.embedding,
            model = excluded.model,
            content_hash = excluded.content_hash,
            updated_at = excluded.updated_at
        `)
          .bind(row.id, JSON.stringify(vector), generated.model, hash, new Date().toISOString())
          .run();
      } else {
        // Skip unindexed items when remote embedding budget cap is hit inline
        continue;
      }
    }

    const sim = cosineSimilarity(queryEmbedding.vector, vector);
    const lowerCombined = textForEmbed.toLowerCase();
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
