import { Bindings } from '../../types';
import { toAsciiVietnamese } from '../../core/text';
import {
  checkWorkersAiBudget,
  recordWorkersAiUsage,
  resolveGeminiKey,
} from '../../core/helpers';

export type EmbeddingProvider = 'gemini' | 'workers_ai' | 'local_trigram';

export interface EmbeddingResult {
  vector: number[];
  model: string;
  provider: EmbeddingProvider;
}

interface GeminiBatchEmbeddingResponse {
  embeddings?: Array<{
    values?: number[];
  }>;
}

interface WorkersAiEmbeddingResponse {
  data?: number[][];
}

export const WORKERS_AI_EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
export const TARGET_EMBEDDING_DIM = 1024;
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
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function buildLocalSemanticVector(text: string): number[] {
  const vec = new Array<number>(LOCAL_DIM).fill(0);
  const normalized = toAsciiVietnamese(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  if (!normalized) return vec;

  // Unigrams + character bigrams + trigrams hashed into LOCAL_DIM
  const words = normalized.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const wHash = fnv1aHash(word) % LOCAL_DIM;
    vec[wHash] += 2.0;

    for (let i = 0; i <= word.length - 3; i++) {
      const trigram = word.slice(i, i + 3);
      const tHash = fnv1aHash(trigram) % LOCAL_DIM;
      vec[tHash] += 1.0;
    }
  }

  // Word bigrams for lightweight phrasal semantic capture
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]}_${words[i + 1]}`;
    const pHash = fnv1aHash(pair) % LOCAL_DIM;
    vec[pHash] += 1.5;
  }

  return normalizeVector(vec);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function computeContentHash(text: string): string {
  return `${text.length}:${fnv1aHash(text).toString(16)}`;
}

export async function getActiveEmbeddingConfig(
  env: Bindings,
  customApiKey?: string
): Promise<{ model: string; provider: EmbeddingProvider; dim: number }> {
  const geminiKey = await resolveGeminiKey(env, customApiKey);
  if (geminiKey) {
    return {
      model: GEMINI_EMBEDDING_MODEL,
      provider: 'gemini',
      dim: TARGET_EMBEDDING_DIM,
    };
  }
  if (env.AI) {
    return {
      model: WORKERS_AI_EMBEDDING_MODEL,
      provider: 'workers_ai',
      dim: TARGET_EMBEDDING_DIM,
    };
  }
  return {
    model: 'local-trigram-256',
    provider: 'local_trigram',
    dim: LOCAL_DIM,
  };
}

export async function generateEmbeddingsBatch(
  texts: string[],
  env: Bindings,
  customApiKey?: string
): Promise<{
  vectors: number[][];
  model: string;
  provider: EmbeddingProvider;
}> {
  if (texts.length === 0) {
    return { vectors: [], model: 'none', provider: 'local_trigram' };
  }

  const trimmedTexts = texts.map((t) => t.trim().slice(0, 4000));
  const geminiKey = await resolveGeminiKey(env, customApiKey);

  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: trimmedTexts.map((t) => ({
              model: `models/${GEMINI_EMBEDDING_MODEL}`,
              content: { parts: [{ text: t }] },
              outputDimensionality: TARGET_EMBEDDING_DIM,
            })),
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as GeminiBatchEmbeddingResponse;
        const embeddings = data.embeddings;
        if (
          Array.isArray(embeddings) &&
          embeddings.length === trimmedTexts.length &&
          embeddings.every((e) => Array.isArray(e.values) && e.values.length > 0)
        ) {
          return {
            vectors: embeddings.map((e) => normalizeVector(e.values!)),
            model: GEMINI_EMBEDDING_MODEL,
            provider: 'gemini',
          };
        }
      }
    } catch (err) {
      console.warn(`Gemini batch embedding (${GEMINI_EMBEDDING_MODEL}) error:`, err);
    }
  }

  if (env.AI) {
    const budget = await checkWorkersAiBudget(env);
    if (!budget.allowed) {
      console.warn(
        `Workers AI daily neuron budget exhausted (${budget.used}/${budget.limit}); falling back to local trigram.`
      );
    } else {
      try {
        const raw = (await env.AI.run(WORKERS_AI_EMBEDDING_MODEL, {
          text: trimmedTexts,
        })) as WorkersAiEmbeddingResponse;
        const data = raw?.data;
        if (
          Array.isArray(data) &&
          data.length === trimmedTexts.length &&
          data.every((vec) => Array.isArray(vec) && vec.length > 0)
        ) {
          await recordWorkersAiUsage(env, trimmedTexts.length * 15);
          return {
            vectors: data.map((vec) => normalizeVector(vec)),
            model: WORKERS_AI_EMBEDDING_MODEL,
            provider: 'workers_ai',
          };
        }
      } catch (err) {
        console.warn('Workers AI batch embedding fallback:', err);
      }
    }
  }

  return {
    vectors: trimmedTexts.map((t) => buildLocalSemanticVector(t)),
    model: 'local-trigram-256',
    provider: 'local_trigram',
  };
}

export async function generateEmbedding(
  text: string,
  env: Bindings,
  customApiKey?: string
): Promise<EmbeddingResult> {
  const batch = await generateEmbeddingsBatch([text], env, customApiKey);
  return {
    vector: batch.vectors[0],
    model: batch.model,
    provider: batch.provider,
  };
}

export async function ensureEmbeddingsTable(_db: D1Database): Promise<void> {
  // Schema is managed via D1 migrations (0005_core_parity.sql, 0008_stabilization.sql)
}

export interface HighlightForIndex {
  id: string;
  source_id: string;
  content: string;
  note: string | null;
  source_name: string;
  source_author: string | null;
}

const VECTORIZE_BATCH_SIZE = 50;

export async function upsertVectorizeBatch(
  env: Bindings,
  vectors: VectorizeVector[]
): Promise<boolean> {
  if (!env.VECTORIZE || vectors.length === 0) return false;
  try {
    for (let i = 0; i < vectors.length; i += VECTORIZE_BATCH_SIZE) {
      const slice = vectors.slice(i, i + VECTORIZE_BATCH_SIZE);
      await env.VECTORIZE.upsert(slice);
    }
    return true;
  } catch (err) {
    console.warn('Vectorize batch upsert error (falling back to D1 embeddings):', err);
    return false;
  }
}

export async function indexHighlightVector(
  env: Bindings,
  highlightId: string,
  customApiKey?: string
): Promise<void> {
  await ensureEmbeddingsTable(env.DB);

  const hl = await env.DB.prepare(`
    SELECT h.id, h.source_id, h.content, h.note, s.name as source_name, s.author as source_author
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    WHERE h.id = ? AND h.deleted = 0 AND s.deleted = 0
  `)
    .bind(highlightId)
    .first<HighlightForIndex>();

  if (!hl) return;

  const textForEmbed = `${hl.content}${hl.note ? `\nNote: ${hl.note}` : ''}\nSource: ${hl.source_name}${hl.source_author ? ` by ${hl.source_author}` : ''}`;
  const contentHash = computeContentHash(textForEmbed);
  const now = new Date().toISOString();

  const { vector, model } = await generateEmbedding(textForEmbed, env, customApiKey);

  await env.DB.prepare(`
    INSERT INTO embeddings (id, target_type, embedding, model, content_hash, updated_at)
    VALUES (?, 'highlight', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      embedding = excluded.embedding,
      model = excluded.model,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at
  `)
    .bind(highlightId, JSON.stringify(vector), model, contentHash, now)
    .run();

  if (env.VECTORIZE) {
    await upsertVectorizeBatch(env, [
      {
        id: hl.id,
        values: vector,
        metadata: {
          highlightId: hl.id,
          sourceId: hl.source_id,
        },
      },
    ]);
  }
}

export async function syncHighlightEmbeddings(
  env: Bindings,
  options: { customApiKey?: string; batchLimit?: number; force?: boolean } = {}
): Promise<{
  indexedCount: number;
  totalHighlights: number;
  model: string;
  provider: EmbeddingProvider;
  vectorizeSynced: boolean;
}> {
  await ensureEmbeddingsTable(env.DB);
  const limit = Math.min(35, Math.max(1, options.batchLimit || 30));
  const activeConfig = await getActiveEmbeddingConfig(env, options.customApiKey);

  const totalRes = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    WHERE h.deleted = 0 AND s.deleted = 0
  `).first<{ count: number }>();
  const totalHighlights = totalRes?.count || 0;

  const pendingQuery = options.force
    ? `
      SELECT h.id, h.source_id, h.content, h.note, s.name as source_name, s.author as source_author
      FROM highlights h
      JOIN sources s ON s.id = h.source_id
      LEFT JOIN embeddings e ON e.id = h.id AND e.target_type = 'highlight'
      WHERE h.deleted = 0 AND s.deleted = 0
      ORDER BY CASE WHEN e.id IS NULL OR e.model != ? THEN 0 ELSE 1 END, e.updated_at ASC, h.created_at DESC
      LIMIT ?
    `
    : `
      SELECT h.id, h.source_id, h.content, h.note, s.name as source_name, s.author as source_author
      FROM highlights h
      JOIN sources s ON s.id = h.source_id
      LEFT JOIN embeddings e ON e.id = h.id AND e.target_type = 'highlight'
      WHERE h.deleted = 0 AND s.deleted = 0
        AND (e.id IS NULL OR e.model != ?)
      ORDER BY h.created_at DESC
      LIMIT ?
    `;

  const { results: pending } = await env.DB.prepare(pendingQuery)
    .bind(activeConfig.model, limit)
    .all<HighlightForIndex>();

  if (pending.length === 0) {
    return {
      indexedCount: 0,
      totalHighlights,
      model: activeConfig.model,
      provider: activeConfig.provider,
      vectorizeSynced: false,
    };
  }

  const texts = pending.map(
    (hl) =>
      `${hl.content}${hl.note ? `\nNote: ${hl.note}` : ''}\nSource: ${hl.source_name}${hl.source_author ? ` by ${hl.source_author}` : ''}`
  );
  const hashes = texts.map((t) => computeContentHash(t));

  const batchResult = await generateEmbeddingsBatch(texts, env, options.customApiKey);
  if (activeConfig.provider !== 'local_trigram' && batchResult.provider === 'local_trigram') {
    throw new Error(
      `Embedding provider (${activeConfig.provider}) failed for this batch; cron will retry automatically.`
    );
  }
  const now = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];
  const vectorBatch: VectorizeVector[] = [];

  for (let i = 0; i < pending.length; i++) {
    const hl = pending[i];
    const vector = batchResult.vectors[i];
    const hash = hashes[i];

    statements.push(
      env.DB.prepare(`
        INSERT INTO embeddings (id, target_type, embedding, model, content_hash, updated_at)
        VALUES (?, 'highlight', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          embedding = excluded.embedding,
          model = excluded.model,
          content_hash = excluded.content_hash,
          updated_at = excluded.updated_at
      `).bind(hl.id, JSON.stringify(vector), batchResult.model, hash, now)
    );

    if (env.VECTORIZE) {
      vectorBatch.push({
        id: hl.id,
        values: vector,
        metadata: {
          highlightId: hl.id,
          sourceId: hl.source_id,
        },
      });
    }
  }

  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }

  const vectorizeSynced = await upsertVectorizeBatch(env, vectorBatch);

  return {
    indexedCount: statements.length,
    totalHighlights,
    model: batchResult.model,
    provider: batchResult.provider,
    vectorizeSynced,
  };
}
