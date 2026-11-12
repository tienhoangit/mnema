import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { HighlightColor, Source, Highlight } from '../types';

export interface OfflineArticle {
  id: string;
  name: string;
  author: string | null;
  type: string;
  url: string | null;
  image_url: string | null;
  content_html: string | null;
  reading_status: string;
  word_count: number;
  reading_time: number;
  source_notes: string | null;
  highlights?: Highlight[];
  saved_at: string;
}

export interface PendingHighlight {
  id: string;
  source_id: string;
  content: string;
  note?: string;
  color: HighlightColor;
  location?: string;
  tags?: string[];
  created_at: string;
}

interface MnemaOfflineDB extends DBSchema {
  articles: {
    key: string;
    value: OfflineArticle;
  };
  pending_highlights: {
    key: string;
    value: PendingHighlight;
  };
}

const DB_NAME = 'mnema_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MnemaOfflineDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MnemaOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MnemaOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('articles')) {
          db.createObjectStore('articles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pending_highlights')) {
          db.createObjectStore('pending_highlights', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// 1. Articles offline cache
export async function saveArticleOffline(source: Partial<Source> & { id: string }): Promise<void> {
  if (!source.id) return;
  try {
    const db = await getDb();
    const item: OfflineArticle = {
      id: source.id,
      name: source.name || 'Untitled Source',
      author: source.author ?? null,
      type: source.type || 'article',
      url: source.url ?? null,
      image_url: source.image_url ?? null,
      content_html: source.content_html ?? null,
      reading_status: source.reading_status || 'inbox',
      word_count: source.word_count || 0,
      reading_time: source.reading_time || 1,
      source_notes: source.source_notes ?? null,
      highlights: source.highlights || [],
      saved_at: new Date().toISOString(),
    };
    await db.put('articles', item);
  } catch (err) {
    console.warn('Failed to cache article offline:', err);
  }
}

export async function getArticleOffline(id: string): Promise<OfflineArticle | undefined> {
  try {
    const db = await getDb();
    return await db.get('articles', id);
  } catch (err) {
    console.warn('Failed to get offline article:', err);
    return undefined;
  }
}

export async function getAllOfflineArticles(): Promise<OfflineArticle[]> {
  try {
    const db = await getDb();
    return await db.getAll('articles');
  } catch {
    return [];
  }
}

// 2. Pending highlights queue
export async function savePendingHighlight(data: {
  id?: string;
  source_id: string;
  content: string;
  note?: string;
  color?: HighlightColor;
  location?: string;
  tags?: string[];
}): Promise<PendingHighlight> {
  const db = await getDb();
  const item: PendingHighlight = {
    id: data.id || crypto.randomUUID(),
    source_id: data.source_id,
    content: data.content,
    note: data.note,
    color: data.color || 'yellow',
    location: data.location,
    tags: data.tags,
    created_at: new Date().toISOString(),
  };

  await db.put('pending_highlights', item);
  return item;
}

export async function getPendingHighlights(): Promise<PendingHighlight[]> {
  try {
    const db = await getDb();
    return await db.getAll('pending_highlights');
  } catch {
    return [];
  }
}

export async function deletePendingHighlight(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('pending_highlights', id);
  } catch (err) {
    console.warn('Failed to delete pending highlight:', err);
  }
}

// 3. Robust Background/Foreground Sync for iOS Safari & Modern Browsers
let isSyncing = false;

export async function syncPendingHighlights(): Promise<{ synced: number; remaining: number }> {
  if (isSyncing || typeof navigator === 'undefined' || !navigator.onLine) {
    return { synced: 0, remaining: 0 };
  }

  isSyncing = true;
  let synced = 0;

  try {
    const pending = await getPendingHighlights();
    if (pending.length === 0) {
      isSyncing = false;
      return { synced: 0, remaining: 0 };
    }

    for (const item of pending) {
      try {
        const res = await fetch('/api/highlights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_id: item.source_id,
            content: item.content,
            note: item.note,
            color: item.color,
            location: item.location,
            tags: item.tags,
          }),
        });

        if (res.ok) {
          await deletePendingHighlight(item.id);
          synced++;
        }
      } catch (err: any) {
        console.warn(`Sync failed for pending highlight ${item.id}:`, err?.message);
        // If network went offline during sync, break early
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      }
    }

    const remaining = (await getPendingHighlights()).length;
    return { synced, remaining };
  } finally {
    isSyncing = false;
  }
}
