import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Source, Highlight } from '../types';

interface UseLibraryDataProps {
  currentTab: string;
  searchQuery: string;
  selectedSourceId: string | null;
}

export function useLibraryData({ currentTab, searchQuery, selectedSourceId }: UseLibraryDataProps) {
  const queryClient = useQueryClient();

  // Queries
  const { data: sources = [], isLoading: isLoadingSources } = useQuery({
    queryKey: ['sources', searchQuery],
    queryFn: () =>
      api.getSources({
        status: 'all',
        q: searchQuery || undefined,
      }),
  });

  const { data: highlights = [], isLoading: isLoadingHighlights } = useQuery({
    queryKey: ['highlights', searchQuery],
    queryFn: () => api.getHighlights({ q: searchQuery || undefined }),
    enabled: currentTab === 'highlights',
  });

  const { data: allHighlights = [] } = useQuery({
    queryKey: ['all-highlights'],
    queryFn: () => api.getHighlights(),
  });

  const { data: reviewQueue = [], refetch: refetchReviews } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => api.getReviewQueue(15),
  });

  const { data: streakStats, refetch: refetchStreak } = useQuery({
    queryKey: ['streak'],
    queryFn: () => api.getStreak(),
  });

  const { data: fullStats = null, refetch: refetchFullStats } = useQuery({
    queryKey: ['full-stats'],
    queryFn: () => api.getFullStats(),
    enabled: currentTab === 'stats',
  });

  const { data: activityData = [] } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      const res = await fetch('/api/stats/activity');
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data as { date: string; count: number }[]) || [];
    },
  });

  const { data: activeSource } = useQuery({
    queryKey: ['source', selectedSourceId],
    queryFn: () => api.getSource(selectedSourceId!),
    enabled: Boolean(selectedSourceId),
  });

  const { data: tags = [], refetch: refetchTags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  });

  // Mutations
  const createSourceMutation = useMutation({
    mutationFn: api.createSource,
    onSuccess: (newSource) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
      return newSource;
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Source> }) =>
      api.updateSource(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['source', selectedSourceId] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: api.deleteSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
    },
  });

  const createHighlightMutation = useMutation({
    mutationFn: api.createHighlight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source', selectedSourceId] });
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
    },
  });

  const updateHighlightMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Highlight> }) =>
      api.updateHighlight(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
      queryClient.invalidateQueries({ queryKey: ['source', selectedSourceId] });
    },
  });

  const deleteHighlightMutation = useMutation({
    mutationFn: api.deleteHighlight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
      queryClient.invalidateQueries({ queryKey: ['source', selectedSourceId] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
    },
  });

  const reviewActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'remember' | 'forget' | 'discard' }) =>
      api.submitReviewAction(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
    },
  });

  const undoReviewMutation = useMutation({
    mutationFn: api.undoReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['full-stats'] });
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['sources'] });
    queryClient.invalidateQueries({ queryKey: ['source'] });
    queryClient.invalidateQueries({ queryKey: ['highlights'] });
    queryClient.invalidateQueries({ queryKey: ['all-highlights'] });
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['streak'] });
    queryClient.invalidateQueries({ queryKey: ['activity'] });
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['full-stats'] });
  };

  return {
    sources,
    isLoadingSources,
    highlights,
    isLoadingHighlights,
    allHighlights,
    tags,
    reviewQueue,
    streakStats,
    fullStats,
    activityData,
    activeSource,
    refetchReviews,
    refetchStreak,
    refetchTags,
    refetchFullStats,
    invalidateAll,
    createSource: createSourceMutation.mutateAsync,
    updateSource: updateSourceMutation.mutate,
    deleteSource: deleteSourceMutation.mutateAsync,
    createHighlight: createHighlightMutation.mutateAsync,
    updateHighlight: updateHighlightMutation.mutate,
    deleteHighlight: deleteHighlightMutation.mutate,
    submitReviewAction: reviewActionMutation.mutateAsync,
    undoReviewAction: undoReviewMutation.mutateAsync,
  };
}
