import React, { useEffect, useState } from 'react';
import { Plug, Globe, Download, BookOpen } from 'lucide-react';
import { ApiKeyItem, CreatedApiKey, UserSettings } from '../../types';
import { api } from '../../services/api';
import { McpSection } from './McpSection';
import { TelegramSection } from './TelegramSection';
import { NotionSection } from './NotionSection';
import { NewsletterSection } from './NewsletterSection';
import { ApiKeysSection } from './ApiKeysSection';

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

  // Revealed one-time secrets after regeneration
  const [revealedNewsletterSecret, setRevealedNewsletterSecret] = useState<string | null>(null);
  const [revealedTelegramSecret, setRevealedTelegramSecret] = useState<string | null>(null);

  // Obsidian State
  const [obsidianFavoritesOnly, setObsidianFavoritesOnly] = useState(false);

  // Public REST API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setSettings(s))
      .catch(() => {});

    api
      .getApiKeys()
      .then((keys) => setApiKeys(keys))
      .catch(() => {});
  }, []);

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerateNewsletterSecret = async () => {
    try {
      const updated = await api.updateSettings({ regenerate_newsletter_secret: true });
      setSettings(updated);
      if (updated.newsletter_secret && !updated.newsletter_secret.includes('••••')) {
        setRevealedNewsletterSecret(updated.newsletter_secret);
      }
    } catch {}
  };

  const handleRegenerateTelegramSecret = async () => {
    try {
      const updated = await api.updateSettings({ regenerate_telegram_secret: true });
      setSettings(updated);
      if (updated.telegram_webhook_secret && !updated.telegram_webhook_secret.includes('••••')) {
        setRevealedTelegramSecret(updated.telegram_webhook_secret);
      }
    } catch {}
  };

  const displayNewsletterSecret =
    revealedNewsletterSecret || settings?.newsletter_secret_masked || settings?.newsletter_secret || '<secret>';
  const displayTelegramSecret =
    revealedTelegramSecret || settings?.telegram_webhook_secret_masked || settings?.telegram_webhook_secret || '<secret>';

  const newsletterWebhookUrl = `${origin}/api/webhooks/newsletter/${displayNewsletterSecret}`;
  const telegramWebhookUrl = `${origin}/api/webhooks/telegram/${displayTelegramSecret}`;

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

      {/* 0. Browser Extension Download */}
      <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Browser Extension (Chrome / Edge)
              </h3>
              <p className="text-xs text-neutral-400">
                1-Click web clipper, on-page highlighter, Kindle Notebook sync, and X Bookmarks sync.
              </p>
            </div>
          </div>

          <a
            href="/mnema-extension.zip"
            download="mnema-extension.zip"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Extension (.zip)</span>
          </a>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/70 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">Quick Install:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
            <li>Unzip <code className="font-mono bg-neutral-200/70 dark:bg-neutral-700 px-1 rounded">mnema-extension.zip</code> to a folder.</li>
            <li>Open <code className="font-mono bg-neutral-200/70 dark:bg-neutral-700 px-1 rounded">chrome://extensions</code>, enable <strong>Developer mode</strong>, click <strong>Load unpacked</strong>, and select the unzipped folder.</li>
            <li>Open the extension popup → Settings → set <strong>API URL</strong> to <code className="font-mono bg-neutral-200/70 dark:bg-neutral-700 px-1 rounded">{origin}</code>.</li>
          </ol>
        </div>
      </section>

      {/* 1. MCP Server */}
      <McpSection origin={origin} copiedId={copiedId} onCopy={copyText} />

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
      <TelegramSection
        settings={settings}
        origin={origin}
        telegramWebhookUrl={telegramWebhookUrl}
        copiedId={copiedId}
        onCopy={copyText}
        onRegenerateSecret={handleRegenerateTelegramSecret}
        onSettingsUpdated={(u) => setSettings(u)}
        onRefreshLibrary={onRefreshLibrary}
      />

      {/* 4. Notion Sync */}
      <NotionSection
        settings={settings}
        onSettingsUpdated={(u) => setSettings(u)}
      />

      {/* 5. Newsletter Inbox (Email-to-Save) & RSS */}
      <NewsletterSection
        newsletterWebhookUrl={newsletterWebhookUrl}
        copiedId={copiedId}
        onCopy={copyText}
        onRegenerateSecret={handleRegenerateNewsletterSecret}
        onOpenArticlesRss={onOpenArticlesRss}
        onRefreshLibrary={onRefreshLibrary}
      />

      {/* 6. Public REST API Keys */}
      <ApiKeysSection
        apiKeys={apiKeys}
        origin={origin}
        copiedId={copiedId}
        onCopy={copyText}
        onKeyCreated={(k) => setApiKeys((prev) => [k, ...prev])}
        onKeyRevoked={(id) =>
          setApiKeys((prev) =>
            prev.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k))
          )
        }
      />
    </div>
  );
};
