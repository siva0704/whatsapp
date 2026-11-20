import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BellOff,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  Pin,
  Search,
  ShoppingBag,
  Tag,
  Users,
  X,
} from 'lucide-react';
import type {
  BusinessLabel,
  Chat,
  Contact,
  EmulatorVariant,
  Message,
} from '../../shared/types';
import { formatChatListDate } from '../utils/format';
import { Avatar } from './Avatar';
import { MessageTicks } from './MessageTicks';

interface ChatListPanelProps {
  mode: 'chats' | 'archived';
  variant: EmulatorVariant;
  chats: Chat[];
  contacts: Contact[];
  messagesByChat: Record<string, Message[]>;
  labels: BusinessLabel[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenArchive: () => void;
  onBackFromArchive: () => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onUpdateChat: (
    chatId: string,
    patch: Partial<Pick<Chat, 'archived' | 'pinned' | 'muted' | 'unreadCount'>>
  ) => void;
}

type FilterMode = 'all' | 'unread' | 'groups';

export function ChatListPanel({
  mode,
  variant,
  chats,
  contacts,
  messagesByChat,
  labels,
  selectedChatId,
  onSelectChat,
  onOpenArchive,
  onBackFromArchive,
  onOpenNewChat,
  onOpenNewGroup,
  onUpdateChat,
}: ChatListPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);

  const archivedCount = useMemo(() => chats.filter((c) => c.archived).length, [chats]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    return chats
      .filter((c) => (mode === 'archived' ? c.archived : !c.archived))
      .filter((c) => {
        if (filter === 'unread') return c.unreadCount > 0;
        if (filter === 'groups') return c.type === 'group';
        return true;
      })
      .filter((c) => {
        if (variant === 'business' && selectedLabelId) {
          return c.labelIds.includes(selectedLabelId);
        }
        return true;
      })
      .filter((c) => {
        if (!query) return true;
        if (c.name.toLowerCase().includes(query)) return true;
        const contact = c.contactId ? contacts.find((ct) => ct.id === c.contactId) : undefined;
        if (contact && contact.phone.toLowerCase().includes(query)) return true;
        const msgs = messagesByChat[c.id] || [];
        return msgs.some((m) => m.body.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
  }, [chats, contacts, messagesByChat, mode, filter, selectedLabelId, search, variant]);

  const renderLastMessagePreview = (chat: Chat) => {
    if (chat.typingContactId) {
      const typer = contacts.find((c) => c.id === chat.typingContactId);
      const actionText = chat.typingMode === 'recording' ? 'recording audio...' : 'typing...';
      return (
        <span className="text-[#00a884] font-medium truncate">
          {chat.type === 'group' && typer ? `${typer.name} is ${actionText}` : actionText}
        </span>
      );
    }

    const msgs = messagesByChat[chat.id] || [];
    const last = msgs[msgs.length - 1];
    if (!last) {
      return <span className="text-[#667781] dark:text-[#8696a0] italic">No messages yet</span>;
    }

    const prefix =
      chat.type === 'group' && last.direction === 'inbound' && last.type !== 'system'
        ? `${last.senderName.split(' ')[0]}: `
        : '';

    return (
      <span className="flex items-center gap-1 min-w-0 text-[#667781] dark:text-[#8696a0]">
        {last.direction === 'outbound' && <MessageTicks status={last.status} />}
        {last.type === 'image' && <ImageIcon className="w-3.5 h-3.5 shrink-0" />}
        {last.type === 'document' && <FileText className="w-3.5 h-3.5 shrink-0" />}
        {last.type === 'voice' && <Mic className="w-3.5 h-3.5 shrink-0 text-[#00a884]" />}
        {last.type === 'catalog_item' && <ShoppingBag className="w-3.5 h-3.5 shrink-0 text-[#00a884]" />}
        <span className="truncate">
          {prefix}
          {last.body || (last.type === 'image' ? 'Photo' : last.type === 'voice' ? 'Voice message' : 'Attachment')}
        </span>
      </span>
    );
  };

  return (
    <aside
      aria-label={mode === 'archived' ? 'Archived chats' : 'Chat list'}
      className="w-full md:w-[375px] lg:w-[405px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col"
    >
      {/* Header */}
      <header className="h-[60px] px-4 flex items-center justify-between shrink-0">
        {mode === 'archived' ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackFromArchive}
              aria-label="Back to chats"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-[19px] font-bold text-[#111b21] dark:text-[#e9edef]">Archived</h1>
          </div>
        ) : (
          <>
            <h1 className="text-[21px] font-bold tracking-tight text-[#111b21] dark:text-[#e9edef] truncate">
              {variant === 'business' ? 'WhatsApp Business' : 'Chats'}
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onOpenNewGroup}
                aria-label="New group"
                title="New group"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Users className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onOpenNewChat}
                aria-label="New chat"
                title="New chat"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <MessageSquarePlus className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </header>

      {/* Search & Filters */}
      {mode === 'chats' && (
        <div className="px-3 pb-2.5 space-y-2 shrink-0 border-b border-[#f0f2f5] dark:border-[#202c33]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#54656f] dark:text-[#8696a0] absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search or start new chat"
              placeholder="Search or start new chat"
              className="w-full h-9 pl-10 pr-8 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(['all', 'unread', 'groups'] as FilterMode[]).map((f) => {
              const active = filter === f && !selectedLabelId;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setSelectedLabelId(null);
                  }}
                  className={`px-3 py-1 rounded-full text-[13px] font-medium capitalize whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[#e7fce3] dark:bg-[#0a332c] text-[#008069] dark:text-[#25d366]'
                      : 'bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]'
                  }`}
                >
                  {f}
                </button>
              );
            })}

            {variant === 'business' &&
              labels.map((lbl) => {
                const active = selectedLabelId === lbl.id;
                return (
                  <button
                    key={lbl.id}
                    type="button"
                    onClick={() => {
                      setSelectedLabelId(active ? null : lbl.id);
                      setFilter('all');
                    }}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#111b21] dark:bg-[#e9edef] text-white dark:text-[#111b21]'
                        : 'bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: lbl.color }}
                    />
                    {lbl.name}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Archived Entry Banner */}
      {mode === 'chats' && archivedCount > 0 && !search && filter === 'all' && !selectedLabelId && (
        <button
          type="button"
          onClick={onOpenArchive}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] border-b border-[#f0f2f5] dark:border-[#202c33] transition-colors shrink-0"
        >
          <span className="flex items-center gap-4">
            <span className="w-11 flex items-center justify-center text-[#00a884]">
              <Archive className="w-5 h-5" />
            </span>
            <span className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
              Archived
            </span>
          </span>
          <span className="text-[12px] font-semibold font-mono tabular-nums text-[#00a884]">
            {archivedCount}
          </span>
        </button>
      )}

      {/* Chat Rows */}
      <div className="flex-1 overflow-y-auto wa-scroll" data-testid="chat-list">
        {filteredChats.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] text-[#667781] dark:text-[#8696a0]">
              {mode === 'archived'
                ? 'No archived chats.'
                : search
                  ? `No chats matching "${search}".`
                  : 'No conversations in this view.'}
            </p>
            {mode === 'chats' && !search && (
              <button
                type="button"
                onClick={onOpenNewChat}
                className="mt-3 px-4 py-2 rounded-full bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] transition-colors"
              >
                Start new chat
              </button>
            )}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const selected = chat.id === selectedChatId;
            const contact = chat.contactId
              ? contacts.find((c) => c.id === chat.contactId)
              : undefined;
            const chatLabels =
              variant === 'business'
                ? labels.filter((l) => chat.labelIds.includes(l.id))
                : [];
            const menuOpen = menuChatId === chat.id;

            return (
              <div
                key={chat.id}
                className={`relative group border-b border-[#f0f2f5] dark:border-[#202c33]/70 ${
                  selected
                    ? 'bg-[#f0f2f5] dark:bg-[#2a3942]'
                    : 'hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuChatId(null);
                    onSelectChat(chat.id);
                  }}
                  aria-label={`Open chat with ${chat.name}`}
                  className="w-full px-3.5 py-3 flex items-center gap-3 text-left transition-colors"
                >
                  <Avatar
                    name={chat.name}
                    avatarUrl={chat.avatarUrl}
                    color={chat.avatarColor}
                    size="lg"
                    isGroup={chat.type === 'group'}
                    isBot={contact?.isBot}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15.5px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">
                        {chat.name}
                      </span>
                      <span
                        className={`text-[11.5px] font-mono tabular-nums shrink-0 ${
                          chat.unreadCount > 0
                            ? 'text-[#00a884] font-semibold'
                            : 'text-[#667781] dark:text-[#8696a0]'
                        }`}
                      >
                        {formatChatListDate(chat.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="text-[13.5px] min-w-0 flex-1 truncate">
                        {renderLastMessagePreview(chat)}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pr-5">
                        {chat.muted && (
                          <BellOff
                            aria-label="Muted"
                            className="w-3.5 h-3.5 text-[#8696a0]"
                          />
                        )}
                        {chat.pinned && (
                          <Pin
                            aria-label="Pinned"
                            className="w-3.5 h-3.5 text-[#8696a0] rotate-45"
                          />
                        )}
                        {chat.unreadCount > 0 && (
                          <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#25d366] text-[#111b21] text-[11px] font-bold font-mono tabular-nums flex items-center justify-center">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {chatLabels.length > 0 && (
                      <div className="flex items-center gap-2 mt-1 overflow-hidden">
                        {chatLabels.slice(0, 2).map((lbl) => (
                          <span
                            key={lbl.id}
                            className="inline-flex items-center gap-1 text-[11px] text-[#54656f] dark:text-[#aebac1] truncate"
                          >
                            <Tag
                              className="w-3 h-3 shrink-0"
                              style={{ color: lbl.color }}
                            />
                            <span className="truncate">{lbl.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>

                {/* Row Action Chevron */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuChatId(menuOpen ? null : chat.id);
                  }}
                  aria-label={`Chat options for ${chat.name}`}
                  className={`absolute right-2.5 bottom-3 w-6 h-6 rounded-full flex items-center justify-center text-[#667781] dark:text-[#aebac1] hover:bg-black/10 dark:hover:bg-white/10 transition-opacity ${
                    menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-3 top-12 z-30 w-44 py-1.5 rounded-lg bg-white dark:bg-[#233138] shadow-lg border border-[#e9edef] dark:border-[#374248] text-[13.5px] text-[#3b4a54] dark:text-[#d1d7db]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onUpdateChat(chat.id, { archived: !chat.archived });
                        setMenuChatId(null);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-2.5"
                    >
                      {chat.archived ? (
                        <>
                          <ArchiveRestore className="w-4 h-4" /> Unarchive chat
                        </>
                      ) : (
                        <>
                          <Archive className="w-4 h-4" /> Archive chat
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onUpdateChat(chat.id, { pinned: !chat.pinned });
                        setMenuChatId(null);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-2.5"
                    >
                      <Pin className="w-4 h-4" /> {chat.pinned ? 'Unpin chat' : 'Pin chat'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onUpdateChat(chat.id, { muted: !chat.muted });
                        setMenuChatId(null);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-2.5"
                    >
                      <BellOff className="w-4 h-4" /> {chat.muted ? 'Unmute' : 'Mute notifications'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onUpdateChat(chat.id, { unreadCount: chat.unreadCount > 0 ? 0 : 1 });
                        setMenuChatId(null);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229]"
                    >
                      {chat.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
