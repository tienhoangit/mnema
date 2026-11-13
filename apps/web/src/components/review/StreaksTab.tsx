import React from 'react';
import { Flame, Star, CheckCircle2, Calendar } from 'lucide-react';
import { StreakStats } from '../../types';
import { ActivityHeatmap } from './ActivityHeatmap';

interface StreaksTabProps {
  streakStats?: StreakStats;
  activityList: { date: string; count: number }[];
}

export const StreaksTab: React.FC<StreaksTabProps> = ({ streakStats, activityList }) => {
  const renderMonthlyCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const activeDateSet = new Set(activityList.map((a) => a.date));

    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-8 rounded-lg opacity-0" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isReviewed = activeDateSet.has(dateStr);
      const isToday = day === now.getDate();

      cells.push(
        <div
          key={dateStr}
          className={`h-8 sm:h-9 rounded-xl flex items-center justify-center text-xs font-semibold relative transition-all ${
            isReviewed
              ? 'bg-teal-700 text-white shadow-xs'
              : isToday
              ? 'border-2 border-teal-600 text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40'
              : 'bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400'
          }`}
          title={`${dateStr}${isReviewed ? ' - Reviewed' : ''}`}
        >
          <span>{day}</span>
          {isReviewed && (
            <span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-1" />
          )}
        </div>
      );
    }

    return (
      <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-neutral-900 dark:text-white">
            <Calendar className="w-4 h-4 text-teal-700" />
            <span>Monthly Review History ({monthName})</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-700 inline-block" />
              <span>Reviewed day</span>
            </span>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1.5">{cells}</div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto w-full p-6 sm:p-8 space-y-6">
      {/* Streak Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Current Streak</span>
            <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">
            {streakStats?.currentStreak || 0}
            <span className="text-sm font-normal text-neutral-400 ml-1">days</span>
          </p>
          <p className="text-[11px] text-neutral-400">Keep it going tomorrow!</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Longest Streak</span>
            <Star className="w-5 h-5 text-teal-600 fill-teal-600" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">
            {streakStats?.longestStreak || 0}
            <span className="text-sm font-normal text-neutral-400 ml-1">days</span>
          </p>
          <p className="text-[11px] text-neutral-400">Your personal record</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Total Reviews Logged</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">
            {streakStats?.totalReviewsLogged || 0}
          </p>
          <p className="text-[11px] text-neutral-400">Memories consolidated</p>
        </div>
      </div>

      {/* Activity Heatmap Component */}
      <ActivityHeatmap activities={activityList} streakStats={streakStats} />

      {/* Monthly Calendar Grid */}
      {renderMonthlyCalendar()}
    </div>
  );
};
