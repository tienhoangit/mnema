import React, { useState } from 'react';
import {
  BookOpen,
  Youtube,
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  BookMarked,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Source, SourceType, ReadingStatus } from '../types';
import { SourceTypeBadge, ReadingStatusBadge } from './shared/SourceBadges';

interface SourcesViewProps {
  sources: Source[];
  onSelectSource: (id: string) => void;
  onUpdateStatus: (id: string, status: ReadingStatus) => void;
  onDeleteSource: (id: string, name: string) => void;
}

export const SourcesView: React.FC<SourcesViewProps> = ({
  sources,
  onSelectSource,
  onUpdateStatus,
  onDeleteSource,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = sources.filter((s) => {
    if (filterType !== 'all' && s.type !== filterType) return false;
    if (filterStatus !== 'all' && s.reading_status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = s.name.toLowerCase().includes(q);
      const matchAuthor = s.author?.toLowerCase().includes(q);
      if (!matchName && !matchAuthor) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-neutral-200/70 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-4 shrink-0 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xs">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Sources & Library ({sources.length})
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manage your books, articles, podcasts, and personal notes.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Filter sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800 border-0 text-neutral-900 dark:text-white focus:outline-hidden"
            />
          </div>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
          >
            <option value="all">All Types</option>
            <option value="book">Books</option>
            <option value="article">Articles</option>
            <option value="pdf">PDFs</option>
            <option value="youtube">YouTube</option>
            <option value="custom">Personal</option>
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="reading">Reading</option>
            <option value="want_to_read">Want to Read</option>
            <option value="read">Finished</option>
            <option value="inbox">Inbox</option>
            <option value="later">Later</option>
            <option value="archive">Archive</option>
          </select>
        </div>
      </header>

      {/* Sources Table */}
      <main className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-neutral-400 space-y-2">
            <BookMarked className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-700" />
            <p className="text-xs">No matching sources found</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200/60 dark:border-neutral-800 text-neutral-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Title & Source</th>
                  <th className="py-3 px-4">Author</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Reading Status</th>
                  <th className="py-3 px-4 text-center">Highlights</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onSelectSource(s.id)}
                    className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {s.image_url ? (
                          <img
                            src={s.image_url}
                            alt=""
                            className="w-8 h-10 object-cover rounded shadow-2xs shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-10 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                            <SourceTypeBadge type={s.type} showIconOnly={true} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-neutral-900 dark:text-white truncate">
                            {s.name}
                          </p>
                          {s.url && (
                            <span className="text-[10px] text-neutral-400 truncate block">
                              {new URL(s.url).hostname.replace('www.', '')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                      {s.author || '—'}
                    </td>

                    <td className="py-3 px-4">
                      <SourceTypeBadge type={s.type} />
                    </td>

                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={s.reading_status}
                        onChange={(e) => onUpdateStatus(s.id, e.target.value as ReadingStatus)}
                        className="text-[11px] px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 focus:outline-hidden"
                      >
                        <option value="want_to_read">Want to Read</option>
                        <option value="reading">Reading</option>
                        <option value="read">Finished</option>
                        <option value="inbox">Inbox</option>
                        <option value="later">Later</option>
                        <option value="archive">Archive</option>
                      </select>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 text-[11px]">
                        {s.highlight_count || 0}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDeleteSource(s.id, s.name)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 transition-colors"
                        title="Delete Source"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

