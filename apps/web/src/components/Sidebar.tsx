import React from 'react';
import {
  Home,
  Repeat,
  BookOpen,
  Search,
  FolderClosed,
  Tag,
  BarChart2,
  Compass,
  Plug,
  Settings,
  Sun,
  Moon,
  Flame,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { ReaderSettings, StreakStats } from '../types';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  reviewCount: number;
  streakStats?: StreakStats;
  settings: ReaderSettings;
  onUpdateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  reviewCount,
  streakStats,
  settings,
  onUpdateSetting,
}) => {
  const mainNav = [
    { id: 'home', label: 'Home', icon: Home },
    {
      id: 'review',
      label: 'Review',
      icon: Repeat,
      badge: reviewCount > 0 ? `${reviewCount}` : undefined,
    },
    { id: 'articles', label: 'Articles', icon: BookOpen },
    { id: 'search', label: 'Search', icon: Search },
  ];

  const libraryNav = [
    { id: 'sources', label: 'Sources', icon: FolderClosed },
    { id: 'notes', label: 'Notes', icon: MessageSquare },
    { id: 'tags', label: 'Tags', icon: Tag },
    { id: 'stats', label: 'Stats', icon: BarChart2 },
  ];

  const discoverNav = [
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'trash', label: 'Trash', icon: Trash2 },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="hidden md:flex w-56 sm:w-60 border-r border-neutral-200/80 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md flex-col h-[calc(100vh-3.5rem)] shrink-0 select-none">
      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {/* Main Section */}
        <div className="space-y-1">
          {mainNav.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                  active
                    ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${active ? 'text-teal-800 dark:text-teal-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      active
                        ? 'bg-teal-800 text-white dark:bg-teal-400 dark:text-teal-950'
                        : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Library Section */}
        <div>
          <h2 className="px-3 text-[11px] font-semibold text-neutral-400 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
            Library
          </h2>
          <div className="space-y-1">
            {libraryNav.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                    active
                      ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${active ? 'text-teal-800 dark:text-teal-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                    />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Discover Section */}
        <div>
          <h2 className="px-3 text-[11px] font-semibold text-neutral-400 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
            Discover
          </h2>
          <div className="space-y-1">
            {discoverNav.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                    active
                      ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${active ? 'text-teal-800 dark:text-teal-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                    />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Footer Profile & Plan Card */}
      <div className="p-3 border-t border-neutral-200/60 dark:border-neutral-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Cloudflare Free Tier</span>
        </div>

        <button
          onClick={() => onUpdateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Toggle Light / Dark mode"
        >
          {settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
