import {
  Source,
  Highlight,
  ReadingStatus,
  StreakStats,
  Tag,
  SourceType,
  TrashData,
  SearchResults,
  FullStats,
  UserSettings,
  UserSettingsUpdate,
  EmailPreview,
  EmailLogEntry,
  RssFeed,
  PublicShare,
  PublicSharePayload,
  SemanticSearchResult,
  EmbeddingsStatus,
  OcrResult,
  TopicDiscoveryResult,
  ApiKeyItem,
  CreatedApiKey,
} from '../types';
import { getArticleOffline, getAllOfflineArticles } from './offlineDb';

const API_BASE = '/api';

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

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export const api = {
  // Sources
  async getSources(params: { status?: ReadingStatus | 'all'; type?: string; q?: string }): Promise<Source[]> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.q) query.set('q', params.q);

    try {
      const res = await fetch(`${API_BASE}/sources?${query.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as { data: Source[] };
        return json.data;
      }
    } catch {
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
      const res = await fetch(`${API_BASE}/sources/${id}`);
      if (res.ok) {
        const json = (await res.json()) as { data: Source };
        return json.data;
      }
    } catch {
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
    const res = await fetch(`${API_BASE}/sources`, {
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
    const res = await fetch(`${API_BASE}/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update source');
    const json = (await res.json()) as { data: Source };
    return json.data;
  },

  async deleteSource(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sources/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete source');
  },

  // Highlights
  async getHighlights(params?: { favorite?: boolean; tag?: string; q?: string; source_id?: string }): Promise<Highlight[]> {
    const query = new URLSearchParams();
    if (params?.favorite) query.set('favorite', '1');
    if (params?.tag) query.set('tag', params.tag);
    if (params?.q) query.set('q', params.q);
    if (params?.source_id) query.set('source_id', params.source_id);

    const res = await fetch(`${API_BASE}/highlights?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch highlights');
    const json = (await res.json()) as { data: Highlight[] };
    return json.data;
  },

  async createHighlight(data: {
    source_id: string;
    content: string;
    note?: string;
    color?: string;
    location?: string;
    tags?: string[];
  }): Promise<Highlight> {
    const res = await fetch(`${API_BASE}/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create highlight');
    const json = (await res.json()) as { data: Highlight };
    return json.data;
  },

  async updateHighlight(id: string, updates: Partial<Highlight>): Promise<Highlight> {
    const res = await fetch(`${API_BASE}/highlights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update highlight');
    const json = (await res.json()) as { data: Highlight };
    return json.data;
  },

  async deleteHighlight(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/highlights/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete highlight');
  },

  // Daily SRS Reviews & Streak
  async getReviewQueue(limit = 15): Promise<Highlight[]> {
    const res = await fetch(`${API_BASE}/reviews/queue?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch review queue');
    const json = (await res.json()) as { data: Highlight[] };
    return json.data;
  },

  async submitReviewAction(id: string, action: 'remember' | 'forget' | 'discard'): Promise<unknown> {
    const res = await fetch(`${API_BASE}/reviews/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error('Failed to submit review');
    return res.json();
  },

  async undoReview(): Promise<{ highlight: Highlight; undoneAction: string }> {
    const res = await fetch(`${API_BASE}/reviews/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to undo review'));
    }
    const json = (await res.json()) as { data: { highlight: Highlight; undoneAction: string } };
    return json.data;
  },

  async getStreak(): Promise<StreakStats> {
    const res = await fetch(`${API_BASE}/reviews/streak`);
    if (!res.ok) throw new Error('Failed to fetch streak');
    const json = (await res.json()) as { data: StreakStats };
    return json.data;
  },

  // Tags
  async getTags(): Promise<Tag[]> {
    const res = await fetch(`${API_BASE}/tags`);
    if (!res.ok) throw new Error('Failed to fetch tags');
    const json = (await res.json()) as { data: Tag[] };
    return json.data;
  },

  async createTag(data: { name: string; color?: string }): Promise<Tag> {
    const res = await fetch(`${API_BASE}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create tag');
    const json = (await res.json()) as { data: Tag };
    return json.data;
  },

  async updateTag(id: string, updates: { name?: string; color?: string }): Promise<Tag> {
    const res = await fetch(`${API_BASE}/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update tag');
    const json = (await res.json()) as { data: Tag };
    return json.data;
  },

  async deleteTag(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tags/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete tag');
  },

  // Imports (Kindle, Readwise/Apple Books/Kobo/Goodreads CSV, PDF)
  async importKindle(clippingsText: string): Promise<{ data: ImportSummary }> {
    const res = await fetch(`${API_BASE}/import/kindle`, {
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
    const res = await fetch(`${API_BASE}/import/csv`, {
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
    file?: File;
    title?: string;
    author?: string;
    text?: string;
    reading_status?: ReadingStatus;
  }): Promise<Source> {
    let res: Response;
    if (params.file) {
      const formData = new FormData();
      formData.append('file', params.file);
      if (params.title) formData.append('title', params.title);
      if (params.author) formData.append('author', params.author);
      if (params.reading_status) formData.append('reading_status', params.reading_status);
      if (params.text) formData.append('text', params.text);
      res = await fetch(`${API_BASE}/import/pdf`, {
        method: 'POST',
        body: formData,
      });
    } else {
      res = await fetch(`${API_BASE}/import/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          author: params.author,
          text: params.text,
          reading_status: params.reading_status,
        }),
      });
    }
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'PDF import failed'));
    }
    const json = (await res.json()) as { data: Source };
    return json.data;
  },

  // Book Search (OpenLibrary)
  async searchBooks(query: string): Promise<BookSearchResult[]> {
    const res = await fetch(`${API_BASE}/sources/search-books?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: BookSearchResult[] };
    return json.data || [];
  },

  // Custom Topic Review
  async startCustomReview(params: {
    topic?: string;
    source_id?: string;
    tag?: string;
    count?: number;
  }): Promise<{ sessionId: string; topic: string; highlights: Highlight[] }> {
    const res = await fetch(`${API_BASE}/reviews/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to start custom review');
    const json = (await res.json()) as {
      data: { sessionId: string; topic: string; highlights: Highlight[] };
    };
    return json.data;
  },

  // Search & Semantic AI Search
  async searchFulltext(query: string, type = 'all'): Promise<SearchResults> {
    const res = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`
    );
    if (!res.ok) throw new Error('Failed to search');
    const json = (await res.json()) as { data: SearchResults };
    return json.data;
  },

  async searchSemantic(query: string, limit = 15, apiKey?: string): Promise<SemanticSearchResult> {
    const res = await fetch(`${API_BASE}/search/semantic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, limit, apiKey }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Semantic search failed'));
    }
    const json = (await res.json()) as { data: SemanticSearchResult };
    return json.data;
  },

  async syncEmbeddings(apiKey?: string): Promise<{
    indexedCount: number;
    totalHighlights: number;
    model: string;
    provider: string;
  }> {
    const res = await fetch(`${API_BASE}/search/embeddings/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, batchLimit: 50 }),
    });
    if (!res.ok) throw new Error('Failed to sync semantic index');
    const json = (await res.json()) as {
      data: { indexedCount: number; totalHighlights: number; model: string; provider: string };
    };
    return json.data;
  },

  async getEmbeddingsStatus(): Promise<EmbeddingsStatus> {
    const res = await fetch(`${API_BASE}/search/embeddings/status`);
    if (!res.ok) throw new Error('Failed to check semantic index status');
    const json = (await res.json()) as { data: EmbeddingsStatus };
    return json.data;
  },

  async getSimilarHighlights(highlightId: string, apiKey?: string): Promise<Highlight[]> {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Gemini-Key'] = apiKey;
    const res = await fetch(`${API_BASE}/search/similar/${highlightId}`, { headers });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { similar: Highlight[] } };
    return json.data?.similar || [];
  },

  async askLibraryAi(
    question: string,
    apiKey?: string
  ): Promise<{ answer: string; citations: Highlight[] }> {
    const res = await fetch(`${API_BASE}/search/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, apiKey }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Library AI query failed'));
    }
    const json = (await res.json()) as { data: { answer: string; citations: Highlight[] } };
    return json.data;
  },

  // Trash API
  async getTrash(): Promise<TrashData> {
    const res = await fetch(`${API_BASE}/trash`);
    if (!res.ok) throw new Error('Failed to fetch trash');
    const json = (await res.json()) as { data: TrashData };
    return json.data;
  },

  async restoreTrash(type: 'source' | 'highlight', id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
    if (!res.ok) throw new Error('Failed to restore item');
  },

  async permanentDeleteTrash(options: {
    type?: 'source' | 'highlight';
    id?: string;
    all?: boolean;
  }): Promise<void> {
    const params = new URLSearchParams();
    if (options.all) params.set('all', 'true');
    if (options.type) params.set('type', options.type);
    if (options.id) params.set('id', options.id);

    const res = await fetch(`${API_BASE}/trash/permanent?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete item permanently');
  },

  // Full Analytics
  async getFullStats(): Promise<FullStats> {
    const res = await fetch(`${API_BASE}/stats/full`);
    if (!res.ok) throw new Error('Failed to fetch full stats');
    const json = (await res.json()) as { data: FullStats };
    return json.data;
  },

  // Library Tools
  async runLibraryTool(
    tool: 'merge-duplicates' | 'remove-empty' | 'trash-tiny'
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${API_BASE}/tools/${tool}`, { method: 'POST' });
    if (!res.ok) throw new Error('Tool execution failed');
    return res.json() as Promise<Record<string, unknown>>;
  },

  // AI Assistant & Book Page OCR
  async tidyUpText(text: string, apiKey?: string): Promise<string> {
    const res = await fetch(`${API_BASE}/ai/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, apiKey }),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res, 'Tidy up failed'));
    const json = (await res.json()) as { data: { text: string } };
    return json.data.text;
  },

  async ocrBookPage(params: {
    imageBase64: string;
    mimeType?: string;
    mode?: 'highlights_only' | 'full_page';
    apiKey?: string;
  }): Promise<OcrResult> {
    const res = await fetch(`${API_BASE}/ai/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'OCR extraction failed'));
    }
    const json = (await res.json()) as { data: OcrResult };
    return json.data;
  },

  async askHighlight(
    question: string,
    highlight: string,
    source: string,
    apiKey?: string
  ): Promise<string> {
    const res = await fetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context: `Source: ${source}\n\nHighlight quote:\n"${highlight}"`,
        apiKey,
      }),
    });
    if (!res.ok) throw new Error('AI analysis failed');
    const json = (await res.json()) as { data: { answer: string } };
    return json.data.answer;
  },

  async getAiThreadByHighlight(highlightId: string): Promise<{
    id: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } | null> {
    const res = await fetch(`${API_BASE}/ai/threads?highlight_id=${encodeURIComponent(highlightId)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data: { id: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } | null;
    };
    return json.data;
  },

  async askHighlightMultiTurn(data: {
    threadId?: string;
    highlightId?: string;
    sourceId?: string;
    highlightContent: string;
    sourceTitle: string;
    message: string;
    apiKey?: string;
  }): Promise<{
    answer: string;
    threadId: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }> {
    const res = await fetch(`${API_BASE}/ai/ask-highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || 'AI multi-turn analysis failed');
    }
    const json = (await res.json()) as {
      data: {
        answer: string;
        threadId: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      };
    };
    return json.data;
  },

  async suggestTags(content: string, apiKey?: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/ai/suggest-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, apiKey }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { tags?: string[] } };
    return json.data?.tags || [];
  },

  async inlineAiAction(params: {
    action: 'explain' | 'translate';
    text: string;
    context?: string;
    targetLang?: 'vi' | 'en';
    apiKey?: string;
  }): Promise<{ action: 'explain' | 'translate'; result: string }> {
    const res = await fetch(`${API_BASE}/ai/inline-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Ghostreader request failed'));
    }
    const json = (await res.json()) as {
      data: { action: 'explain' | 'translate'; result: string };
    };
    return json.data;
  },

  async discoverTopics(apiKey?: string): Promise<TopicDiscoveryResult> {
    const res = await fetch(`${API_BASE}/ai/discover-topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to discover AI topics'));
    }
    const json = (await res.json()) as { data: TopicDiscoveryResult };
    return json.data;
  },

  // Email, Digest & User Settings
  async getSettings(): Promise<UserSettings> {
    const res = await fetch(`${API_BASE}/email/settings`);
    if (!res.ok) throw new Error('Failed to load settings');
    const json = (await res.json()) as { data: UserSettings };
    return json.data;
  },

  async updateSettings(updates: UserSettingsUpdate): Promise<UserSettings> {
    const res = await fetch(`${API_BASE}/email/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res, 'Failed to save settings'));
    const json = (await res.json()) as { data: UserSettings };
    return json.data;
  },

  async getDigestPreview(count?: number): Promise<EmailPreview> {
    const q = count ? `?count=${count}` : '';
    const res = await fetch(`${API_BASE}/email/digest/preview${q}`);
    if (!res.ok) throw new Error('Failed to generate digest preview');
    const json = (await res.json()) as { data: EmailPreview };
    return json.data;
  },

  async sendTestDigest(params?: { to?: string; count?: number }): Promise<{
    recipient: string;
    highlightsCount: number;
    subject: string;
  }> {
    const res = await fetch(`${API_BASE}/email/digest/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to send test digest'));
    }
    const json = (await res.json()) as {
      data: { recipient: string; highlightsCount: number; subject: string };
    };
    return json.data;
  },

  async sendHighlightEmail(params: {
    highlight_id: string;
    to?: string;
    include_note?: boolean;
    subject?: string;
    preview_only?: boolean;
  }): Promise<{ preview?: EmailPreview; recipient?: string; subject?: string }> {
    const res = await fetch(`${API_BASE}/email/send-highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to send email'));
    }
    const json = (await res.json()) as {
      data: { preview?: EmailPreview; recipient?: string; subject?: string };
    };
    return json.data;
  },

  async sendSourceEmail(params: {
    source_id: string;
    to?: string;
    include_notes?: boolean;
    subject?: string;
    preview_only?: boolean;
  }): Promise<{ preview?: EmailPreview; recipient?: string; subject?: string; highlightsCount?: number }> {
    const res = await fetch(`${API_BASE}/email/send-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to send source summary email'));
    }
    const json = (await res.json()) as {
      data: { preview?: EmailPreview; recipient?: string; subject?: string; highlightsCount?: number };
    };
    return json.data;
  },

  async getEmailLogs(): Promise<EmailLogEntry[]> {
    const res = await fetch(`${API_BASE}/email/logs`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data: EmailLogEntry[] };
    return json.data || [];
  },

  async simulateNewsletterWebhook(
    secret: string,
    payload: { from: string; subject: string; html?: string; text?: string }
  ): Promise<Source> {
    const res = await fetch(`${API_BASE}/webhooks/newsletter/${encodeURIComponent(secret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Newsletter webhook failed'));
    }
    const json = (await res.json()) as { data: Source };
    return json.data;
  },

  // RSS Feeds
  async getRssFeeds(): Promise<RssFeed[]> {
    const res = await fetch(`${API_BASE}/rss`);
    if (!res.ok) throw new Error('Failed to fetch RSS feeds');
    const json = (await res.json()) as { data: RssFeed[] };
    return json.data;
  },

  async addRssFeed(url: string): Promise<{ feed: RssFeed; addedArticles: number }> {
    const res = await fetch(`${API_BASE}/rss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, sync: true }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to subscribe to RSS feed'));
    }
    const json = (await res.json()) as { data: { feed: RssFeed; addedArticles: number } };
    return json.data;
  },

  async syncRssFeed(id: string): Promise<{ addedArticles: number; feedTitle: string }> {
    const res = await fetch(`${API_BASE}/rss/${id}/sync`, { method: 'POST' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to sync feed'));
    }
    const json = (await res.json()) as { data: { addedArticles: number; feedTitle: string } };
    return json.data;
  },

  async syncAllRssFeeds(): Promise<{ feedsSynced: number; addedArticles: number; errors: number }> {
    const res = await fetch(`${API_BASE}/rss/sync-all`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to sync RSS feeds');
    const json = (await res.json()) as {
      data: { feedsSynced: number; addedArticles: number; errors: number };
    };
    return json.data;
  },

  async deleteRssFeed(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rss/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove feed');
  },

  // Integrations (MCP, Telegram, Notion, Obsidian)
  async testMcp(): Promise<{ toolsCount: number; toolNames: string[] }> {
    const res = await fetch(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    if (!res.ok) throw new Error('MCP endpoint check failed');
    const json = (await res.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const tools = json.result?.tools || [];
    return { toolsCount: tools.length, toolNames: tools.map((t) => t.name) };
  },

  async setTelegramWebhook(origin: string): Promise<{ webhookUrl: string; description?: string }> {
    const res = await fetch(`${API_BASE}/integrations/telegram/set-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to register Telegram webhook'));
    }
    const json = (await res.json()) as {
      data: { webhookUrl: string; description?: string };
    };
    return json.data;
  },

  async testTelegramCapture(text?: string): Promise<{ replyText: string; action: string }> {
    const res = await fetch(`${API_BASE}/integrations/telegram/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res, 'Telegram test failed'));
    const json = (await res.json()) as { data: { replyText: string; action: string } };
    return json.data;
  },

  async testNotionConnection(): Promise<{ databaseId: string; title: string; properties: string[] }> {
    const res = await fetch(`${API_BASE}/integrations/notion/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Notion connection failed'));
    }
    const json = (await res.json()) as {
      data: { databaseId: string; title: string; properties: string[] };
    };
    return json.data;
  },

  async syncNotionLibrary(force = false): Promise<{
    syncedCount: number;
    skippedCount: number;
    databaseTitle: string;
  }> {
    const res = await fetch(`${API_BASE}/integrations/notion/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Notion sync failed'));
    }
    const json = (await res.json()) as {
      data: { syncedCount: number; skippedCount: number; databaseTitle: string };
    };
    return json.data;
  },

  getObsidianExportUrl(favoritesOnly = false): string {
    return `${API_BASE}/export/obsidian${favoritesOnly ? '?favoritesOnly=1' : ''}`;
  },

  // Public Share Links
  async createShareLink(target_type: 'highlight' | 'source', target_id: string): Promise<PublicShare> {
    const res = await fetch(`${API_BASE}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type, target_id }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to create public share link'));
    }
    const json = (await res.json()) as { data: PublicShare };
    return json.data;
  },

  async getShareForTarget(
    target_type: 'highlight' | 'source',
    target_id: string
  ): Promise<PublicShare | null> {
    const res = await fetch(
      `${API_BASE}/shares?target_type=${target_type}&target_id=${encodeURIComponent(target_id)}`
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: PublicShare[] };
    return json.data[0] || null;
  },

  async revokeShareLink(slug: string): Promise<void> {
    const res = await fetch(`${API_BASE}/shares/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to revoke share link');
  },

  async getPublicShare(slug: string): Promise<PublicSharePayload> {
    const res = await fetch(`${API_BASE}/public/share/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Shared link not found'));
    }
    const json = (await res.json()) as { data: PublicSharePayload };
    return json.data;
  },

  // Public REST API Keys
  async getApiKeys(): Promise<ApiKeyItem[]> {
    const res = await fetch(`${API_BASE}/keys`);
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to load API keys'));
    }
    const json = (await res.json()) as { data: ApiKeyItem[] };
    return json.data || [];
  },

  async createApiKey(name: string, scopes = 'read,write'): Promise<CreatedApiKey> {
    const res = await fetch(`${API_BASE}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to create API key'));
    }
    const json = (await res.json()) as { data: CreatedApiKey };
    return json.data;
  },

  async revokeApiKey(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to revoke API key'));
    }
  },
};
