import {
  Archive,
  BriefcaseBusiness,
  MessageSquareText,
  Moon,
  Settings,
  Sun,
  Terminal,
} from 'lucide-react';
import type { EmulatorVariant, SelfAccount } from '../../shared/types';
import { Avatar } from './Avatar';

export type SidebarTab = 'chats' | 'archived' | 'business' | 'qa' | 'settings';

interface LeftRailProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  variant: EmulatorVariant;
  onToggleVariant: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  unreadTotal: number;
  archivedCount: number;
  self: SelfAccount;
}

export function LeftRail({
  activeTab,
  onSelectTab,
  variant,
  onToggleVariant,
  darkMode,
  onToggleDarkMode,
  unreadTotal,
  archivedCount,
  self,
}: LeftRailProps) {
  const railBtnClass = (active: boolean) =>
    `relative w-10 h-10 rounded-full flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#00a884] ${
      active
        ? 'bg-[#d9dbdf] dark:bg-[#374248] text-[#111b21] dark:text-[#e9edef]'
        : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10'
    }`;

  return (
    <nav
      aria-label="Primary navigation"
      className="w-[62px] shrink-0 h-full bg-[#f0f2f5] dark:bg-[#202c33] border-r border-[#d1d7db] dark:border-[#2a3942] flex flex-col items-center justify-between py-3 select-none"
    >
      {/* Top Icons */}
      <div className="flex flex-col items-center gap-2.5">
        {/* Authentic WhatsApp / WA Business emblem */}
        <button
          type="button"
          onClick={() => onSelectTab('chats')}
          aria-label={variant === 'business' ? 'WhatsApp Business Home' : 'WhatsApp Home'}
          title={variant === 'business' ? 'WhatsApp Business Emulator' : 'WhatsApp Personal Emulator'}
          className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center mb-1 shadow-xs hover:bg-[#008f72] transition-colors"
        >
          {variant === 'business' ? (
            <span className="font-bold text-lg leading-none">B</span>
          ) : (
            <MessageSquareText className="w-5 h-5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('chats')}
          aria-label="Chats"
          title="Chats"
          className={railBtnClass(activeTab === 'chats')}
        >
          <MessageSquareText className="w-5 h-5" />
          {unreadTotal > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25d366] text-[#111b21] text-[10px] font-bold font-mono tabular-nums flex items-center justify-center">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('archived')}
          aria-label="Archived chats"
          title={`Archived (${archivedCount})`}
          className={railBtnClass(activeTab === 'archived')}
        >
          <Archive className="w-5 h-5" />
          {archivedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#667781] text-white text-[10px] font-semibold font-mono tabular-nums flex items-center justify-center">
              {archivedCount}
            </span>
          )}
        </button>

        {variant === 'business' && (
          <button
            type="button"
            onClick={() => onSelectTab('business')}
            aria-label="Business tools"
            title="Business Tools (Profile, Catalog, Quick Replies, Labels, Automation)"
            className={railBtnClass(activeTab === 'business')}
          >
            <BriefcaseBusiness className="w-5 h-5" />
          </button>
        )}

        <div className="w-7 h-px bg-[#d1d7db] dark:bg-[#2a3942] my-1" />

        <button
          type="button"
          onClick={() => onSelectTab('qa')}
          aria-label="QA Test Console"
          title="QA Console (Inbound Simulator, Auto-Reply Rules, Webhook Logs)"
          className={railBtnClass(activeTab === 'qa')}
        >
          <Terminal className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleVariant}
          aria-label={variant === 'business' ? 'Switch to Personal WhatsApp' : 'Switch to WhatsApp Business'}
          title={variant === 'business' ? 'Active: Business · Click for Personal' : 'Active: Personal · Click for Business'}
          className={`w-10 h-8 rounded-lg text-[10px] font-bold tracking-tight flex items-center justify-center border transition-colors ${
            variant === 'business'
              ? 'bg-[#00a884]/15 border-[#00a884] text-[#008069] dark:text-[#25d366]'
              : 'bg-white dark:bg-[#111b21] border-[#d1d7db] dark:border-[#374248] text-[#54656f] dark:text-[#aebac1] hover:border-[#00a884]'
          }`}
        >
          {variant === 'business' ? 'BIZ' : 'PER'}
        </button>

        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
          className={railBtnClass(false)}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('settings')}
          aria-label="Settings"
          title="Settings"
          className={railBtnClass(activeTab === 'settings')}
        >
          <Settings className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('settings')}
          aria-label={`Profile: ${self.name}`}
          title={`${self.name} (${self.phone})`}
          className="rounded-full ring-2 ring-transparent hover:ring-[#00a884] transition-all"
        >
          <Avatar name={self.name} avatarUrl={self.avatarUrl} size="sm" />
        </button>
      </div>
    </nav>
  );
}
