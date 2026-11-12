import React, { useState } from 'react';
import {
  Trash2,
  RotateCcw,
  BookOpen,
  ArrowLeft,
  Quote,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { TrashData } from '../types';

interface TrashViewProps {
  onBack: () => void;
  onRefreshLibrary: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({ onBack, onRefreshLibrary }) => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'sources' | 'highlights'>('all');

  const { data, isLoading, refetch } = useQuery<TrashData>({
    queryKey: ['trash'],
    queryFn: () => api.getTrash(),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ type, id }: { type: 'source' | 'highlight'; id: string }) =>
      api.restoreTrash(type, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
      onRefreshLibrary();
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (options: { type?: 'source' | 'highlight'; id?: string; all?: boolean }) =>
      api.permanentDeleteTrash(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      onRefreshLibrary();
    },
  });

  const sources = data?.sources || [];
  const highlights = data?.highlights || [];
  const totalCount = (sources.length + highlights.length);

  const handleEmptyTrash = () => {
    if (confirm('Are you sure you want to permanently delete everything in the Trash Bin? This action CANNOT be undone!')) {
      permanentDeleteMutation.mutate({ all: true });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#faf9f5] dark:bg-[#121214] select-none">
      {/* Header */}
      <header className="px-6 py-4 border-b border-neutral-200/70 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              <span>Trash Bin ({totalCount})</span>
            </h2>
          </div>
        </div>

        {totalCount > 0 && (
          <button
            onClick={handleEmptyTrash}
            disabled={permanentDeleteMutation.isPending}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Empty Trash Bin</span>
          </button>
        )}
      </header>

      {/* Filter Tabs */}
      <div className="px-6 pt-4 max-w-4xl mx-auto w-full flex items-center gap-2 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
            filter === 'all'
              ? 'bg-teal-800 text-white'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
          }`}
        >
          All Items ({totalCount})
        </button>
        <button
          onClick={() => setFilter('sources')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
            filter === 'sources'
              ? 'bg-teal-800 text-white'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
          }`}
        >
          Deleted Sources ({sources.length})
        </button>
        <button
          onClick={() => setFilter('highlights')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
            filter === 'highlights'
              ? 'bg-teal-800 text-white'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
          }`}
        >
          Deleted Quotes ({highlights.length})
        </button>
      </div>

      {/* Main List */}
      <main className="p-6 max-w-4xl mx-auto w-full space-y-4">
        {isLoading ? (
          <div className="py-20 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
            <span>Loading trash items...</span>
          </div>
        ) : totalCount === 0 ? (
          <div className="py-24 text-center text-neutral-400 space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/80 stroke-1" />
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Trash Bin is empty
            </p>
            <p className="text-xs text-neutral-400">
              Deleted sources and quotes will be held here safely until you permanently purge them.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Deleted Sources */}
            {(filter === 'all' || filter === 'sources') &&
              sources.map((s) => (
                <div
                  key={`src-${s.id}`}
                  className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-white truncate">
                        {s.name}
                      </p>
                      <span className="text-[11px] text-neutral-400 block truncate">
                        {s.author ? `by ${s.author} · ` : ''}
                        {s.type} · {s.highlight_count || 0} quotes
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => restoreMutation.mutate({ type: 'source', id: s.id })}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 text-xs font-semibold transition-colors"
                      title="Restore source and its quotes"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Permanently delete "${s.name}"?`)) {
                          permanentDeleteMutation.mutate({ type: 'source', id: s.id });
                        }
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

            {/* Deleted Highlights */}
            {(filter === 'all' || filter === 'highlights') &&
              highlights.map((hl) => (
                <div
                  key={`hl-${hl.id}`}
                  className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-2.5"
                >
                  <blockquote className="font-serif italic text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
                    “{hl.content}”
                  </blockquote>
                  <div className="flex items-center justify-between text-xs text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="truncate max-w-sm text-[11px]">
                      From: {hl.source_name || 'Source'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => restoreMutation.mutate({ type: 'highlight', id: hl.id })}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 text-[11px] font-semibold transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Permanently delete this quote?')) {
                            permanentDeleteMutation.mutate({ type: 'highlight', id: hl.id });
                          }
                        }}
                        className="p-1 text-neutral-400 hover:text-red-600 transition-colors"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>
    </div>
  );
};

