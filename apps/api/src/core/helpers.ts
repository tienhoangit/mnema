import { Bindings } from '../types';
import { getSettings } from './settings';

export const WORKERS_AI_DAILY_LIMIT = 8500; // Safe cap below 10,000 Neurons/day Free Tier
const memoryAiUsage = new Map<string, number>();

export async function resolveGeminiKey(
  env: Bindings,
  customApiKey?: string
): Promise<string | null> {
  if (customApiKey?.trim()) return customApiKey.trim();
  if (env.GEMINI_API_KEY?.trim()) return env.GEMINI_API_KEY.trim();
  try {
    const settings = await getSettings(env.DB);
    return settings.gemini_api_key || null;
  } catch {
    return null;
  }
}

export async function attachTagsToHighlight(
  db: D1Database,
  highlightId: string,
  tags: string[]
): Promise<void> {
  for (const tagName of tags) {
    const cleanName = tagName.trim().toLowerCase();
    if (!cleanName) continue;

    const existing = await db
      .prepare(`SELECT id FROM tags WHERE name = ?`)
      .bind(cleanName)
      .first<{ id: string }>();
    let tagId = existing?.id;

    if (!tagId) {
      tagId = crypto.randomUUID();
      await db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).bind(tagId, cleanName).run();
    }

    await db
      .prepare(`INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)`)
      .bind(highlightId, tagId)
      .run();
  }
}

export function parseTagsJson(tagsJson: string | null | undefined): any[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((t: any) => t && t.id);
    }
    return [];
  } catch {
    return [];
  }
}

export function formatDateWithOffset(date: Date = new Date(), offsetMinutes = 420): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return shifted.toISOString().split('T')[0];
}

export async function getConfiguredTimezoneOffset(db: D1Database): Promise<number> {
  try {
    const settings = await getSettings(db);
    return typeof settings.timezone_offset_minutes === 'number'
      ? settings.timezone_offset_minutes
      : 420;
  } catch {
    return 420;
  }
}

export async function checkWorkersAiBudget(
  env: Bindings
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const dayKey = `ai_neurons:${new Date().toISOString().split('T')[0]}`;
  let used = memoryAiUsage.get(dayKey) || 0;

  if (env.OAUTH_KV) {
    try {
      const raw = await env.OAUTH_KV.get(dayKey);
      if (raw !== null) {
        used = parseInt(raw, 10) || 0;
      }
    } catch {
      // fallback to memory counter
    }
  }

  return {
    allowed: used < WORKERS_AI_DAILY_LIMIT,
    used,
    limit: WORKERS_AI_DAILY_LIMIT,
  };
}

export async function recordWorkersAiUsage(env: Bindings, neurons: number): Promise<number> {
  const dayKey = `ai_neurons:${new Date().toISOString().split('T')[0]}`;
  const current = await checkWorkersAiBudget(env);
  const next = current.used + Math.max(0, Math.round(neurons));
  memoryAiUsage.set(dayKey, next);

  if (env.OAUTH_KV) {
    try {
      await env.OAUTH_KV.put(dayKey, String(next), { expirationTtl: 172800 });
    } catch {
      // ignore KV write error
    }
  }

  return next;
}

export async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
