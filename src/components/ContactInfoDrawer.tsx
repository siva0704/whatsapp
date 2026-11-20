import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Ban,
  BellOff,
  Check,
  Clock,
  Eraser,
  FileText,
  Search,
  ShieldCheck,
  ShieldOff,
  Tag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  BusinessLabel,
  Chat,
  Contact,
  EmulatorVariant,
  Message,
  OptInStatus,
} from '../../shared/types';
import { formatChatListDate, formatTime, getWindowStatus } from '../utils/format';
import { Avatar } from './Avatar';

interface ContactInfoDrawerProps {
  mode: 'info' | 'search';
  chat: Chat;
  variant: EmulatorVariant;
  contacts: Contact[];
  messages: Message[];
  labels: BusinessLabel[];
  onClose: () => void;
  onUpdateChat: (
    chatId: string,
    patch: Partial<Pick<Chat, 'archived' | 'muted' | 'labelIds' | 'participantIds' | 'lastInboundAt'>>
  ) => void;
  onBlockContact: (contactId: string, blocked: boolean) => Promise<void>;
  onSetContactOptIn: (contactId: string, status: OptInStatus) => Promise<void>;
  onClearChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onHighlightMessage: (messageId: string) => void;
  onPreviewImage: (url: string, caption?: string) => void;
  onQuickSimulateTyping: (chatId: string, active: boolean) => void;
}

export function ContactInfoDrawer({
  mode,
  chat,
  variant,
  contacts,
  messages,
  labels,
  onClose,
  onUpdateChat,
  onBlockContact,
  onSetContactOptIn,
  onClearChat,
  onDeleteChat,
  onHighlightMessage,
  onPreviewImage,
  onQuickSimulateTyping,
}: ContactInfoDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'delete' | null>(null);

  const directContact = chat.contactId
    ? contacts.find((c) => c.id === chat.contactId)
    : undefined;

  const mediaMessages = useMemo(
    () => messages.filter((m) => (m.type === 'image' || m.type === 'document') && m.media),
    [messages]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => m.body.toLowerCase().includes(q)).reverse();
  }, [messages, searchQuery]);

  const participants = useMemo(
    () =>
      chat.participantIds
        .map((id) => contacts.find((c) => c.id === id))
        .filter((c): c is Contact => Boolean(c)),
    [chat.participantIds, contacts]
  );

  const addableContacts = useMemo(
    () => contacts.filter((c) => !chat.participantIds.includes(c.id)),
    [contacts, chat.participantIds]
  );

  const windowStatus = chat.type === 'direct' ? getWindowStatus(chat.lastInboundAt) : null;

  const toggleLabel = (labelId: string) => {
    const has = chat.labelIds.includes(labelId);
    const next = has
      ? chat.labelIds.filter((id) => id !== labelId)
      : [...chat.labelIds, labelId];
    onUpdateChat(chat.id, { labelIds: next });
  };

  return (
    <aside
      aria-label={mode === 'search' ? 'Search messages' : 'Contact information'}
      className="fixed inset-0 z-40 md:static md:z-auto w-full md:w-[340px] lg:w-[370px] shrink-0 h-full bg-[#f0f2f5] dark:bg-[#111b21] border-l border-[#d1d7db] dark:border-[#2a3942] flex flex-col"
    >
      {/* Drawer Header */}
      <header className="h-[58px] md:h-[60px] px-3.5 md:px-4 pt-safe bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-9 md:h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-[16px] font-semibold text-[#111b21] dark:text-[#e9edef]">
          {mode === 'search'
            ? 'Search messages'
            : chat.type === 'group'
              ? 'Group info'
              : 'Contact info'}
        </h2>
      </header>

      {mode === 'search' ? (
        <div className="flex-1 flex flex-col bg-white dark:bg-[#111b21] overflow-hidden">
          <div className="p-3 border-b border-[#f0f2f5] dark:border-[#202c33]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#667781] absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search within conversation"
                placeholder="Search messages..."
                autoFocus
                className="w-full h-10 md:h-9 pl-9 pr-3 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto wa-scroll divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
            {!searchQuery.trim() ? (
              <p className="p-8 text-center text-[13.5px] text-[#667781] dark:text-[#8696a0]">
                Search for messages with {chat.name}.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="p-8 text-center text-[13.5px] text-[#667781] dark:text-[#8696a0]">
                No matching messages found.
              </p>
            ) : (
              searchResults.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onHighlightMessage(m.id);
                    onClose();
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
                >
                  <div className="flex items-center justify-between text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-0.5">
                    <span className="font-medium">
                      {m.direction === 'outbound' ? 'You' : m.senderName}
                    </span>
                    <span className="font-mono tabular-nums">{formatTime(m.timestamp)}</span>
                  </div>
                  <p className="text-[13.5px] text-[#111b21] dark:text-[#e9edef] line-clamp-2">
                    {m.body}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto wa-scroll space-y-2.5 pb-8">
          {/* Identity Hero */}
          <section className="bg-white dark:bg-[#111b21] px-6 py-7 flex flex-col items-center text-center shadow-xs">
            <Avatar
              name={chat.name}
              avatarUrl={chat.avatarUrl}
              color={chat.avatarColor}
              size="xl"
              isGroup={chat.type === 'group'}
              isBot={directContact?.isBot}
            />
            <div className="mt-4 flex items-center gap-1.5">
              <h3 className="text-[20px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                {chat.name}
              </h3>
              {directContact?.isBusiness && (
                <BadgeCheck className="w-5 h-5 text-[#00a884]" aria-label="Verified Business" />
              )}
            </div>
            {directContact?.profileName && directContact.profileName !== directContact.name && (
              <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                ~{directContact.profileName}
              </p>
            )}
            <p className="mt-1 text-[14px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0]">
              {chat.type === 'group'
                ? `Group · ${participants.length + 1} participants`
                : directContact?.phone || 'External peer'}
            </p>
          </section>

          {/* About / Description */}
          <section className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs">
            <div className="text-[12.5px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              {chat.type === 'group' ? 'Description' : 'About'}
            </div>
            <p className="text-[14.5px] text-[#111b21] dark:text-[#e9edef] leading-relaxed">
              {chat.type === 'group'
                ? chat.description || 'No group description.'
                : directContact?.about || 'Hey there! I am using WhatsApp.'}
            </p>
          </section>

          {/* 24-Hour Customer Service Window Control (Direct Chats) */}
          {chat.type === 'direct' && windowStatus && (
            <section className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1.5 font-medium text-[#667781] dark:text-[#8696a0]">
                  <Clock className="w-4 h-4 text-[#00a884]" /> 24h Service Window
                </span>
                <span
                  className={`font-mono text-[12px] font-semibold ${
                    windowStatus.open ? 'text-[#00a884]' : 'text-[#b45309] dark:text-[#f59e0b]'
                  }`}
                >
                  {windowStatus.open ? windowStatus.label : 'Closed'}
                </span>
              </div>
              <div className="text-[12px] text-[#667781] dark:text-[#8696a0] flex items-center justify-between">
                <span>Conversation category</span>
                <span className="font-mono font-semibold text-[#111b21] dark:text-[#e9edef]">
                  {chat.conversationCategory}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateChat(chat.id, {
                      lastInboundAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
                    })
                  }
                  className="py-2 px-2.5 rounded-lg border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                >
                  Expire 24h window
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateChat(chat.id, {
                      lastInboundAt: new Date().toISOString(),
                    })
                  }
                  className="py-2 px-2.5 rounded-lg border border-[#00a884]/50 text-[#008069] dark:text-[#25d366] text-[12px] font-medium hover:bg-[#00a884]/10"
                >
                  Re-open window
                </button>
              </div>
            </section>
          )}

          {/* Opt-In / Opt-Out Compliance Panel (Direct Chats) */}
          {directContact && (
            <section
              data-testid="contact-optin-section"
              className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#667781] dark:text-[#8696a0]">
                  {directContact.optInStatus === 'opted_out' ? (
                    <ShieldOff className="w-4 h-4 text-[#ea0038]" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-[#00a884]" />
                  )}
                  Opt-In Compliance
                </span>
                <span
                  className={`text-[12px] font-mono font-semibold uppercase ${
                    directContact.optInStatus === 'opted_out'
                      ? 'text-[#ea0038]'
                      : directContact.optInStatus === 'opted_in'
                        ? 'text-[#00a884]'
                        : 'text-[#667781]'
                  }`}
                >
                  {directContact.optInStatus.replace('_', ' ')}
                </span>
              </div>

              <div className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                Source: <span className="font-mono">{directContact.optInSource}</span> · Updated{' '}
                {formatChatListDate(directContact.optInUpdatedAt)}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void onSetContactOptIn(directContact.id, 'opted_in')}
                  className={`py-2 px-2.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                    directContact.optInStatus === 'opted_in'
                      ? 'bg-[#00a884] border-[#00a884] text-white'
                      : 'border-[#d1d7db] dark:border-[#374248] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
                  }`}
                >
                  Set Opted In
                </button>
                <button
                  type="button"
                  onClick={() => void onSetContactOptIn(directContact.id, 'opted_out')}
                  className={`py-2 px-2.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                    directContact.optInStatus === 'opted_out'
                      ? 'bg-[#ea0038] border-[#ea0038] text-white'
                      : 'border-[#d1d7db] dark:border-[#374248] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
                  }`}
                >
                  Set Opted Out
                </button>
              </div>

              {directContact.optInHistory.length > 0 && (
                <div className="pt-2 border-t border-[#f0f2f5] dark:border-[#202c33] space-y-1.5 max-h-36 overflow-y-auto wa-scroll">
                  <div className="text-[11px] font-semibold text-[#667781] dark:text-[#8696a0]">
                    Consent History ({directContact.optInHistory.length})
                  </div>
                  {directContact.optInHistory.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="text-[11.5px] flex items-baseline justify-between gap-2 text-[#54656f] dark:text-[#aebac1]"
                    >
                      <span className="truncate">
                        <strong
                          className={
                            entry.status === 'opted_out' ? 'text-[#ea0038]' : 'text-[#00a884]'
                          }
                        >
                          {entry.status}
                        </strong>{' '}
                        via {entry.source}
                        {entry.keyword ? ` ("${entry.keyword}")` : ''}
                      </span>
                      <span className="font-mono text-[10.5px] shrink-0">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Business Labels Section (Business Variant) */}
          {variant === 'business' && (
            <section className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#667781] dark:text-[#8696a0] mb-3">
                <Tag className="w-4 h-4 text-[#00a884]" />
                <span>Business Labels</span>
              </div>
              <div className="space-y-1.5">
                {labels.map((lbl) => {
                  const assigned = chat.labelIds.includes(lbl.id);
                  return (
                    <button
                      key={lbl.id}
                      type="button"
                      onClick={() => toggleLabel(lbl.id)}
                      className="w-full px-3 py-2 rounded-lg hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] flex items-center justify-between text-left transition-colors"
                    >
                      <span className="flex items-center gap-2.5 text-[14px] text-[#111b21] dark:text-[#e9edef]">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: lbl.color }}
                        />
                        {lbl.name}
                      </span>
                      <span
                        className={`w-5 h-5 rounded border flex items-center justify-center ${
                          assigned
                            ? 'bg-[#00a884] border-[#00a884] text-white'
                            : 'border-[#8696a0]'
                        }`}
                      >
                        {assigned && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Media & Docs */}
          <section className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs">
            <div className="flex items-center justify-between text-[13px] text-[#667781] dark:text-[#8696a0] mb-3">
              <span>Media and docs</span>
              <span className="font-mono tabular-nums">{mediaMessages.length}</span>
            </div>
            {mediaMessages.length === 0 ? (
              <p className="text-[13px] text-[#8696a0]">No shared media yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMessages.slice(0, 6).map((m) =>
                  m.type === 'image' && m.media?.url ? (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onPreviewImage(m.media!.url, m.media?.caption)}
                      aria-label="Open media item"
                      className="aspect-square rounded-md overflow-hidden bg-[#f0f2f5] dark:bg-[#202c33]"
                    >
                      <img
                        src={m.media.url}
                        alt={m.media.filename || 'Shared photo'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div
                      key={m.id}
                      className="aspect-square rounded-md bg-[#f0f2f5] dark:bg-[#202c33] p-2 flex flex-col items-center justify-center text-center"
                    >
                      <FileText className="w-5 h-5 text-[#ea0038] mb-1" />
                      <span className="text-[10px] text-[#54656f] dark:text-[#aebac1] line-clamp-2 break-all">
                        {m.media?.filename || 'Doc'}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* Group Participants */}
          {chat.type === 'group' && (
            <section className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#667781] dark:text-[#8696a0]">
                  {participants.length + 1} participants
                </span>
                {addableContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAddingMember((v) => !v)}
                    className="text-[12.5px] font-semibold text-[#00a884] hover:underline flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>

              {addingMember && (
                <div className="mb-3 p-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] space-y-1">
                  {addableContacts.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => {
                        onUpdateChat(chat.id, {
                          participantIds: [...chat.participantIds, ct.id],
                        });
                        setAddingMember(false);
                      }}
                      className="w-full px-2.5 py-2 rounded text-left text-[13px] hover:bg-white dark:hover:bg-[#111b21] flex items-center justify-between"
                    >
                      <span>{ct.name}</span>
                      <span className="text-[11px] text-[#00a884] font-semibold">Add</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2.5">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Avatar
                      name={p.name}
                      avatarUrl={p.avatarUrl}
                      color={p.avatarColor}
                      size="sm"
                      isBot={p.isBot}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">
                        {p.name}
                      </div>
                      <div className="text-[12px] font-mono text-[#667781] dark:text-[#8696a0] truncate">
                        {p.phone}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quick Presence Test Control */}
          <section className="bg-white dark:bg-[#111b21] px-5 py-4 shadow-xs">
            <div className="text-[12.5px] font-medium text-[#667781] dark:text-[#8696a0] mb-2.5">
              Presence simulation
            </div>
            <button
              type="button"
              onClick={() => onQuickSimulateTyping(chat.id, !chat.typingContactId)}
              className="w-full py-2.5 px-3.5 rounded-lg border border-[#d1d7db] dark:border-[#374248] text-[13.5px] font-medium text-[#111b21] dark:text-[#e9edef] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              {chat.typingContactId ? 'Stop typing indicator' : 'Simulate contact typing...'}
            </button>
          </section>

          {/* Chat Actions */}
          <section className="bg-white dark:bg-[#111b21] divide-y divide-[#f0f2f5] dark:divide-[#202c33] shadow-xs text-[14.5px]">
            <button
              type="button"
              onClick={() => onUpdateChat(chat.id, { muted: !chat.muted })}
              className="w-full min-h-[48px] px-5 py-3.5 flex items-center gap-4 text-[#111b21] dark:text-[#e9edef] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
            >
              <BellOff className="w-5 h-5 text-[#667781]" />
              <span>{chat.muted ? 'Unmute notifications' : 'Mute notifications'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateChat(chat.id, { archived: !chat.archived })}
              className="w-full min-h-[48px] px-5 py-3.5 flex items-center gap-4 text-[#111b21] dark:text-[#e9edef] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
            >
              {chat.archived ? (
                <>
                  <ArchiveRestore className="w-5 h-5 text-[#00a884]" />
                  <span>Unarchive chat</span>
                </>
              ) : (
                <>
                  <Archive className="w-5 h-5 text-[#667781]" />
                  <span>Archive chat</span>
                </>
              )}
            </button>

            {directContact && (
              <button
                type="button"
                onClick={() => void onBlockContact(directContact.id, !directContact.blocked)}
                className={`w-full min-h-[48px] px-5 py-3.5 flex items-center gap-4 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] ${
                  directContact.blocked ? 'text-[#00a884]' : 'text-[#ea0038]'
                }`}
              >
                <Ban className="w-5 h-5" />
                <span>
                  {directContact.blocked
                    ? `Unblock ${directContact.name}`
                    : `Block ${directContact.name}`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setConfirmAction('clear')}
              className="w-full min-h-[48px] px-5 py-3.5 flex items-center gap-4 text-[#ea0038] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
            >
              <Eraser className="w-5 h-5" />
              <span>Clear messages</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmAction('delete')}
              className="w-full min-h-[48px] px-5 py-3.5 flex items-center gap-4 text-[#ea0038] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
            >
              <Trash2 className="w-5 h-5" />
              <span>Delete chat</span>
            </button>
          </section>

          {confirmAction && (
            <div className="mx-4 p-3.5 rounded-lg bg-white dark:bg-[#202c33] border border-[#ea0038]/40 space-y-2.5">
              <p className="text-[13.5px] text-[#111b21] dark:text-[#e9edef]">
                {confirmAction === 'clear'
                  ? `Clear all messages in "${chat.name}"?`
                  : `Permanently delete "${chat.name}"?`}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="px-3 py-2 rounded-md text-[13px] text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmAction === 'clear') onClearChat(chat.id);
                    else onDeleteChat(chat.id);
                    setConfirmAction(null);
                  }}
                  className="px-3 py-2 rounded-md bg-[#ea0038] text-white text-[13px] font-semibold hover:bg-[#c80030]"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
