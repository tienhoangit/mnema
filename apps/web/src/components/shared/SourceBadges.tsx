import React from 'react';
import {
  BookOpen,
  FileText,
  Youtube,
  Radio,
  FileCode,
  CheckCircle2,
  Clock,
  Archive,
  Inbox,
  BookMarked,
} from 'lucide-react';
import { ReadingStatus, SourceType } from '../../types';

export const READING_STATUS_CONFIG: Record<
  ReadingStatus,
  { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  inbox: {
    label: 'Inbox',
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-800 dark:text-teal-300',
    icon: Inbox,
  },
  later: {
    label: 'Read Later',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    icon: Clock,
  },
  archive: {
    label: 'Archived',
    bg: 'bg-neutral-100 dark:bg-neutral-800',
    text: 'text-neutral-600 dark:text-neutral-400',
    icon: Archive,
  },
  want_to_read: {
    label: 'Want to Read',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-300',
    icon: BookMarked,
  },
  reading: {
    label: 'Reading',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: BookOpen,
  },
  read: {
    label: 'Read',
    bg: 'bg-neutral-100 dark:bg-neutral-800',
    text: 'text-neutral-700 dark:text-neutral-300',
    icon: CheckCircle2,
  },
};

export const SOURCE_TYPE_CONFIG: Record<
  SourceType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  book: { label: 'Book', icon: BookOpen, color: 'text-amber-600' },
  article: { label: 'Article', icon: FileText, color: 'text-teal-700' },
  youtube: { label: 'YouTube', icon: Youtube, color: 'text-red-500' },
  podcast: { label: 'Podcast', icon: Radio, color: 'text-purple-600' },
  pdf: { label: 'PDF', icon: FileCode, color: 'text-rose-600' },
  epub: { label: 'EPUB', icon: BookOpen, color: 'text-indigo-600' },
  tweet: { label: 'Post', icon: FileText, color: 'text-blue-500' },
  custom: { label: 'Custom', icon: FileText, color: 'text-neutral-500' },
};

interface ReadingStatusBadgeProps {
  status: ReadingStatus;
  size?: 'sm' | 'md';
}

export const ReadingStatusBadge: React.FC<ReadingStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => {
  const conf = READING_STATUS_CONFIG[status] || READING_STATUS_CONFIG.inbox;
  const Icon = conf.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${conf.bg} ${conf.text}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{conf.label}</span>
    </span>
  );
};

interface SourceTypeBadgeProps {
  type: SourceType;
  showIconOnly?: boolean;
}

export const SourceTypeBadge: React.FC<SourceTypeBadgeProps> = ({
  type,
  showIconOnly = false,
}) => {
  const conf = SOURCE_TYPE_CONFIG[type] || SOURCE_TYPE_CONFIG.article;
  const Icon = conf.icon;

  if (showIconOnly) {
    return <Icon className={`w-4 h-4 ${conf.color} shrink-0`} />;
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
      <Icon className={`w-3.5 h-3.5 ${conf.color} shrink-0`} />
      <span>{conf.label}</span>
    </span>
  );
};

