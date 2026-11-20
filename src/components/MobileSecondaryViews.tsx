import { useState } from 'react';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import type { CallLogItem, StatusUpdateItem } from '../../shared/types';
import { formatChatListDate, formatDuration } from '../utils/format';
import { Avatar } from './Avatar';

interface UpdatesPanelProps {
  updates: StatusUpdateItem[];
  onPreviewImage: (url: string, caption?: string) => void;
}

export function UpdatesPanel({ updates, onPreviewImage }: UpdatesPanelProps) {
  const [viewedIds, setViewedIds] = useState<string[]>([]);

  return (
    <aside
      aria-label="Status updates"
      className="w-full md:w-[375px] lg:w-[405px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col"
    >
      <header className="h-[56px] md:h-[60px] px-4 flex items-center justify-between border-b border-[#f0f2f5] dark:border-[#202c33] shrink-0">
        <h1 className="text-[20px] font-bold text-[#111b21] dark:text-[#e9edef]">Updates</h1>
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
        <div className="px-4 py-3 text-[12px] font-semibold text-[#667781] dark:text-[#8696a0]">
          Recent status updates
        </div>

        {updates.map((item) => {
          const isViewed = item.viewed || viewedIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setViewedIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
                if (item.mediaUrl) onPreviewImage(item.mediaUrl, `${item.contactName}: ${item.caption}`);
              }}
              className="w-full min-h-[64px] px-4 py-3 flex items-center gap-3.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <div
                className={`p-[2px] rounded-full ${
                  isViewed ? 'ring-2 ring-[#8696a0]/50' : 'ring-2 ring-[#00a884]'
                }`}
              >
                <Avatar
                  name={item.contactName}
                  avatarUrl={item.avatarUrl}
                  color={item.avatarColor}
                  size="md"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold truncate">{item.contactName}</span>
                  <span className="text-[11.5px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0] shrink-0">
                    {formatChatListDate(item.timestamp)}
                  </span>
                </div>
                <p className="text-[13px] text-[#667781] dark:text-[#8696a0] truncate mt-0.5">
                  {item.caption}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

interface CallsPanelProps {
  calls: CallLogItem[];
  onOpenContactChat: (contactId: string) => void;
}

export function CallsPanel({ calls, onOpenContactChat }: CallsPanelProps) {
  return (
    <aside
      aria-label="Calls log"
      className="w-full md:w-[375px] lg:w-[405px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col"
    >
      <header className="h-[56px] md:h-[60px] px-4 flex items-center justify-between border-b border-[#f0f2f5] dark:border-[#202c33] shrink-0">
        <h1 className="text-[20px] font-bold text-[#111b21] dark:text-[#e9edef]">Calls</h1>
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
        <div className="px-4 py-3 text-[12px] font-semibold text-[#667781] dark:text-[#8696a0]">
          Recent calls
        </div>

        {calls.map((c) => (
          <div
            key={c.id}
            className="min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
          >
            <button
              type="button"
              onClick={() => onOpenContactChat(c.contactId)}
              className="flex items-center gap-3.5 min-w-0 flex-1 text-left"
            >
              <Avatar
                name={c.contactName}
                avatarUrl={c.avatarUrl}
                color={c.avatarColor}
                size="md"
              />
              <div className="min-w-0">
                <div
                  className={`text-[15px] font-semibold truncate ${
                    c.direction === 'missed' ? 'text-[#ea0038]' : ''
                  }`}
                >
                  {c.contactName}
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  {c.direction === 'missed' ? (
                    <PhoneMissed className="w-3.5 h-3.5 text-[#ea0038]" />
                  ) : c.direction === 'incoming' ? (
                    <PhoneIncoming className="w-3.5 h-3.5 text-[#00a884]" />
                  ) : (
                    <PhoneOutgoing className="w-3.5 h-3.5 text-[#00a884]" />
                  )}
                  <span className="font-mono tabular-nums">
                    {formatChatListDate(c.timestamp)}
                    {c.durationSec ? ` · ${formatDuration(c.durationSec)}` : ''}
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenContactChat(c.contactId)}
              aria-label={`Open chat with ${c.contactName}`}
              className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[#00a884] hover:bg-[#00a884]/10"
            >
              {c.kind === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
