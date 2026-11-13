import React from 'react';
import { Flame, CheckCircle, Calendar } from 'lucide-react';
import { StreakStats } from '../../types';

interface ActivityItem {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  activities: ActivityItem[];
  streakStats?: StreakStats;
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  activities = [],
  streakStats,
}) => {
  // Generate past 60 days
  const days: { dateStr: string; count: number }[] = [];
  const map = new Map(activities.map((a) => [a.date, a.count]));

  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    days.push({
      dateStr,
      count: map.get(dateStr) || 0,
    });
  }

  const getColor = (count: number) => {
    if (count === 0) return 'bg-neutral-100 dark:bg-neutral-800';
    if (count === 1) return 'bg-teal-200 dark:bg-teal-900/60';
    if (count <= 3) return 'bg-teal-400 dark:bg-teal-700';
    return 'bg-teal-700 dark:bg-teal-500';
  };

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 shadow-xs space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800 dark:text-neutral-200">
          <Calendar className="w-4 h-4 text-teal-700" />
          <span>Reading & Review Activity</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-400">
          {streakStats?.currentStreak ? (
            <span className="flex items-center gap-1 font-semibold text-amber-500">
              <Flame className="w-3.5 h-3.5 fill-amber-500" />
              {streakStats.currentStreak} day streak
            </span>
          ) : null}
          {streakStats?.totalReviewsLogged ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle className="w-3 h-3" />
              {streakStats.totalReviewsLogged} reviewed
            </span>
          ) : null}
        </div>
      </div>

      {/* 60-day visual block grid */}
      <div className="grid grid-flow-col grid-rows-5 gap-1.5 overflow-x-auto py-1">
        {days.map((d) => (
          <div
            key={d.dateStr}
            className={`w-3.5 h-3.5 rounded-xs ${getColor(d.count)} transition-all hover:scale-125`}
            title={`${d.dateStr}: ${d.count} actions`}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[10px] text-neutral-400">
        <span>Less</span>
        <div className="w-2.5 h-2.5 rounded-xs bg-neutral-100 dark:bg-neutral-800" />
        <div className="w-2.5 h-2.5 rounded-xs bg-teal-200 dark:bg-teal-900/60" />
        <div className="w-2.5 h-2.5 rounded-xs bg-teal-400 dark:bg-teal-700" />
        <div className="w-2.5 h-2.5 rounded-xs bg-teal-700 dark:bg-teal-500" />
        <span>More</span>
      </div>
    </div>
  );
};
