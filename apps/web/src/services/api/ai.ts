import {
  SearchResults,
  SemanticSearchResult,
  EmbeddingsStatus,
  Highlight,
  OcrResult,
  TopicDiscoveryResult,
} from '../../types';
import { API_BASE, apiFetch, parseErrorMessage } from './client';

export const aiApi = {
  // Search & Semantic AI Search
  async searchFulltext(query: string, type = 'all'): Promise<SearchResults> {
    const res = await apiFetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`
    );
    if (!res.ok) throw new Error('Failed to search');
    const json = (await res.json()) as { data: SearchResults };
    return json.data;
  },

  async searchSemantic(query: string, limit = 15, apiKey?: string): Promise<SemanticSearchResult> {
    const res = await apiFetch(`${API_BASE}/search/semantic`, {
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

  async syncEmbeddings(apiKey?: string, batchLimit = 30): Promise<{
    indexedCount: number;
    totalHighlights: number;
    model: string;
    provider: string;
  }> {
    const res = await apiFetch(`${API_BASE}/search/embeddings/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, batchLimit }),
    });
    if (!res.ok) throw new Error('Failed to sync semantic index');
    const json = (await res.json()) as {
      data: { indexedCount: number; totalHighlights: number; model: string; provider: string };
    };
    return json.data;
  },

  async getEmbeddingsStatus(apiKey?: string): Promise<EmbeddingsStatus> {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Gemini-Key'] = apiKey;
    const res = await apiFetch(`${API_BASE}/search/embeddings/status`, { headers });
    if (!res.ok) throw new Error('Failed to check semantic index status');
    const json = (await res.json()) as { data: EmbeddingsStatus };
    return json.data;
  },

  async getSimilarHighlights(highlightId: string, apiKey?: string): Promise<Highlight[]> {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Gemini-Key'] = apiKey;
    const res = await apiFetch(`${API_BASE}/search/similar/${highlightId}`, { headers });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { similar: Highlight[] } };
    return json.data?.similar || [];
  },

  async askLibraryAi(
    question: string,
    apiKey?: string
  ): Promise<{ answer: string; citations: Highlight[] }> {
    const res = await apiFetch(`${API_BASE}/search/ask`, {
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

  // AI Assistant & Book Page OCR
  async tidyUpText(text: string, apiKey?: string): Promise<string> {
    const res = await apiFetch(`${API_BASE}/ai/cleanup`, {
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
    const res = await apiFetch(`${API_BASE}/ai/ocr`, {
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
    const res = await apiFetch(`${API_BASE}/ai/ask`, {
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

  async askArticleQuestion(
    question: string,
    context: string,
    apiKey?: string
  ): Promise<{ answer: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-Gemini-Key'] = apiKey;
    const res = await apiFetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, context, apiKey }),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res, 'AI analysis failed'));
    const json = (await res.json()) as { data: { answer: string } };
    return json.data;
  },

  async getAiThreadByHighlight(highlightId: string): Promise<{
    id: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } | null> {
    const res = await apiFetch(`${API_BASE}/ai/threads?highlight_id=${encodeURIComponent(highlightId)}`);
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
    const res = await apiFetch(`${API_BASE}/ai/ask-highlight`, {
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
    const res = await apiFetch(`${API_BASE}/ai/suggest-tags`, {
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
    const res = await apiFetch(`${API_BASE}/ai/inline-action`, {
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
    const res = await apiFetch(`${API_BASE}/ai/discover-topics`, {
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
};
