import React from 'react';
import { Home, BookOpen, Repeat, Search, Menu } from 'lucide-react';

export type TabType =
  | 'home'
  | 'articles'
  | 'review'
  | 'search'
  | 'sources'
  | 'notes'
  | 'tags'
  | 'stats'
  | 'explore'
  | 'trash'
  | 'integrations'
  | 'settings'
  | string;

export interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenDrawer: () => void;
  reviewCount?: number;
}

interface NavItemConfig {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isDrawerTrigger?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'articles', label: 'Articles', icon: BookOpen },
  { id: 'review', label: 'Review', icon: Repeat },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'more', label: 'More', icon: Menu, isDrawerTrigger: true },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenDrawer,
  reviewCount = 0,
}) => {
  const isSecondaryTab = ![
    'home',
    'articles',
    'review',
    'search',
  ].includes(currentTab);

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-t border-neutral-200/80 dark:border-neutral-800 pb-[env(safe-area-inset-bottom)] shadow-lg select-none"
    >
      <div className="h-14 grid grid-cols-5 items-stretch px-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.isDrawerTrigger
            ? isSecondaryTab
            : currentTab === item.id;

          const handleClick = () => {
            if (item.isDrawerTrigger) {
              onOpenDrawer();
            } else {
              onSelectTab(item.id);
            }
          };

          return (
            <button
              key={item.id}
              onClick={handleClick}
              type="button"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-colors duration-150 active:scale-95 touch-manipulation focus:outline-hidden ${
                isActive
                  ? 'text-teal-700 dark:text-teal-400 font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {/* Active Tab Top Indicator Bar */}
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 bg-teal-600 dark:bg-teal-400 rounded-full" />
              )}

              {/* Icon Container with Badge */}
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'scale-110' : ''
                  }`}
                />
                {item.id === 'review' && reviewCount > 0 && (
                  <span
                    aria-label={`${reviewCount} reviews pending`}
                    className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1 bg-teal-600 dark:bg-teal-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none shadow-xs border border-white dark:border-neutral-900"
                  >
                    {reviewCount > 99 ? '99+' : reviewCount}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className="text-[11px] leading-tight mt-1 tracking-tight truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
