import React, { useState } from 'react';
import { X, Wrench, GitMerge, Trash2, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { api } from '../services/api';

interface LibraryToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LibraryToolsModal: React.FC<LibraryToolsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRun = async (tool: 'merge-duplicates' | 'remove-empty' | 'trash-tiny', label: string) => {
    setRunningTool(tool);
    setResultMsg(null);

    try {
      const res = await api.runLibraryTool(tool);
      if (tool === 'merge-duplicates') {
        setResultMsg(`Merged ${res.mergedSources} duplicate sources successfully!`);
      } else if (tool === 'remove-empty') {
        setResultMsg(`Removed ${res.removedCount} empty sources!`);
      } else {
        setResultMsg(`Trashed ${res.trashedCount} tiny highlights!`);
      }
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Tool failed');
    } finally {
      setRunningTool(null);
    }
  };

  const tools = [
    {
      id: 'merge-duplicates' as const,
      title: 'Merge Duplicate Sources',
      desc: 'Finds books or articles with identical titles, moves all highlights to the primary record, and cleans duplicates.',
      icon: GitMerge,
    },
    {
      id: 'remove-empty' as const,
      title: 'Remove Empty Sources',
      desc: 'Scans your library for books that contain 0 highlights and cleans them up to keep your library tidy.',
      icon: Trash2,
    },
    {
      id: 'trash-tiny' as const,
      title: 'Trash Tiny Highlights',
      desc: 'Finds highlights shorter than 15 characters (usually accidental mouse clicks or typos) and moves them to trash.',
      icon: Sparkles,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-neutral-800 dark:text-white">
            <Wrench className="w-4 h-4 text-teal-700" />
            <span>Library Clean-up Tools</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tools List */}
        <div className="p-5 space-y-3">
          {resultMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resultMsg}</span>
            </div>
          )}

          {tools.map((t) => {
            const Icon = t.icon;
            const isBusy = runningTool === t.id;

            return (
              <div
                key={t.id}
                className="p-3.5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-neutral-900 dark:text-white">
                      {t.title}
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                      {t.desc}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleRun(t.id, t.title)}
                  disabled={Boolean(runningTool)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 text-xs font-semibold text-neutral-700 dark:text-neutral-200 shrink-0 transition-colors shadow-2xs"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Run'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

