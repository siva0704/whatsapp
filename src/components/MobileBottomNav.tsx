import {
  BriefcaseBusiness,
  CircleDashed,
  MessageSquareText,
  Phone,
  Settings,
  Terminal,
} from 'lucide-react';
import type { EmulatorVariant } from '../../shared/types';
import type { SidebarTab } from './LeftRail';

interface MobileBottomNavProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  variant: EmulatorVariant;
  unreadTotal: number;
}

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  variant,
  unreadTotal,
}: MobileBottomNavProps) {
  const items: Array<{
    id: SidebarTab;
    label: string;
    icon: typeof MessageSquareText;
    badge?: number;
  }> = [
    { id: 'chats', label: 'Chats', icon: MessageSquareText, badge: unreadTotal },
    { id: 'updates', label: 'Updates', icon: CircleDashed },
    variant === 'business'
      ? { id: 'business', label: 'Tools', icon: BriefcaseBusiness }
      : { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'qa', label: 'QA', icon: Terminal },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden shrink-0 w-full bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-md border-t border-[#e9edef] dark:border-[#222d34] pb-safe z-30"
    >
      <div className="grid grid-cols-5 h-[56px]">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            activeTab === item.id || (item.id === 'chats' && activeTab === 'archived');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors"
            >
              <span
                className={`relative px-3.5 py-0.5 rounded-full flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-[#d9fdd3] dark:bg-[#0a332c] text-[#008069] dark:text-[#25d366]'
                    : 'text-[#54656f] dark:text-[#aebac1]'
                }`}
              >
                <Icon className="w-[19px] h-[19px]" />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#25d366] text-[#111b21] text-[9.5px] font-bold font-mono tabular-nums flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </span>
              <span
                className={
                  active
                    ? 'text-[#111b21] dark:text-[#e9edef] font-semibold'
                    : 'text-[#667781] dark:text-[#8696a0]'
                }
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
