import React, { useEffect, useState } from 'react';
import {
  Plug,
  Cpu,
  Copy,
  Check,
  Send,
  Download,
  RefreshCw,
  Mail,
  BookOpen,
  Rss,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Play,
  Key,
  Trash2,
  Plus,
} from 'lucide-react';
import { ApiKeyItem, CreatedApiKey, UserSettings } from '../types';
import { api } from '../services/api';

interface IntegrationsViewProps {
  onOpenArticlesRss?: () => void;
  onRefreshLibrary?: () => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  onOpenArticlesRss,
  onRefreshLibrary,
}) => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // MCP State
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);
  const [isTestingMcp, setIsTestingMcp] = useState(false);

  // Telegram State
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramMsg, setTelegramMsg] = useState<string | null>(null);
  const [telegramErr, setTelegramErr] = useState<string | null>(null);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  // Notion State
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [notionMsg, setNotionMsg] = useState<string | null>(null);
  const [notionErr, setNotionErr] = useState<string | null>(null);
  const [isTestingNotion, setIsTestingNotion] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);

  // Newsletter State
  const [testNewsletterFrom, setTestNewsletterFrom] = useState('Stratechery <ben@stratechery.com>');
  const [testNewsletterSubject, setTestNewsletterSubject] = useState('Sample Newsletter Issue');
  const [testNewsletterBody, setTestNewsletterBody] = useState(
    'Aggregation Theory explains how the internet changed distribution economics from supply-side scarcity to demand-side aggregation.'
  );
  const [newsletterMsg, setNewsletterMsg] = useState<string | null>(null);
  const [isTestingNewsletter, setIsTestingNewsletter] = useState(false);

  // Obsidian State
  const [obsidianFavoritesOnly, setObsidianFavoritesOnly] = useState(false);

  // Public REST API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<'read,write' | 'read'>('read,write');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const mcpUrl = `${origin}/api/mcp`;

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setTelegramChatId(s.telegram_allowed_chat_id || '');
        setNotionDbId(s.notion_database_id || '');
      })
      .catch(() => {});

    api
      .getApiKeys()
      .then((keys) => setApiKeys(keys))
      .catch(() => {});
  }, []);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKeyName.trim();
    if (!trimmed) return;
    setIsCreatingKey(true);
    setApiKeyError(null);
    try {
      const created = await api.createApiKey(trimmed, newKeyScopes);
      setCreatedKey(created);
      setApiKeys((prev) => [created, ...prev]);
      setNewKeyName('');
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    setApiKeyError(null);
    try {
      await api.revokeApiKey(id);
      setApiKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k))
      );
      if (createdKey?.id === id) {
        setCreatedKey(null);
      }
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        mnema: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpUrl],
        },
      },
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        mnema: {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  );

  const handleTestMcp = async () => {
    setIsTestingMcp(true);
    setMcpStatus(null);
    try {
      const res = await api.testMcp();
      setMcpStatus(`Connected! ${res.toolsCount} tools ready: ${res.toolNames.join(', ')}`);
    } catch (err) {
      setMcpStatus(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsTestingMcp(false);
    }
  };

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    setTelegramMsg(null);
    setTelegramErr(null);
    try {
      const updated = await api.updateSettings({
        ...(telegramToken.trim() ? { telegram_bot_token: telegramToken.trim() } : {}),
        telegram_allowed_chat_id: telegramChatId,
      });
      setSettings(updated);
      setTelegramToken('');
      setTelegramMsg('Telegram settings saved.');
    } catch (err) {
      setTelegramErr(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleRegisterTelegramWebhook = async () => {
    setIsSavingTelegram(true);
    setTelegramMsg(null);
    setTelegramErr(null);
    try {
      const updated = await api.updateSettings({
        ...(telegramToken.trim() ? { telegram_bot_token: telegramToken.trim() } : {}),
        telegram_allowed_chat_id: telegramChatId,
      });
      setSettings(updated);
      setTelegramToken('');
      const res = await api.setTelegramWebhook(origin);
      setTelegramMsg(`Webhook registered: ${res.webhookUrl}`);
    } catch (err) {
      setTelegramErr(err instanceof Error ? err.message : 'Failed to register webhook');
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleSimulateTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramMsg(null);
    setTelegramErr(null);
    try {
      const res = await api.testTelegramCapture();
      setTelegramMsg(res.replyText);
      onRefreshLibrary?.();
    } catch (err) {
      setTelegramErr(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveAndTestNotion = async () => {
    setIsTestingNotion(true);
    setNotionMsg(null);
    setNotionErr(null);
    try {
      const updated = await api.updateSettings({
        ...(notionToken.trim() ? { notion_token: notionToken.trim() } : {}),
        notion_database_id: notionDbId,
      });
      setSettings(updated);
      setNotionToken('');
      const res = await api.testNotionConnection();
      setNotionMsg(
        `Connected to "${res.title}" (Properties: ${res.properties.slice(0, 5).join(', ')})`
      );
    } catch (err) {
      setNotionErr(err instanceof Error ? err.message : 'Notion connection failed');
    } finally {
      setIsTestingNotion(false);
    }
  };

  const handleSyncNotion = async () => {
    setIsSyncingNotion(true);
    setNotionMsg(null);
    setNotionErr(null);
    try {
      const updated = await api.updateSettings({
        ...(notionToken.trim() ? { notion_token: notionToken.trim() } : {}),
        notion_database_id: notionDbId,
      });
      setSettings(updated);
      setNotionToken('');
      const res = await api.syncNotionLibrary(false);
      setNotionMsg(
        `Synced ${res.syncedCount} sources to "${res.databaseTitle}" (${res.skippedCount} already synced).`
      );
    } catch (err) {
      setNotionErr(err instanceof Error ? err.message : 'Notion sync failed');
    } finally {
      setIsSyncingNotion(false);
    }
  };

  const handleTestNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings?.newsletter_secret) return;
    setIsTestingNewsletter(true);
    setNewsletterMsg(null);
    try {
      const src = await api.simulateNewsletterWebhook(settings.newsletter_secret, {
        from: testNewsletterFrom,
        subject: testNewsletterSubject,
        text: testNewsletterBody,
      });
      setNewsletterMsg(`Saved newsletter "${src.name}" to Articles → Inbox!`);
      onRefreshLibrary?.();
    } catch (err) {
      setNewsletterMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsTestingNewsletter(false);
    }
  };

  const newsletterWebhookUrl = settings?.newsletter_secret
    ? `${origin}/api/webhooks/newsletter/${settings.newsletter_secret}`
    : `${origin}/api/webhooks/newsletter/<secret>`;

  const telegramWebhookUrl = settings?.telegram_webhook_secret
    ? `${origin}/api/webhooks/telegram/${settings.telegram_webhook_secret}`
    : `${origin}/api/webhooks/telegram/<secret>`;

  const emailRoutingSnippet = `// Cloudflare Email Routing Worker (0đ Free Tier)
export default {
  async email(message, env, ctx) {
    const raw = await new Response(message.raw).text();
    await fetch("${newsletterWebhookUrl}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: message.from,
        subject: message.headers.get("subject") || "Newsletter",
        raw
      })
    });
  }
}`;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-6 max-w-4xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-bold text-xs uppercase tracking-wider mb-1">
          <Plug className="w-4 h-4" />
          <span>Connected Ecosystem</span>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Integrations</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Connect AI assistants (MCP), Telegram capture, Newsletter Email Routing, Obsidian Vault, and Notion on Cloudflare Free Tier.
        </p>
      </div>

      {/* 1. MCP Server */}
      <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Model Context Protocol (MCP) Server
              </h3>
              <p className="text-xs text-neutral-400">
                Let Claude Desktop or Cursor query your books, highlights, and notes directly.
              </p>
            </div>
          </div>

          <button
            onClick={handleTestMcp}
            disabled={isTestingMcp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold"
          >
            {isTestingMcp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>Test MCP</span>
          </button>
        </div>

        <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-mono flex items-center justify-between gap-2">
          <span className="truncate text-neutral-800 dark:text-neutral-200">{mcpUrl}</span>
          <button
            onClick={() => copyText('mcp-url', mcpUrl)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-sans font-semibold flex items-center gap-1 shrink-0"
          >
            {copiedId === 'mcp-url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copiedId === 'mcp-url' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {mcpStatus && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs">
            {mcpStatus}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
              <span>Claude Desktop (claude_desktop_config.json)</span>
              <button onClick={() => copyText('claude-cfg', claudeConfig)} className="text-teal-700 hover:underline">
                {copiedId === 'claude-cfg' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 overflow-x-auto">
              {claudeConfig}
            </pre>
          </div>

          <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
              <span>Cursor (.cursor/mcp.json)</span>
              <button onClick={() => copyText('cursor-cfg', cursorConfig)} className="text-teal-700 hover:underline">
                {copiedId === 'cursor-cfg' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 overflow-x-auto">
              {cursorConfig}
            </pre>
          </div>
        </div>
      </section>

      {/* 2. Obsidian Vault Export (.zip) */}
      <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Obsidian Vault Export (.zip)
              </h3>
              <p className="text-xs text-neutral-400">
                Download your entire library as Obsidian-ready Markdown files with YAML frontmatter, tags, and wikilinks.
              </p>
            </div>
          </div>

          <a
            href={api.getObsidianExportUrl(obsidianFavoritesOnly)}
            download
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Obsidian Vault (.zip)</span>
          </a>
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={obsidianFavoritesOnly}
            onChange={(e) => setObsidianFavoritesOnly(e.target.checked)}
            className="rounded border-neutral-300 text-purple-600"
          />
          <span>Only include Starred / Favorite highlights</span>
        </label>
      </section>

      {/* 3. Telegram Bot Capture */}
      <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Telegram Bot Quick Capture
            </h3>
            <p className="text-xs text-neutral-400">
              Send any URL or quote to your Telegram Bot (@BotFather) to save it straight into Mnema.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
              Bot Token (from @BotFather)
            </label>
            <input
              type="password"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder={
                settings?.telegram_bot_token_masked
                  ? `Saved (${settings.telegram_bot_token_masked}) — leave blank to keep`
                  : '123456789:ABCdef...'
              }
              className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
              Allowed Chat ID (Optional security lock)
            </label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="e.g. 987654321"
              className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[11px] font-mono flex items-center justify-between gap-2">
          <span className="truncate">Webhook: {telegramWebhookUrl}</span>
          <button
            onClick={() => copyText('tg-webhook', telegramWebhookUrl)}
            className="text-teal-700 font-sans font-semibold shrink-0"
          >
            {copiedId === 'tg-webhook' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {telegramMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{telegramMsg}</span>
          </div>
        )}
        {telegramErr && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{telegramErr}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveTelegram}
            disabled={isSavingTelegram}
            className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Save Token
          </button>
          <button
            onClick={handleRegisterTelegramWebhook}
            disabled={isSavingTelegram}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
          >
            Register Webhook with Telegram
          </button>
          <button
            onClick={handleSimulateTelegram}
            disabled={isTestingTelegram}
            className="px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-medium hover:bg-neutral-200"
          >
            {isTestingTelegram ? 'Testing...' : 'Simulate Capture'}
          </button>
        </div>
      </section>

      {/* 4. Notion Sync */}
      <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Notion Database Sync
            </h3>
            <p className="text-xs text-neutral-400">
              Sync books, articles, and highlights into a Notion Database using a free Notion Internal Integration.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
              Notion Integration Secret (ntn_... / secret_...)
            </label>
            <input
              type="password"
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
              placeholder={
                settings?.notion_token_masked
                  ? `Saved (${settings.notion_token_masked}) — leave blank to keep`
                  : 'ntn_...'
              }
              className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
              Notion Database ID
            </label>
            <input
              type="text"
              value={notionDbId}
              onChange={(e) => setNotionDbId(e.target.value)}
              placeholder="32-char database ID from Notion URL"
              className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
          </div>
        </div>

        {notionMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs">
            {notionMsg}
          </div>
        )}
        {notionErr && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 text-xs">
            {notionErr}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveAndTestNotion}
            disabled={isTestingNotion}
            className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            {isTestingNotion ? 'Checking...' : 'Save & Test Connection'}
          </button>
          <button
            onClick={handleSyncNotion}
            disabled={isSyncingNotion}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold"
          >
            {isSyncingNotion ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sync Library to Notion</span>
          </button>
        </div>
      </section>

      {/* 5. Newsletter Inbox (Email-to-Save) & RSS */}
      <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Newsletter Inbox (Email-to-Save)
              </h3>
              <p className="text-xs text-neutral-400">
                Forward newsletters via Cloudflare Email Routing Worker to save them automatically as readable Articles.
              </p>
            </div>
          </div>

          {onOpenArticlesRss && (
            <button
              onClick={onOpenArticlesRss}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <Rss className="w-3.5 h-3.5 text-orange-500" />
              <span>Manage RSS Feeds</span>
            </button>
          )}
        </div>

        <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[11px] font-mono flex items-center justify-between gap-2">
          <span className="truncate">{newsletterWebhookUrl}</span>
          <button
            onClick={() => copyText('nl-url', newsletterWebhookUrl)}
            className="text-teal-700 font-sans font-semibold shrink-0"
          >
            {copiedId === 'nl-url' ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
            <span>Cloudflare Email Routing Worker Snippet</span>
            <button
              onClick={() => copyText('cf-email', emailRoutingSnippet)}
              className="text-teal-700 hover:underline"
            >
              {copiedId === 'cf-email' ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 overflow-x-auto">
            {emailRoutingSnippet}
          </pre>
        </div>

        <form onSubmit={handleTestNewsletter} className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
          <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
            Test Newsletter Capture
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={testNewsletterFrom}
              onChange={(e) => setTestNewsletterFrom(e.target.value)}
              placeholder="From"
              className="px-3 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
            <input
              type="text"
              value={testNewsletterSubject}
              onChange={(e) => setTestNewsletterSubject(e.target.value)}
              placeholder="Subject"
              className="px-3 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
          </div>
          <textarea
            rows={2}
            value={testNewsletterBody}
            onChange={(e) => setTestNewsletterBody(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
          />
          <div className="flex items-center justify-between gap-2">
            {newsletterMsg ? (
              <span className="text-xs text-emerald-600 font-medium">{newsletterMsg}</span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={isTestingNewsletter}
              className="px-4 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold"
            >
              {isTestingNewsletter ? 'Saving...' : 'Send Test Newsletter'}
            </button>
          </div>
        </form>
      </section>

      {/* 6. Public REST API Keys */}
      <section className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Public REST API Keys
              </h3>
              <p className="text-xs text-neutral-500">
                Authenticate iOS Shortcuts, Raycast script commands, or CLI tools with <code className="font-mono">X-Api-Key</code> without OAuth 2.1 DCR.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleCreateApiKey} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key label (e.g. iOS Shortcut, Raycast)"
            className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
          />
          <select
            value={newKeyScopes}
            onChange={(e) => setNewKeyScopes(e.target.value as 'read,write' | 'read')}
            className="px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
          >
            <option value="read,write">Read & Write</option>
            <option value="read">Read Only</option>
          </select>
          <button
            type="submit"
            disabled={isCreatingKey || !newKeyName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isCreatingKey ? 'Generating...' : 'Generate Key'}</span>
          </button>
        </form>

        {apiKeyError && (
          <div className="text-xs text-red-600 font-medium flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{apiKeyError}</span>
          </div>
        )}

        {createdKey && (
          <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Save this API key now — it will not be shown again:
              </span>
              <button
                type="button"
                onClick={() => copyText('new-api-key', createdKey.key)}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:underline"
              >
                {copiedId === 'new-api-key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'new-api-key' ? 'Copied!' : 'Copy Key'}</span>
              </button>
            </div>
            <code className="block p-2 rounded-lg bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800 text-xs font-mono break-all select-all">
              {createdKey.key}
            </code>
            <pre className="text-[10px] font-mono text-emerald-900/80 dark:text-emerald-200/80 overflow-x-auto">
              {`curl -X POST "${origin}/api/sources" -H "X-Api-Key: ${createdKey.key}" -H "Content-Type: application/json" -d '{"url":"https://example.com"}'`}
            </pre>
          </div>
        )}

        <div className="space-y-2">
          {apiKeys.length === 0 ? (
            <p className="text-xs text-neutral-400">No API keys created yet.</p>
          ) : (
            apiKeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                      {k.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                      {k.key_prefix}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 font-medium">
                      {k.scopes}
                    </span>
                    {k.revoked_at && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-semibold">
                        Revoked
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at ? ` • Last used ${new Date(k.last_used_at).toLocaleString()}` : ' • Never used'}
                  </p>
                </div>

                {!k.revoked_at && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeApiKey(k.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Revoke</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
