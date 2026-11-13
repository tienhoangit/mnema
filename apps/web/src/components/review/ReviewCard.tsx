import React from 'react';
import { Star, Sparkles } from 'lucide-react';
import { Highlight } from '../../types';

interface ReviewCardProps {
  highlight: Highlight;
  clozeMode: boolean;
  isRevealed: boolean;
  onReveal: () => void;
  onToggleFavorite?: (hl: Highlight) => void;
  showSimilar: boolean;
  similarHighlights: Highlight[];
  isLoadingSimilar: boolean;
  onToggleSimilar: () => void;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({
  highlight,
  clozeMode,
  isRevealed,
  onReveal,
  onToggleFavorite,
  showSimilar,
  similarHighlights,
  isLoadingSimilar,
  onToggleSimilar,
}) => {
  const renderClozeQuote = (text: string) => {
    if (!clozeMode || isRevealed) {
      return <>“{text}”</>;
    }
    const tokens = text.split(/(\s+)/);
    let longWordIdx = 0;
    return (
      <>
        “
        {tokens.map((tok, i) => {
          const clean = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
          if (clean.length >= 6) {
            const shouldMask = longWordIdx % 3 === 1;
            longWordIdx += 1;
            if (shouldMask) {
              const leading = tok.slice(0, tok.indexOf(clean));
              const trailing = tok.slice(tok.indexOf(clean) + clean.length);
              return (
                <React.Fragment key={i}>
                  {leading}
                  <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-teal-100/80 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300 font-sans text-sm font-semibold align-baseline">
                    [...]
                  </span>
                  {trailing}
                </React.Fragment>
              );
            }
          }
          return <React.Fragment key={i}>{tok}</React.Fragment>;
        })}
        ”
      </>
    );
  };

  return (
    <div className="w-full p-8 sm:p-12 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm relative flex flex-col justify-between min-h-[340px]">
      {/* Top Source Meta & Favorite */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-bold text-teal-800 dark:text-teal-400 uppercase tracking-wide">
            {highlight.source_author || 'Unknown Author'}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {highlight.source_name || 'Book or Article'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Favorite button */}
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(highlight)}
              className={`p-2 rounded-xl transition-colors ${
                highlight.favorite
                  ? 'text-amber-500 fill-amber-500 bg-amber-50 dark:bg-amber-950/40'
                  : 'text-neutral-400 hover:text-amber-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title="Favorite (F)"
            >
              <Star className={`w-4 h-4 ${highlight.favorite ? 'fill-amber-500' : ''}`} />
            </button>
          )}

          {/* Semantic connection trigger */}
          <button
            onClick={onToggleSimilar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Show similar</span>
          </button>
        </div>
      </div>

      {/* Quote Body */}
      <div
        onClick={() => {
          if (clozeMode && !isRevealed) onReveal();
        }}
        className={`my-auto ${clozeMode && !isRevealed ? 'cursor-pointer' : ''}`}
      >
        <blockquote className="text-lg sm:text-xl leading-relaxed text-neutral-800 dark:text-neutral-100 font-serif italic">
          {renderClozeQuote(highlight.content)}
        </blockquote>
        {clozeMode && !isRevealed && (
          <p className="mt-3 text-[11px] font-sans font-medium text-teal-700 dark:text-teal-400">
            Active Recall: Tap card or press Space to reveal full highlight
          </p>
        )}
      </div>

      {/* Note if present */}
      {highlight.note && (
        <div className="mt-6 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-900 dark:text-amber-200">
          <span className="font-semibold mr-1">Your Personal Note:</span>
          {highlight.note}
        </div>
      )}

      {showSimilar && (
        <div className="mt-4 p-3.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900/40 text-xs text-teal-900 dark:text-teal-200 space-y-2 animate-in fade-in duration-150">
          <div className="font-semibold">Semantically Related Highlights:</div>
          {isLoadingSimilar ? (
            <p className="text-neutral-500">Searching related ideas...</p>
          ) : similarHighlights.length === 0 ? (
            <p className="text-neutral-500">No closely related highlights found yet.</p>
          ) : (
            <div className="space-y-2">
              {similarHighlights.map((sim) => (
                <div
                  key={sim.id}
                  className="p-2.5 rounded-lg bg-white/80 dark:bg-neutral-900/70 border border-teal-200/40 dark:border-teal-800/40"
                >
                  <p className="font-serif italic text-neutral-800 dark:text-neutral-200">
                    “{sim.content}”
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    — {sim.source_name}
                    {typeof sim.similarity === 'number' ? ` (${sim.similarity}% match)` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
