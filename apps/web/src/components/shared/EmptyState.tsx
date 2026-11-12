import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`text-center py-16 px-4 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-2xl bg-white/40 dark:bg-neutral-900/40 select-none ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">{title}</h3>
      <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 bg-teal-800 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

