import { Highlight, Tag, TrashData, PublicShare, PublicSharePayload } from '../../types';
import { API_BASE, apiFetch, parseErrorMessage } from './client';

export const highlightsApi = {
  // Highlights
  async getHighlights(params?: {
    favorite?: boolean;
    tag?: string;
    q?: string;
    source_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<Highlight[]> {
    const query = new URLSearchParams();
    if (params?.favorite) query.set('favorite', '1');
    if (params?.tag) query.set('tag', params.tag);
    if (params?.q) query.set('q', params.q);
    if (params?.source_id) query.set('source_id', params.source_id);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));

    const res = await apiFetch(`${API_BASE}/highlights?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch highlights');
    const json = (await res.json()) as { data: Highlight[] };
    return json.data;
  },

  async getAllHighlights(params?: {
    favorite?: boolean;
    tag?: string;
    q?: string;
    source_id?: string;
  }): Promise<Highlight[]> {
    const all: Highlight[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const page = await this.getHighlights({ ...params, limit, offset });
      all.push(...page);
      if (page.length < limit) break;
      offset += limit;
    }
    return all;
  },

  async createHighlight(data: {
    source_id: string;
    content: string;
    note?: string;
    color?: string;
    location?: string;
    tags?: string[];
  }): Promise<Highlight> {
    const res = await apiFetch(`${API_BASE}/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create highlight');
    const json = (await res.json()) as { data: Highlight };
    return json.data;
  },

  async updateHighlight(id: string, updates: Partial<Highlight>): Promise<Highlight> {
    const res = await apiFetch(`${API_BASE}/highlights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update highlight');
    const json = (await res.json()) as { data: Highlight };
    return json.data;
  },

  async deleteHighlight(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/highlights/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete highlight');
  },

  // Tags
  async getTags(): Promise<Tag[]> {
    const res = await apiFetch(`${API_BASE}/tags`);
    if (!res.ok) throw new Error('Failed to fetch tags');
    const json = (await res.json()) as { data: Tag[] };
    return json.data;
  },

  async createTag(data: { name: string; color?: string }): Promise<Tag> {
    const res = await apiFetch(`${API_BASE}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create tag');
    const json = (await res.json()) as { data: Tag };
    return json.data;
  },

  async updateTag(id: string, updates: { name?: string; color?: string }): Promise<Tag> {
    const res = await apiFetch(`${API_BASE}/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update tag');
    const json = (await res.json()) as { data: Tag };
    return json.data;
  },

  async deleteTag(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/tags/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete tag');
  },

  // Trash API
  async getTrash(): Promise<TrashData> {
    const res = await apiFetch(`${API_BASE}/trash`);
    if (!res.ok) throw new Error('Failed to fetch trash');
    const json = (await res.json()) as { data: TrashData };
    return json.data;
  },

  async restoreTrash(type: 'source' | 'highlight', id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/trash/restore`, {
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

    const res = await apiFetch(`${API_BASE}/trash/permanent?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete item permanently');
  },

  // Public Share Links
  async createShareLink(target_type: 'highlight' | 'source', target_id: string): Promise<PublicShare> {
    const res = await apiFetch(`${API_BASE}/shares`, {
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
    const res = await apiFetch(
      `${API_BASE}/shares?target_type=${target_type}&target_id=${encodeURIComponent(target_id)}`
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: PublicShare[] };
    return json.data[0] || null;
  },

  async revokeShareLink(slug: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/shares/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to revoke share link');
  },

  async getPublicShare(slug: string): Promise<PublicSharePayload> {
    const res = await apiFetch(`${API_BASE}/public/share/${encodeURIComponent(slug)}`, {
      skipAuthIntercept: true,
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Shared link not found'));
    }
    const json = (await res.json()) as { data: PublicSharePayload };
    return json.data;
  },
};
