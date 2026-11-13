import {
  UserSettings,
  UserSettingsUpdate,
  EmailPreview,
  EmailLogEntry,
  Source,
  RssFeed,
  ApiKeyItem,
  CreatedApiKey,
} from '../../types';
import { API_BASE, apiFetch, parseErrorMessage } from './client';

export const integrationsApi = {
  // Email, Digest & User Settings
  async getSettings(): Promise<UserSettings> {
    const res = await apiFetch(`${API_BASE}/email/settings`);
    if (!res.ok) throw new Error('Failed to load settings');
    const json = (await res.json()) as { data: UserSettings };
    return json.data;
  },

  async updateSettings(updates: UserSettingsUpdate): Promise<UserSettings> {
    const res = await apiFetch(`${API_BASE}/email/settings`, {
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
    const res = await apiFetch(`${API_BASE}/email/digest/preview${q}`);
    if (!res.ok) throw new Error('Failed to generate digest preview');
    const json = (await res.json()) as { data: EmailPreview };
    return json.data;
  },

  async sendTestDigest(params?: { to?: string; count?: number }): Promise<{
    recipient: string;
    highlightsCount: number;
    subject: string;
  }> {
    const res = await apiFetch(`${API_BASE}/email/digest/send`, {
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
    const res = await apiFetch(`${API_BASE}/email/send-highlight`, {
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
    const res = await apiFetch(`${API_BASE}/email/send-source`, {
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
    const res = await apiFetch(`${API_BASE}/email/logs`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data: EmailLogEntry[] };
    return json.data || [];
  },

  async simulateNewsletterWebhook(
    secret: string,
    payload: { from: string; subject: string; html?: string; text?: string }
  ): Promise<Source> {
    const res = await apiFetch(`${API_BASE}/webhooks/newsletter/${encodeURIComponent(secret)}`, {
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
    const res = await apiFetch(`${API_BASE}/rss`);
    if (!res.ok) throw new Error('Failed to fetch RSS feeds');
    const json = (await res.json()) as { data: RssFeed[] };
    return json.data;
  },

  async addRssFeed(url: string): Promise<{ feed: RssFeed; addedArticles: number }> {
    const res = await apiFetch(`${API_BASE}/rss`, {
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
    const res = await apiFetch(`${API_BASE}/rss/${id}/sync`, { method: 'POST' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to sync feed'));
    }
    const json = (await res.json()) as { data: { addedArticles: number; feedTitle: string } };
    return json.data;
  },

  async syncAllRssFeeds(): Promise<{ feedsSynced: number; addedArticles: number; errors: number }> {
    const res = await apiFetch(`${API_BASE}/rss/sync-all`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to sync RSS feeds');
    const json = (await res.json()) as {
      data: { feedsSynced: number; addedArticles: number; errors: number };
    };
    return json.data;
  },

  async deleteRssFeed(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/rss/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove feed');
  },

  // Integrations (MCP, Telegram, Notion, Obsidian)
  async testMcp(): Promise<{ toolsCount: number; toolNames: string[] }> {
    const res = await apiFetch(`${API_BASE}/mcp`, {
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
    const res = await apiFetch(`${API_BASE}/integrations/telegram/set-webhook`, {
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
    const res = await apiFetch(`${API_BASE}/integrations/telegram/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res, 'Telegram test failed'));
    const json = (await res.json()) as { data: { replyText: string; action: string } };
    return json.data;
  },

  async testNewsletterCapture(payload: {
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<Source> {
    const res = await apiFetch(`${API_BASE}/integrations/newsletter/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Newsletter test failed'));
    }
    const json = (await res.json()) as { data: Source };
    return json.data;
  },

  async testNotionConnection(): Promise<{ databaseId: string; title: string; properties: string[] }> {
    const res = await apiFetch(`${API_BASE}/integrations/notion/test`, {
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
    const res = await apiFetch(`${API_BASE}/integrations/notion/sync`, {
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

  // Public REST API Keys
  async getApiKeys(): Promise<ApiKeyItem[]> {
    const res = await apiFetch(`${API_BASE}/keys`);
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to load API keys'));
    }
    const json = (await res.json()) as { data: ApiKeyItem[] };
    return json.data || [];
  },

  async createApiKey(name: string, scopes = 'read,write'): Promise<CreatedApiKey> {
    const res = await apiFetch(`${API_BASE}/keys`, {
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
    const res = await apiFetch(`${API_BASE}/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to revoke API key'));
    }
  },
};
