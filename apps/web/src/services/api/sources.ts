import { Source, ReadingStatus, SourceType } from '../../types';
import { getArticleOffline, getAllOfflineArticles } from '../offlineDb';
import { API_BASE, apiFetch, parseErrorMessage, SessionExpiredError } from './client';

export interface BookSearchResult {
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
}

export interface ImportSummary {
  detectedFormat?: string;
  booksProcessed: number;
  booksCreated: number;
  highlightsImported: number;
}

export const sourcesApi = {
  async getSources(params: {
    status?: ReadingStatus | 'all';
    type?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<Source[]> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.q) query.set('q', params.q);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    try {
      const res = await apiFetch(`${API_BASE}/sources?${query.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as { data: Source[] };
        return json.data;
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      // offline fallback
    }

    // Fallback to IndexedDB offline cache
    const cachedArticles = await getAllOfflineArticles();
    return cachedArticles
      .filter((art) => {
        if (params.status && params.status !== 'all' && art.reading_status !== params.status) return false;
        if (params.type && art.type !== params.type) return false;
        if (params.q && !art.name.toLowerCase().includes(params.q.toLowerCase())) return false;
        return true;
      })
      .map((art) => ({
        id: art.id,
        name: art.name,
        author: art.author,
        type: art.type as any,
        url: art.url,
        image_url: art.image_url,
        content_html: art.content_html,
        reading_status: art.reading_status as any,
        progress: 0,
        word_count: art.word_count,
        reading_time: art.reading_time,
        metadata: null,
        source_notes: art.source_notes,
        created_at: art.saved_at,
        updated_at: art.saved_at,
        highlights: art.highlights || [],
      }));
  },

  async getSource(id: string): Promise<Source> {
    try {
      const res = await apiFetch(`${API_BASE}/sources/${id}`);
      if (res.ok) {
        const json = (await res.json()) as { data: Source };
        return json.data;
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      // offline fallback
    }

    const cached = await getArticleOffline(id);
    if (cached) {
      return {
        id: cached.id,
        name: cached.name,
        author: cached.author,
        type: cached.type as any,
        url: cached.url,
        image_url: cached.image_url,
        content_html: cached.content_html,
        reading_status: cached.reading_status as any,
        progress: 0,
        word_count: cached.word_count,
        reading_time: cached.reading_time,
        metadata: null,
        source_notes: cached.source_notes,
        created_at: cached.saved_at,
        updated_at: cached.saved_at,
        highlights: cached.highlights || [],
      };
    }

    throw new Error('Failed to fetch source details');
  },

  async createSource(data: {
    url?: string;
    html?: string;
    name?: string;
    author?: string;
    type?: SourceType;
    image_url?: string;
    reading_status?: ReadingStatus;
    metadata?: string;
    source_notes?: string;
  }): Promise<Source> {
    const res = await apiFetch(`${API_BASE}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to create source'));
    }
    const json = (await res.json()) as { data: Source };
    return json.data;
  },

  async updateSource(id: string, updates: Partial<Source>): Promise<Source> {
    const res = await apiFetch(`${API_BASE}/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update source');
    const json = (await res.json()) as { data: Source };
    return json.data;
  },

  async deleteSource(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/sources/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete source');
  },

  // Imports (Kindle, Readwise/Apple Books/Kobo/Goodreads CSV, PDF)
  async importKindle(clippingsText: string): Promise<{ data: ImportSummary }> {
    const res = await apiFetch(`${API_BASE}/import/kindle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clippings: clippingsText }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Import failed'));
    }
    return res.json() as Promise<{ data: ImportSummary }>;
  },

  async importCsv(
    csv: string,
    format: 'auto' | 'readwise' | 'apple_books' | 'kobo' | 'goodreads' = 'auto'
  ): Promise<{ data: ImportSummary }> {
    const res = await apiFetch(`${API_BASE}/import/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, format }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'CSV import failed'));
    }
    return res.json() as Promise<{ data: ImportSummary }>;
  },

  async importPdfFile(params: {
    title?: string;
    author?: string;
    content_html?: string;
    pages?: string[];
    page_count?: number;
    text?: string;
    file_hash?: string;
    highlights?: Array<{
      content: string;
      note?: string;
      location?: string;
      color?: string;
    }>;
    reading_status?: ReadingStatus;
  }): Promise<{ source: Source; highlightsImported: number }> {
    const res = await apiFetch(`${API_BASE}/import/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'PDF import failed'));
    }
    const json = (await res.json()) as { data: Source; highlightsImported?: number };
    return {
      source: json.data,
      highlightsImported: json.highlightsImported ?? 0,
    };
  },

  async uploadEpub(
    file: File,
    options?: { title?: string; author?: string; reading_status?: ReadingStatus }
  ): Promise<{ source: Source; deduplicated: boolean }> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.title) formData.append('title', options.title);
    if (options?.author) formData.append('author', options.author);
    if (options?.reading_status) formData.append('reading_status', options.reading_status);

    try {
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      formData.append('file_hash', hashHex);
    } catch {
      // fallback to server-side hashing
    }

    const res = await apiFetch(`${API_BASE}/sources/epub`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'EPUB upload failed'));
    }
    const json = (await res.json()) as { data: Source; deduplicated?: boolean };
    return {
      source: json.data,
      deduplicated: Boolean(json.deduplicated),
    };
  },

  // Book Search (OpenLibrary)
  async searchBooks(query: string): Promise<BookSearchResult[]> {
    const res = await apiFetch(`${API_BASE}/sources/search-books?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: BookSearchResult[] };
    return json.data || [];
  },
};
