import React, { useState } from 'react';
import { Mail, Rss } from 'lucide-react';
import { api } from '../../services/api';

interface NewsletterSectionProps {
  newsletterWebhookUrl: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerateSecret: () => void;
  onOpenArticlesRss?: () => void;
  onRefreshLibrary?: () => void;
}

export const NewsletterSection: React.FC<NewsletterSectionProps> = ({
  newsletterWebhookUrl,
  copiedId,
  onCopy,
  onRegenerateSecret,
  onOpenArticlesRss,
  onRefreshLibrary,
}) => {
  const [testNewsletterFrom, setTestNewsletterFrom] = useState('Stratechery <ben@stratechery.com>');
  const [testNewsletterSubject, setTestNewsletterSubject] = useState('Sample Newsletter Issue');
  const [testNewsletterBody, setTestNewsletterBody] = useState(
    'Aggregation Theory explains how the internet changed distribution economics from supply-side scarcity to demand-side aggregation.'
  );
  const [newsletterMsg, setNewsletterMsg] = useState<string | null>(null);
  const [isTestingNewsletter, setIsTestingNewsletter] = useState(false);

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

  const handleTestNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingNewsletter(true);
    setNewsletterMsg(null);
    try {
      const src = await api.testNewsletterCapture({
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

  return (
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRegenerateSecret}
            className="text-neutral-600 dark:text-neutral-300 font-sans font-semibold hover:underline"
          >
            Regenerate
          </button>
          <button
            onClick={() => onCopy('nl-url', newsletterWebhookUrl)}
            className="text-teal-700 font-sans font-semibold"
          >
            {copiedId === 'nl-url' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
          <span>Cloudflare Email Routing Worker Snippet</span>
          <button
            onClick={() => onCopy('cf-email', emailRoutingSnippet)}
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
  );
};
