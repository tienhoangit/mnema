import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserSettings } from '../../types';
import { api } from '../../services/api';

interface TelegramSectionProps {
  settings: UserSettings | null;
  origin: string;
  telegramWebhookUrl: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerateSecret: () => void;
  onSettingsUpdated: (updated: UserSettings) => void;
  onRefreshLibrary?: () => void;
}

export const TelegramSection: React.FC<TelegramSectionProps> = ({
  settings,
  origin,
  telegramWebhookUrl,
  copiedId,
  onCopy,
  onRegenerateSecret,
  onSettingsUpdated,
  onRefreshLibrary,
}) => {
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState(settings?.telegram_allowed_chat_id || '');
  const [telegramMsg, setTelegramMsg] = useState<string | null>(null);
  const [telegramErr, setTelegramErr] = useState<string | null>(null);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  // Sync telegramChatId if settings change initially
  React.useEffect(() => {
    if (settings?.telegram_allowed_chat_id !== undefined) {
      setTelegramChatId(settings.telegram_allowed_chat_id || '');
    }
  }, [settings?.telegram_allowed_chat_id]);

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    setTelegramMsg(null);
    setTelegramErr(null);
    try {
      const updated = await api.updateSettings({
        ...(telegramToken.trim() ? { telegram_bot_token: telegramToken.trim() } : {}),
        telegram_allowed_chat_id: telegramChatId,
      });
      onSettingsUpdated(updated);
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
      onSettingsUpdated(updated);
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

  return (
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRegenerateSecret}
            className="text-neutral-600 dark:text-neutral-300 font-sans font-semibold hover:underline"
          >
            Regenerate
          </button>
          <button
            onClick={() => onCopy('tg-webhook', telegramWebhookUrl)}
            className="text-teal-700 font-sans font-semibold"
          >
            {copiedId === 'tg-webhook' ? 'Copied' : 'Copy'}
          </button>
        </div>
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
  );
};
