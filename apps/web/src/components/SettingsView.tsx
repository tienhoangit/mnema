import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sparkles,
  Key,
  Wrench,
  Download,
  Plug,
  ExternalLink,
  Trash2,
  Mail,
  Send,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { EmailPreview, UserSettings } from '../types';
import { api } from '../services/api';

interface SettingsViewProps {
  onOpenToolsModal: () => void;
  onOpenExportModal: () => void;
  onOpenImportModal: () => void;
  onOpenTrash?: () => void;
  onOpenIntegrations?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenToolsModal,
  onOpenExportModal,
  onOpenImportModal,
  onOpenTrash,
  onOpenIntegrations,
}) => {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isKeySaved, setIsKeySaved] = useState(false);

  // Daily Review Email Digest State
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestEmail, setDigestEmail] = useState('');
  const [digestHourUtc, setDigestHourUtc] = useState(8);
  const [digestCount, setDigestCount] = useState(5);
  const [resendApiKey, setResendApiKey] = useState('');
  const [showResendKey, setShowResendKey] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [isSavingDigest, setIsSavingDigest] = useState(false);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);
  const [digestErr, setDigestErr] = useState<string | null>(null);
  const [digestPreview, setDigestPreview] = useState<EmailPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem('mnema_gemini_api_key');
    } catch {}

    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setDigestEnabled(s.digest_enabled);
        setDigestEmail(s.digest_email);
        setDigestHourUtc(s.digest_hour_utc);
        setDigestCount(s.digest_count);
        setFromEmail(s.from_email || '');
      })
      .catch(() => {});
  }, []);

  const handleSaveApiKey = async () => {
    const trimmed = geminiApiKey.trim();
    try {
      localStorage.removeItem('mnema_gemini_api_key');
    } catch {}

    try {
      const updated = await api.updateSettings({ gemini_api_key: trimmed });
      setSettings(updated);
      setGeminiApiKey('');
    } catch {
      // failed to update settings
    }
    setIsKeySaved(true);
    setTimeout(() => setIsKeySaved(false), 2000);
  };

  const handleSaveDigestSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDigest(true);
    setDigestMsg(null);
    setDigestErr(null);

    try {
      const updated = await api.updateSettings({
        digest_enabled: digestEnabled,
        digest_email: digestEmail,
        digest_hour_utc: digestHourUtc,
        digest_count: digestCount,
        ...(resendApiKey.trim() ? { resend_api_key: resendApiKey.trim() } : {}),
        from_email: fromEmail,
      });
      setSettings(updated);
      setResendApiKey('');
      setDigestMsg('Daily Review Email Digest settings saved!');
    } catch (err) {
      setDigestErr(err instanceof Error ? err.message : 'Failed to save digest settings');
    } finally {
      setIsSavingDigest(false);
    }
  };

  const handlePreviewDigest = async () => {
    setIsLoadingPreview(true);
    setDigestErr(null);
    try {
      const prev = await api.getDigestPreview(digestCount);
      setDigestPreview(prev);
    } catch (err) {
      setDigestErr(err instanceof Error ? err.message : 'Failed to preview digest');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSendTestDigest = async () => {
    setIsSendingTest(true);
    setDigestMsg(null);
    setDigestErr(null);
    try {
      const updated = await api.updateSettings({
        digest_enabled: digestEnabled,
        digest_email: digestEmail,
        digest_hour_utc: digestHourUtc,
        digest_count: digestCount,
        ...(resendApiKey.trim() ? { resend_api_key: resendApiKey.trim() } : {}),
        from_email: fromEmail,
      });
      setSettings(updated);
      setResendApiKey('');
      const res = await api.sendTestDigest({ to: digestEmail, count: digestCount });
      setDigestMsg(`Test digest sent to ${res.recipient} (${res.highlightsCount} highlights)!`);
    } catch (err) {
      setDigestErr(err instanceof Error ? err.message : 'Failed to send test digest');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-4 sm:p-6 pb-24 max-w-4xl mx-auto space-y-8 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-bold text-xs uppercase tracking-wider mb-1">
          <Settings className="w-4 h-4" />
          <span>Preferences & Connectivity</span>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Settings</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Configure zero-cost AI inference, Daily Email Digests, and library maintenance tools.
        </p>
      </div>

      {/* Section 1: AI Copilot & Gemini Key */}
      <section className="p-4 sm:p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Google Gemini Free API Key
              </h3>
              <p className="text-xs text-neutral-400">
                Powers Book Page OCR, Semantic Search, AI Tidy-Up, and Ask AI at 0đ cost.
              </p>
            </div>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Get Free Key</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <Key className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder={
                settings?.gemini_api_key_masked
                  ? `Saved on server (${settings.gemini_api_key_masked}) — enter new key to replace`
                  : 'Paste your Google Gemini API key (AIzaSy...)...'
              }
              className="w-full pl-9 pr-11 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-xs border border-neutral-200 dark:border-neutral-700 focus:outline-hidden focus:border-teal-700 min-h-[44px]"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              title={showGeminiKey ? 'Hide key' : 'Show key'}
            >
              {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleSaveApiKey}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors shrink-0 flex items-center justify-center"
          >
            {isKeySaved ? 'Saved!' : 'Save Key'}
          </button>
        </div>
      </section>

      {/* Section 2: Daily Review Email Digest */}
      <section className="p-4 sm:p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Daily Review Email Digest
              </h3>
              <p className="text-xs text-neutral-400">
                Receive scheduled daily highlights via Cloudflare Cron + free Resend API (100 emails/day free).
              </p>
            </div>
          </div>

          <a
            href="https://resend.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Get Free Resend Key</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <form onSubmit={handleSaveDigestSettings} className="space-y-4 pt-1">
          <label className="flex items-center gap-2.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer">
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(e) => setDigestEnabled(e.target.checked)}
              className="rounded border-neutral-300 text-teal-700 focus:ring-teal-700"
            />
            <span>Enable automated Daily Email Digest (runs hourly via Cron Trigger)</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                value={digestEmail}
                onChange={(e) => setDigestEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                Resend API Key (re_...)
              </label>
              <div className="relative">
                <input
                  type={showResendKey ? 'text' : 'password'}
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  placeholder={
                    settings?.resend_api_key_masked
                      ? `Saved (${settings.resend_api_key_masked}) — leave blank to keep`
                      : 're_xxxxxxxxx'
                  }
                  className="w-full pl-3 pr-11 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => setShowResendKey(!showResendKey)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  title={showResendKey ? 'Hide key' : 'Show key'}
                >
                  {showResendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                Delivery Hour (UTC)
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={digestHourUtc}
                  onChange={(e) => setDigestHourUtc(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 UTC ({String((h + 7) % 24).padStart(2, '0')}:00 ICT)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                Highlights Per Digest
              </label>
              <select
                value={digestCount}
                onChange={(e) => setDigestCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                {[3, 5, 7, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n} Highlights
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
              From Address (Optional — defaults to onboarding@resend.dev on Free Tier)
            </label>
            <input
              type="text"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="Mnema Digest <onboarding@resend.dev>"
              className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            />
          </div>

          {settings?.last_digest_sent_at && (
            <p className="text-[11px] text-neutral-400">
              Last sent: {new Date(settings.last_digest_sent_at).toLocaleString()}
            </p>
          )}

          {digestMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{digestMsg}</span>
            </div>
          )}

          {digestErr && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{digestErr}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
            <button
              type="submit"
              disabled={isSavingDigest}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center"
            >
              {isSavingDigest ? 'Saving...' : 'Save Digest Settings'}
            </button>

            <button
              type="button"
              onClick={handlePreviewDigest}
              disabled={isLoadingPreview}
              className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              {isLoadingPreview ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              <span>Preview Email</span>
            </button>

            <button
              type="button"
              onClick={handleSendTestDigest}
              disabled={isSendingTest || !digestEmail.trim()}
              className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-50"
            >
              {isSendingTest ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send Test Digest</span>
            </button>
          </div>
        </form>

        {digestPreview && (
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-2xl overflow-hidden mt-3">
            <div className="px-3.5 py-2 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-between text-xs font-semibold">
              <span className="truncate">{digestPreview.subject}</span>
              <button
                onClick={() => setDigestPreview(null)}
                className="text-neutral-400 hover:text-neutral-700 ml-2"
              >
                Close
              </button>
            </div>
            <iframe
              title="Digest Preview"
              srcDoc={digestPreview.html}
              className="w-full h-80 bg-white border-0"
              sandbox=""
            />
          </div>
        )}
      </section>

      {/* Section 3: Library Maintenance Tools */}
      <section className="p-4 sm:p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-800 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Library Maintenance Tools
            </h3>
            <p className="text-xs text-neutral-400">
              Clean up empty books, deduplicate highlights, and trash misclicks.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={onOpenToolsModal}
            className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-teal-700/60 text-left transition-colors bg-neutral-50/50 dark:bg-neutral-800/40 min-h-[44px]"
          >
            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              Merge Duplicates
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              Combine identical quotes into one record
            </p>
          </button>

          <button
            onClick={onOpenToolsModal}
            className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-teal-700/60 text-left transition-colors bg-neutral-50/50 dark:bg-neutral-800/40 min-h-[44px]"
          >
            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              Remove Empty Sources
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">Purge books without any highlights</p>
          </button>

          <button
            onClick={onOpenToolsModal}
            className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-teal-700/60 text-left transition-colors bg-neutral-50/50 dark:bg-neutral-800/40 min-h-[44px]"
          >
            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              Trash Tiny Snippets
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">Remove accidental 1-word highlights</p>
          </button>
        </div>
      </section>

      {/* Section 4: Import, Export & Integrations */}
      <section className="p-4 sm:p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <Plug className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Import, Export & Connected Apps
              </h3>
              <p className="text-xs text-neutral-400">
                Import Kindle, Readwise, Goodreads, or PDF; export Markdown/CSV/Obsidian Vault.
              </p>
            </div>
          </div>

          {onOpenIntegrations && (
            <button
              onClick={onOpenIntegrations}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-100 flex items-center"
            >
              Open Integrations →
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-1">
          <button
            onClick={onOpenImportModal}
            className="flex-1 min-w-[200px] min-h-[44px] py-2.5 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-semibold transition-colors flex items-center justify-center"
          >
            Import (Kindle / Readwise / CSV / PDF)
          </button>
          <button
            onClick={onOpenExportModal}
            className="flex-1 min-w-[200px] min-h-[44px] py-2.5 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Library (Obsidian / MD / CSV)</span>
          </button>
        </div>
      </section>

      {/* Section 5: Trash Bin & Recovery */}
      <section className="p-4 sm:p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Trash Bin & Data Recovery
              </h3>
              <p className="text-xs text-neutral-400">
                View recently deleted sources, books, and quotes. Restore them or permanently purge them.
              </p>
            </div>
          </div>

          {onOpenTrash && (
            <button
              onClick={onOpenTrash}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Open Trash Bin</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
