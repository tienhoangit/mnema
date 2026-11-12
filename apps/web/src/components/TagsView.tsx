import React, { useState } from 'react';
import { Tag as TagIcon, Plus, Search, Trash2, Check, Tag } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Highlight, Tag as TagType } from '../types';
import { api } from '../services/api';

interface TagsViewProps {
  highlights: Highlight[];
  onSelectTag?: (tag: string) => void;
}

const PRESET_COLORS = [
  '#0d9488', // Teal
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ef4444', // Red
];

export const TagsView: React.FC<TagsViewProps> = ({ highlights, onSelectTag }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  // Fetch tags from D1 database
  const { data: dbTags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  });

  // Mutations
  const createTagMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) => api.createTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setNewTagName('');
      setIsCreating(false);
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
    },
  });

  // Combine and merge with any highlight tags
  const tagsMap = new Map<string, TagType>();
  dbTags.forEach((t) => {
    tagsMap.set(t.name.toLowerCase(), t);
  });

  // Count highlight occurrences
  highlights.forEach((hl) => {
    hl.tags?.forEach((t) => {
      const lower = t.name.toLowerCase();
      const existing = tagsMap.get(lower);
      if (existing) {
        existing.count = Math.max(existing.count || 0, 1);
      } else {
        tagsMap.set(lower, {
          id: t.id || lower,
          name: t.name,
          color: t.color || '#0d9488',
          count: 1,
        });
      }
    });
  });

  const allTags = Array.from(tagsMap.values())
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagName.trim().toLowerCase();
    if (!clean) return;
    createTagMutation.mutate({ name: clean, color: newTagColor });
  };

  const handleDeleteTag = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete tag "#${name}"? It will be removed from all highlights.`)) {
      deleteTagMutation.mutate(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-6 max-w-5xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-bold text-xs uppercase tracking-wider mb-1">
            <TagIcon className="w-4 h-4" />
            <span>Taxonomy</span>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Tags & Collections ({allTags.length})
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Permanent topics and taxonomy persisted in your cloud database.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Tag</span>
        </button>
      </div>

      {/* Inline Create Tag Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateTag}
          className="p-4 rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 space-y-3 animate-in fade-in duration-150"
        >
          <h4 className="text-xs font-bold text-teal-900 dark:text-teal-200 uppercase tracking-wide">
            Create Permanent Tag
          </h4>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name (e.g. mental-models, habit)..."
              required
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 text-xs border border-neutral-300 dark:border-neutral-700 focus:outline-hidden focus:border-teal-700 text-neutral-900 dark:text-white"
            />
            {/* Color swatches */}
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  className="w-5 h-5 rounded-full border border-black/10 transition-transform hover:scale-110 flex items-center justify-center"
                  style={{ backgroundColor: c }}
                >
                  {newTagColor === c && <Check className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={createTagMutation.isPending}
              className="px-4 py-1.5 rounded-xl bg-teal-800 text-white text-xs font-semibold shadow-xs hover:bg-teal-700"
            >
              {createTagMutation.isPending ? 'Saving...' : 'Save Tag'}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search Input */}
      <div className="max-w-md relative">
        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter tags..."
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-800 focus:border-teal-700 focus:outline-hidden"
        />
      </div>

      {/* Tags Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {allTags.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-neutral-400">
            {isLoading ? 'Loading tags...' : 'No tags found. Create a tag to start organizing your highlights!'}
          </div>
        ) : (
          allTags.map((tag) => (
            <div
              key={tag.id || tag.name}
              onClick={() => onSelectTag?.(tag.name)}
              className="p-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-teal-700/60 shadow-2xs cursor-pointer transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color || '#0d9488' }}
                />
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                  #{tag.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                  {tag.count || 0}
                </span>
                <button
                  onClick={(e) => handleDeleteTag(tag.id, tag.name, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-red-600 transition-opacity"
                  title="Delete tag"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
