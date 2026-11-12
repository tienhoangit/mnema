import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Send,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Highlight, Source, EmailPreview } from '../types';
import { api } from '../services/api';

export type EmailTarget =
  | { type: 'highlight'; highlight: Highlight }
  | { type: 'source'; source: Source };

interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: EmailTarget | null;
}

export const SendEmailModal: React.FC<SendEmailModalProps> = ({
  isOpen,
  onClose,
  target,
}) => {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !target) return;
    setSentMessage(null);
    setError(null);
    setPreview(null);
    setShowPreview(false);

    if (target.type === 'highlight') {
      const srcName = target.highlight.source_name || 'Mnema Library';
      setSubject(`Highlight from "${srcName}"`);
    } else {
      setSubject(
        `Reading Notes: ${target.source.name}${target.source.author ? ` — ${target.source.author}` : ''}`
      );
    }

    api
      .getSettings()
      .then((s) => {
        if (s.digest_email) setRecipient(s.digest_email);
      })
      .catch(() => {});
  }, [isOpen, target]);

  if (!isOpen || !target) return null;

  const handleLoadPreview = async () => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      const res =
        target.type === 'highlight'
          ? await api.sendHighlightEmail({
              highlight_id: target.highlight.id,
              include_note: includeNotes,
              subject,
              preview_only: true,
            })
          : await api.sendSourceEmail({
              source_id: target.source.id,
              include_notes: includeNotes,
              subject,
              preview_only: true,
            });
      if (res.preview) {
        setPreview(res.preview);
        setShowPreview(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim()) return;
    setIsSending(true);
    setError(null);
    setSentMessage(null);

    try {
      if (target.type === 'highlight') {
        await api.sendHighlightEmail({
          highlight_id: target.highlight.id,
          to: recipient.trim(),
          include_note: includeNotes,
          subject: subject.trim() || undefined,
        });
      } else {
        await api.sendSourceEmail({
          source_id: target.source.id,
          to: recipient.trim(),
          include_notes: includeNotes,
          subject: subject.trim() || undefined,
        });
      }
      setSentMessage(`Email sent to ${recipient.trim()}!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send email';
      setError(msg);
      // Load preview automatically if Resend key isn't configured yet
      if (!preview) {
        handleLoadPreview().catch(() => {});
      }
    } finally {
      setIsSending(false);
    }
  };

  const buildMailtoHref = () => {
    const bodyText =
      target.type === 'highlight'
        ? `"${target.highlight.content}"\n\n${
            includeNotes && target.highlight.note ? `Note: ${target.highlight.note}\n\n` : ''
          }— ${target.highlight.source_name || 'Mnema Library'}`
        : preview?.text ||
          `${target.source.name}\n\n${
            includeNotes && target.source.source_notes ? `${target.source.source_notes}\n\n` : ''
          }${(target.source.highlights || []).map((h, i) => `${i + 1}. "${h.content}"`).join('\n\n')}`;

    return `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(bodyText.slice(0, 1800))}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900 dark:text-white">
            <Mail className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>
              {target.type === 'highlight'
                ? 'Send Highlight & Note via Email'
                : 'Send Book / Article Summary via Email'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
              Recipient Email *
            </label>
            <input
              type="email"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-700/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-700/40"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="rounded border-neutral-300 text-teal-700 focus:ring-teal-700"
            />
            <span>
              {target.type === 'highlight'
                ? 'Include my personal note'
                : 'Include source notes & personal margin notes'}
            </span>
          </label>

          {showPreview && preview && (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-2xl overflow-hidden">
              <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 flex items-center justify-between">
                <span>Email HTML Preview</span>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  Hide
                </button>
              </div>
              <iframe
                title="Email Preview"
                srcDoc={preview.html}
                className="w-full h-64 bg-white border-0"
                sandbox=""
              />
            </div>
          )}

          {sentMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{sentMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{error}</p>
                <p className="text-[11px] text-neutral-500">
                  Tip: Configure a free Resend API key in Settings → Daily Digest, or click "Open Mail App" below.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadPreview}
                disabled={isLoadingPreview}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {isLoadingPreview ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                <span>Preview</span>
              </button>

              <a
                href={buildMailtoHref()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Mail App</span>
              </a>
            </div>

            <button
              type="submit"
              disabled={isSending || !recipient.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
