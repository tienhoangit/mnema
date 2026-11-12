import React from 'react';
import {
  BarChart3,
  Flame,
  BookOpen,
  Highlighter,
  CheckCircle,
  TrendingUp,
  PieChart,
  Calendar,
} from 'lucide-react';
import { FullStats } from '../types';

interface StatsViewProps {
  stats: FullStats | null;
}

export const StatsView: React.FC<StatsViewProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-neutral-400">
        Loading analytics...
      </div>
    );
  }

  const hlDelta = stats.highlightsThisMonth - stats.highlightsLastMonth;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="px-6 py-4 border-b border-neutral-200/70 dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xs">
        <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Stats & Reading Analytics
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Track your reading momentum, habit consistency, and library growth.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: This Month Highlights */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>This Month</span>
              <Highlighter className="w-4 h-4 text-teal-700" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                {stats.highlightsThisMonth}
              </span>
              <span
                className={`text-xs font-semibold ${
                  hlDelta >= 0 ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {hlDelta >= 0 ? `+${hlDelta}` : hlDelta} vs last month
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">Highlights added this month</p>
          </div>

          {/* Card 2: Streak */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Daily Streak</span>
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                {stats.currentStreak} days
              </span>
              <span className="text-xs text-neutral-400 font-medium">
                (Record: {stats.longestStreak}d)
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">Consecutive days active</p>
          </div>

          {/* Card 3: Consistency */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Consistency (30d)</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                {stats.consistencyPct}%
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">Active days out of past 30 days</p>
          </div>

          {/* Card 4: Total Reviews Done */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Total Reviews</span>
              <CheckCircle className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                {stats.totalReviews}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">All-time cards reviewed</p>
          </div>
        </div>

        {/* Section 2: Library Composition & Top Sources */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Source Breakdown */}
          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
              <PieChart className="w-4 h-4 text-teal-700" />
              <span>Library Composition ({stats.totalSources} sources)</span>
            </div>

            <div className="space-y-3">
              {stats.typeBreakdown.map((item) => {
                const pct =
                  stats.totalSources > 0
                    ? Math.round((item.count / stats.totalSources) * 100)
                    : 0;
                return (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      <span className="capitalize">{item.type}</span>
                      <span>
                        {item.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-teal-700 rounded-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Sources */}
          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
              <BookOpen className="w-4 h-4 text-teal-700" />
              <span>Top Highlighted Sources</span>
            </div>

            <div className="space-y-2">
              {stats.topSources.map((s, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-neutral-900 dark:text-white truncate">
                      {s.name}
                    </p>
                    {s.author && <p className="text-[11px] text-neutral-400 truncate">{s.author}</p>}
                  </div>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 shrink-0">
                    {s.hl_count} quotes
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

