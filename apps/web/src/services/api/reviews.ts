import { Highlight, ReviewAction, StreakStats, FullStats } from '../../types';
import { API_BASE, apiFetch, parseErrorMessage } from './client';

export const reviewsApi = {
  // Daily SRS Reviews & Streak
  async getReviewQueue(limit = 15): Promise<Highlight[]> {
    const res = await apiFetch(`${API_BASE}/reviews/queue?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch review queue');
    const json = (await res.json()) as { data: Highlight[] };
    return json.data;
  },

  async submitReviewAction(id: string, action: ReviewAction): Promise<unknown> {
    const res = await apiFetch(`${API_BASE}/reviews/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error('Failed to submit review');
    return res.json();
  },

  async undoReview(): Promise<{ highlight: Highlight; undoneAction: string }> {
    const res = await apiFetch(`${API_BASE}/reviews/undo`, {
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
    const res = await apiFetch(`${API_BASE}/reviews/streak`);
    if (!res.ok) throw new Error('Failed to fetch streak');
    const json = (await res.json()) as { data: StreakStats };
    return json.data;
  },

  // Custom Topic Review
  async startCustomReview(params: {
    topic?: string;
    source_id?: string;
    tag?: string;
    count?: number;
  }): Promise<{ sessionId: string; topic: string; highlights: Highlight[] }> {
    const res = await apiFetch(`${API_BASE}/reviews/custom`, {
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

  // Full Analytics
  async getFullStats(): Promise<FullStats> {
    const res = await apiFetch(`${API_BASE}/stats/full`);
    if (!res.ok) throw new Error('Failed to fetch full stats');
    const json = (await res.json()) as { data: FullStats };
    return json.data;
  },

  async getActivityStats(): Promise<Array<{ date: string; count: number }>> {
    const res = await apiFetch(`${API_BASE}/stats/activity`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Array<{ date: string; count: number }> };
    return json.data || [];
  },

  // Library Tools
  async runLibraryTool(
    tool: 'merge-duplicates' | 'remove-empty' | 'trash-tiny'
  ): Promise<Record<string, unknown>> {
    const res = await apiFetch(`${API_BASE}/tools/${tool}`, { method: 'POST' });
    if (!res.ok) throw new Error('Tool execution failed');
    return res.json() as Promise<Record<string, unknown>>;
  },
};
