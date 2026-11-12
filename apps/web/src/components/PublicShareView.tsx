import React, { useEffect, useState } from 'react';
import { BookOpen, Quote, MessageSquare, ExternalLink, Loader2, Eye, ArrowLeft } from 'lucide-react';
import { PublicSharePayload } from '../types';
import { api } from '../services/api';

interface PublicShareViewProps {
  slug: string;
}

export const PublicShareView: React.FC<PublicShareViewProps> = ({ slug }) => {
  const [data, setData] = useState<PublicSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getPublicShare(slug)
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Share not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="min-h-screen bg-[#faf9f5] dark:bg-[#121214] text-neutral-800 dark:text-neutral-100 font-sans">
      <header className="h-14 border-b border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
        <a href="/" className="flex items-center gap-2 font-bold text-neutral-900 dark:text-white">
          <img src="/logo.png" alt="Mnema" className="w-7 h-7 rounded-lg object-contain" />
          <span>Mnema Shared Notes</span>
        </a>
        {data && (
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>{data.view_count} views</span>
            </span>
            <a
              href="/"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-800 text-white font-semibold hover:bg-teal-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Open App</span>
            </a>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {loading && (
          <div className="py-24 flex flex-col items-center justify-center text-xs text-neutral-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
            <span>Loading shared knowledge...</span>
          </div>
        )}

        {error && (
          <div className="p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center space-y-3">
            <p className="text-base font-bold text-neutral-900 dark:text-white">
              Shared Link Unavailable
            </p>
            <p className="text-xs text-neutral-500">{error}</p>
            <a
              href="/"
              className="inline-block px-4 py-2 rounded-xl bg-teal-800 text-white text-xs font-semibold"
            >
              Go to Mnema
            </a>
          </div>
        )}

        {!loading && !error && data?.target_type === 'highlight' && data.highlight && (
          <article className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 border-l-4 border-l-teal-700 shadow-sm space-y-6">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400">
              <Quote className="w-4 h-4" />
              <span>Shared Highlight</span>
            </div>

            <blockquote className="font-serif italic text-xl sm:text-2xl leading-relaxed text-neutral-900 dark:text-neutral-100">
              “{data.highlight.content}”
            </blockquote>

            {data.highlight.note && (
              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold mr-1">Note:</span>
                  <span>{data.highlight.note}</span>
                </div>
              </div>
            )}

            {data.highlight.tags && data.highlight.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.highlight.tags.map((t) => (
                  <span
                    key={t.id}
                    className="text-xs px-2.5 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                  >
                    #{t.name}
                  </span>
                ))}
              </div>
            )}

            <div className="pt-5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
              <div>
                <p className="font-bold text-neutral-900 dark:text-white text-sm">
                  {data.highlight.source_name}
                </p>
                {data.highlight.source_author && (
                  <p className="text-xs text-neutral-400">by {data.highlight.source_author}</p>
                )}
              </div>
              {data.highlight.source_url && (
                <a
                  href={data.highlight.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                >
                  <span>Original Source</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </article>
        )}

        {!loading && !error && data?.target_type === 'source' && data.source && (
          <div className="space-y-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row gap-6 items-start">
              {data.source.image_url ? (
                <img
                  src={data.source.image_url}
                  alt={data.source.name}
                  className="w-24 h-36 object-cover rounded-xl shadow-md shrink-0"
                />
              ) : (
                <div className="w-24 h-36 rounded-xl bg-teal-900 text-white p-3 flex flex-col justify-between shrink-0">
                  <BookOpen className="w-5 h-5 text-teal-300" />
                  <span className="font-serif font-bold text-xs line-clamp-3">
                    {data.source.name}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                  {data.source.type} · Public Reading Notes
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold font-serif text-neutral-900 dark:text-white">
                  {data.source.name}
                </h1>
                {data.source.author && (
                  <p className="text-sm text-neutral-500">By {data.source.author}</p>
                )}
                <p className="text-xs text-neutral-400">
                  {(data.highlights || []).length} highlights shared
                </p>
                {data.source.url && (
                  <a
                    href={data.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-teal-700 dark:text-teal-400 hover:underline font-medium pt-1"
                  >
                    <span>Visit Original Link</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {data.source.source_notes && (
              <div className="p-6 rounded-3xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900/40 space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-teal-900 dark:text-teal-300">
                  Synthesis & Source Notes
                </h2>
                <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed">
                  {data.source.source_notes}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {(data.highlights || []).map((hl) => (
                <article
                  key={hl.id}
                  className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 border-l-4 border-l-teal-600 shadow-2xs space-y-3"
                >
                  <blockquote className="font-serif italic text-base leading-relaxed text-neutral-800 dark:text-neutral-100">
                    “{hl.content}”
                  </blockquote>
                  {hl.note && (
                    <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-900 dark:text-amber-200">
                      <span className="font-bold mr-1">Note:</span>
                      <span>{hl.note}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <div className="flex flex-wrap gap-1.5">
                      {hl.tags?.map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                        >
                          #{t.name}
                        </span>
                      ))}
                    </div>
                    {hl.location && <span className="font-mono">Loc {hl.location}</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
