import React, { useState } from 'react';
import { Key, Plus, AlertCircle, Copy, Check, Trash2 } from 'lucide-react';
import { ApiKeyItem, CreatedApiKey } from '../../types';
import { api } from '../../services/api';

interface ApiKeysSectionProps {
  apiKeys: ApiKeyItem[];
  origin: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onKeyCreated: (key: CreatedApiKey) => void;
  onKeyRevoked: (id: string) => void;
}

export const ApiKeysSection: React.FC<ApiKeysSectionProps> = ({
  apiKeys,
  origin,
  copiedId,
  onCopy,
  onKeyCreated,
  onKeyRevoked,
}) => {
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<'read,write' | 'read'>('read,write');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKeyName.trim();
    if (!trimmed) return;
    setIsCreatingKey(true);
    setApiKeyError(null);
    try {
      const created = await api.createApiKey(trimmed, newKeyScopes);
      setCreatedKey(created);
      onKeyCreated(created);
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
      onKeyRevoked(id);
      if (createdKey?.id === id) {
        setCreatedKey(null);
      }
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  return (
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
              onClick={() => onCopy('new-api-key', createdKey.key)}
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
  );
};
