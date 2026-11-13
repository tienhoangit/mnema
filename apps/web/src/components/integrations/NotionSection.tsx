import React, { useState } from 'react';
import { Database, RefreshCw, Loader2 } from 'lucide-react';
import { UserSettings } from '../../types';
import { api } from '../../services/api';

interface NotionSectionProps {
  settings: UserSettings | null;
  onSettingsUpdated: (updated: UserSettings) => void;
}

export const NotionSection: React.FC<NotionSectionProps> = ({ settings, onSettingsUpdated }) => {
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState(settings?.notion_database_id || '');
  const [notionMsg, setNotionMsg] = useState<string | null>(null);
  const [notionErr, setNotionErr] = useState<string | null>(null);
  const [isTestingNotion, setIsTestingNotion] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);

  React.useEffect(() => {
    if (settings?.notion_database_id !== undefined) {
      setNotionDbId(settings.notion_database_id || '');
    }
  }, [settings?.notion_database_id]);

  const handleSaveAndTestNotion = async () => {
    setIsTestingNotion(true);
    setNotionMsg(null);
    setNotionErr(null);
    try {
      const updated = await api.updateSettings({
        ...(notionToken.trim() ? { notion_token: notionToken.trim() } : {}),
        notion_database_id: notionDbId,
      });
      onSettingsUpdated(updated);
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
      onSettingsUpdated(updated);
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

  return (
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
  );
};
