import React, { useState } from 'react';
import { Compass, Sparkles, BookOpen, ExternalLink, BookmarkPlus, Check, Twitter } from 'lucide-react';
import { ReadingStatus } from '../types';

interface ExploreViewProps {
  onSaveSource: (data: {
    name: string;
    author: string;
    type: 'article' | 'book';
    content_html?: string;
    reading_status: ReadingStatus;
  }) => Promise<void>;
  onAddHighlight: (data: {
    content: string;
    author: string;
    sourceName: string;
  }) => Promise<void>;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ onSaveSource, onAddHighlight }) => {
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});

  const classics = [
    {
      id: 'pg-makers-schedule',
      title: "Maker's Schedule, Manager's Schedule",
      author: 'Paul Graham',
      readTime: '8 min',
      excerpt:
        'One reason programmers dislike meetings so much is that they’re on a different type of schedule than other people.',
      url: 'https://paulgraham.com/makersschedule.html',
    },
    {
      id: 'kk-1000-true-fans',
      title: '1,000 True Fans',
      author: 'Kevin Kelly',
      readTime: '12 min',
      excerpt:
        'To be a successful creator you don’t need millions. You only need a thousand true fans.',
      url: 'https://kk.org/thetechnium/1000-true-fans/',
    },
    {
      id: 'naval-how-to-get-rich',
      title: 'How to Get Rich (without getting lucky)',
      author: 'Naval Ravikant',
      readTime: '15 min',
      excerpt:
        'Seek wealth, not money or status. Wealth is having assets that earn while you sleep.',
      url: 'https://nav.al/rich',
    },
  ];

  const xPosts = [
    {
      id: 'x-naval-1',
      author: 'Naval Ravikant',
      handle: '@naval',
      text: 'A fit body, a calm mind, a house full of love. These things cannot be bought — they must be earned.',
    },
    {
      id: 'x-james-1',
      author: 'James Clear',
      handle: '@JamesClear',
      text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    },
    {
      id: 'x-munger-1',
      author: 'Charlie Munger',
      handle: '@charlie_wisdom',
      text: 'Spend each day trying to be a little wiser than you were when you woke up.',
    },
  ];

  const handleSaveClassic = async (item: (typeof classics)[0]) => {
    setSavedPosts((prev) => ({ ...prev, [item.id]: true }));
    await onSaveSource({
      name: item.title,
      author: item.author,
      type: 'article',
      content_html: `<p>${item.excerpt}</p>`,
      reading_status: 'later',
    });
  };

  const handleSaveXPost = async (post: (typeof xPosts)[0]) => {
    setSavedPosts((prev) => ({ ...prev, [post.id]: true }));
    await onAddHighlight({
      content: post.text,
      author: post.author,
      sourceName: `Post by ${post.author}`,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-6 max-w-5xl mx-auto space-y-8 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-bold text-xs uppercase tracking-wider mb-1">
          <Compass className="w-4 h-4" />
          <span>Curated Discovery</span>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Explore Ideas & Classics
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Hand-picked timeless essays and mental models to inspire your second brain.
        </p>
      </div>

      {/* Section 1: Start with a Classic */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
          Start with a Classic
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classics.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <p className="text-[11px] font-bold text-teal-800 dark:text-teal-400 uppercase tracking-wide">
                  {item.author} • {item.readTime}
                </p>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white mt-1">
                  {item.title}
                </h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-2 line-clamp-3 italic">
                  "{item.excerpt}"
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-neutral-400 hover:text-teal-700 flex items-center gap-1"
                >
                  <span>Read original</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  onClick={() => handleSaveClassic(item)}
                  disabled={savedPosts[item.id]}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {savedPosts[item.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Lately on X / Thought Leaders */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
          Lately on X (Curated Quotes)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {xPosts.map((post) => (
            <div
              key={post.id}
              className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-xs text-neutral-900 dark:text-white">
                    {post.author}
                  </span>
                  <span className="text-[11px] text-neutral-400">{post.handle}</span>
                </div>
                <p className="text-xs text-neutral-700 dark:text-neutral-200 leading-relaxed font-serif italic">
                  "{post.text}"
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button
                  onClick={() => handleSaveXPost(post)}
                  disabled={savedPosts[post.id]}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-50"
                >
                  {savedPosts[post.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>In Library</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save Quote</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

