import React from 'react';
import { Flame, CheckCircle, Calendar } from 'lucide-react';
import { StreakStats } from '../types';

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
    const dateStr = d.toISOString().split('T')[0];
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

        {streakStats && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
              <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              {streakStats.currentStreak} day streak
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">|</span>
            <span className="text-neutral-500 text-[11px]">
              {streakStats.totalReviewsLogged} reviews logged
            </span>
          </div>
        )}
      </div>

      {/* Grid of days (10 cols x 6 rows) */}
      <div className="flex flex-wrap gap-1.5">
        {days.map((day) => (
          <div
            key={day.dateStr}
            className={`w-3.5 h-3.5 rounded-xs ${getColor(day.count)} transition-transform hover:scale-125`}
            title={`${day.dateStr}: ${day.count} activities`}
          />
        ))}
      </div>
    </div>
  );
};

