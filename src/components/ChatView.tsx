import { type ChangeEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Lock,
  Mic,
  Paperclip,
  Reply,
  Search,
  SendHorizontal,
  ShoppingBag,
  Smile,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  CatalogItemRef,
  Chat,
  Contact,
  EmulatorVariant,
  MediaAttachment,
  Message,
  MessageStatus,
  QuickReply,
  SelfAccount,
} from '../../shared/types';
import {
  formatDateDivider,
  formatDuration,
  formatFileSize,
  formatTime,
  getDayKey,
  getSenderColor,
} from '../utils/format';
import { Avatar } from './Avatar';
import { MessageTicks } from './MessageTicks';
import { VoiceNoteBubble } from './VoiceNoteBubble';

interface ChatViewProps {
  chat: Chat | null;
  variant: EmulatorVariant;
  self: SelfAccount;
  contacts: Contact[];
  messages: Message[];
  quickReplies: QuickReply[];
  catalog: CatalogItemRef[];
  highlightedMessageId?: string | null;
  onBackMobile: () => void;
  onOpenInfo: () => void;
  onOpenSearch: () => void;
  onSendMessage: (payload: {
    chatId: string;
    body: string;
    type?: Message['type'];
    media?: MediaAttachment;
    catalogItemId?: string;
    replyToMessageId?: string;
  }) => Promise<void>;
  onUploadMedia: (payload: {
    dataUrl: string;
    filename?: string;
    mimeType?: string;
  }) => Promise<MediaAttachment>;
  onUpdateReceipt: (messageId: string, status: MessageStatus) => Promise<void>;
  onPreviewImage: (url: string, caption?: string) => void;
}

const COMMON_EMOJIS = ['👍', '✅', '🎉', '🔥', '🙏', '👋', '📦', '☕', '🚀', '💬', '⚡', '❤️', '😊', '🤔', '👀', '📎'];

export function ChatView({
  chat,
  variant,
  self,
  contacts,
  messages,
  quickReplies,
  catalog,
  highlightedMessageId,
  onBackMobile,
  onOpenInfo,
  onOpenSearch,
  onSendMessage,
  onUploadMedia,
  onUpdateReceipt,
  onPreviewImage,
}: ChatViewProps) {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [receiptMenuMsgId, setReceiptMenuMsgId] = useState<string | null>(null);

  // Voice Note Recorder state
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.id, messages.length, chat?.typingContactId]);

  useEffect(() => {
    setReplyingTo(null);
    setShowAttach(false);
    setShowEmoji(false);
    setShowCatalogPicker(false);
    setReceiptMenuMsgId(null);
    setRecording(false);
    setRecordSec(0);
  }, [chat?.id]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecordSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Quick Reply "/" matcher (Business variant)
  const quickReplyMatches = useMemo(() => {
    if (variant !== 'business' || !draft.startsWith('/')) return [];
    const term = draft.slice(1).toLowerCase();
    return quickReplies.filter(
      (qr) =>
        qr.shortcut.toLowerCase().includes(term) ||
        qr.message.toLowerCase().includes(term)
    );
  }, [variant, draft, quickReplies]);

  if (!chat) {
    return (
      <main className="flex-1 h-full bg-[#f0f2f5] dark:bg-[#222e35] flex flex-col items-center justify-center px-8 text-center select-none border-b-[6px] border-[#25d366]">
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#00a884]/12 text-[#00a884] flex items-center justify-center">
            <CheckCheck className="w-9 h-9" />
          </div>
          <h2 className="text-[28px] font-normal text-[#41525d] dark:text-[#e9edef] tracking-tight">
            {variant === 'business' ? 'WhatsApp Business Emulator' : 'WhatsApp Web Emulator'}
          </h2>
          <p className="text-[14px] leading-relaxed text-[#667781] dark:text-[#8696a0]">
            Select a conversation to inspect real-time delivery ticks, typing states, media attachments, and automated bot replies—or open the QA Console to inject inbound messages and monitor signed webhooks.
          </p>
          <div className="pt-4 flex items-center justify-center gap-1.5 text-[12px] text-[#8696a0]">
            <Lock className="w-3.5 h-3.5" />
            <span>Isolated local test sandbox · Zero external WhatsApp traffic</span>
          </div>
        </div>
      </main>
    );
  }

  const directContact = chat.contactId
    ? contacts.find((c) => c.id === chat.contactId)
    : undefined;

  const typingContact = chat.typingContactId
    ? contacts.find((c) => c.id === chat.typingContactId)
    : undefined;

  const subtitle = (() => {
    if (typingContact) {
      const action = chat.typingMode === 'recording' ? 'recording audio...' : 'typing...';
      return chat.type === 'group' ? `${typingContact.name} is ${action}` : action;
    }
    if (chat.type === 'group') {
      const names = chat.participantIds
        .map((id) => contacts.find((c) => c.id === id)?.name)
        .filter(Boolean);
      return ['You', ...names].join(', ');
    }
    if (!directContact) return 'offline';
    if (directContact.presence === 'online') return 'online';
    return `last seen ${formatTime(directContact.lastSeen)}`;
  })();

  const handleSendText = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    setShowEmoji(false);
    await onSendMessage({
      chatId: chat.id,
      body: trimmed,
      type: 'text',
      replyToMessageId: replyingTo?.id,
    });
    setReplyingTo(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (quickReplyMatches.length > 0 && draft.startsWith('/')) {
        setDraft(quickReplyMatches[0].message);
        return;
      }
      void handleSendText();
    }
  };

  const handleFileSelected = async (
    e: ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'document'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const uploaded = await onUploadMedia({
        dataUrl,
        filename: file.name,
        mimeType: file.type || (kind === 'image' ? 'image/png' : 'application/octet-stream'),
      });
      await onSendMessage({
        chatId: chat.id,
        body: kind === 'image' ? draft.trim() || file.name : file.name,
        type: kind,
        media: {
          ...uploaded,
          caption: kind === 'image' ? draft.trim() || undefined : undefined,
        },
        replyToMessageId: replyingTo?.id,
      });
      setDraft('');
      setReplyingTo(null);
      setShowAttach(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSendVoiceNote = async () => {
    const dur = Math.max(1, recordSec);
    setRecording(false);
    setRecordSec(0);
    const waveform = Array.from({ length: 22 }, (_, i) =>
      Math.min(95, Math.max(18, Math.round(35 + Math.sin(i * 0.9 + dur) * 32 + ((i * 17) % 24))))
    );
    await onSendMessage({
      chatId: chat.id,
      body: `Voice message (${formatDuration(dur)})`,
      type: 'voice',
      media: {
        id: `voice-${Date.now()}`,
        url: '',
        mimeType: 'audio/ogg',
        durationSec: dur,
        waveform,
      },
      replyToMessageId: replyingTo?.id,
    });
    setReplyingTo(null);
  };

  const handleSendCatalogItem = async (item: CatalogItemRef) => {
    setShowCatalogPicker(false);
    setShowAttach(false);
    await onSendMessage({
      chatId: chat.id,
      body: `${item.name} — ${item.currency} ${item.price}`,
      type: 'catalog_item',
      catalogItemId: item.id,
    });
  };

  return (
    <main className="flex-1 min-w-0 h-full flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
      {/* Chat Header */}
      <header className="h-[60px] px-4 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="Back to chat list"
            className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onOpenInfo}
            aria-label={`View info for ${chat.name}`}
            className="flex items-center gap-3 min-w-0 text-left rounded-lg py-1 pr-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Avatar
              name={chat.name}
              avatarUrl={chat.avatarUrl}
              color={chat.avatarColor}
              size="md"
              isGroup={chat.type === 'group'}
              isBot={directContact?.isBot}
            />
            <div className="min-w-0">
              <div className="text-[15.5px] font-semibold text-[#111b21] dark:text-[#e9edef] truncate leading-snug">
                {chat.name}
              </div>
              <div
                className={`text-[12.5px] truncate leading-snug ${
                  typingContact
                    ? 'text-[#00a884] font-medium'
                    : 'text-[#667781] dark:text-[#8696a0]'
                }`}
              >
                {subtitle}
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search messages in chat"
            title="Search in chat"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="Contact info"
            title="Contact / Group info"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Message Thread */}
      <div
        className="flex-1 overflow-y-auto wa-chat-wallpaper wa-scroll px-4 sm:px-10 lg:px-14 py-4 space-y-1.5"
        data-testid="message-thread"
      >
        {messages.length === 0 ? (
          <div className="my-8 mx-auto max-w-sm rounded-lg bg-[#fff5c4] dark:bg-[#182229] px-4 py-2.5 text-center text-[12.5px] text-[#54656f] dark:text-[#ffd279] shadow-xs">
            Messages in this chat are persisted locally by WA-Sim. Send a message or trigger an inbound event via REST API.
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const showDateDivider = !prev || getDayKey(prev.timestamp) !== getDayKey(msg.timestamp);
            const isOutbound = msg.direction === 'outbound';
            const isHighlighted = highlightedMessageId === msg.id;
            const senderContact = contacts.find((c) => c.id === msg.senderId);

            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="py-1.5 flex justify-center">
                  <span className="px-3 py-1 rounded-lg bg-white/90 dark:bg-[#182229] text-[12px] text-[#54656f] dark:text-[#8696a0] shadow-xs">
                    {msg.body}
                  </span>
                </div>
              );
            }

            const sameSenderAsPrev =
              prev &&
              prev.type !== 'system' &&
              prev.senderId === msg.senderId &&
              !showDateDivider;

            return (
              <div key={msg.id}>
                {showDateDivider && (
                  <div className="my-3 flex justify-center">
                    <span className="px-3 py-1 rounded-lg bg-white/95 dark:bg-[#182229] text-[11.5px] font-medium tracking-wide text-[#54656f] dark:text-[#8696a0] shadow-xs">
                      {formatDateDivider(msg.timestamp)}
                    </span>
                  </div>
                )}

                <div
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} ${
                    sameSenderAsPrev ? 'mt-0.5' : 'mt-2'
                  }`}
                >
                  <div
                    className={`relative group ${
                      msg.type === 'image' || msg.type === 'catalog_item'
                        ? 'w-[300px] sm:w-[324px]'
                        : 'max-w-[82%] sm:max-w-[68%]'
                    } rounded-lg px-2.5 pt-1.5 pb-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-all ${
                      isOutbound
                        ? `bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] ${!sameSenderAsPrev ? 'rounded-tr-none' : ''}`
                        : `bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] ${!sameSenderAsPrev ? 'rounded-tl-none' : ''}`
                    } ${isHighlighted ? 'ring-2 ring-[#00a884]' : ''}`}
                    data-testid={`message-bubble-${msg.direction}`}
                  >
                    {/* Authentic WhatsApp Bubble Corner Tail */}
                    {!sameSenderAsPrev && isOutbound && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 8 13"
                        width="8"
                        height="13"
                        className="absolute top-0 -right-[7px] text-[#d9fdd3] dark:text-[#005c4b]"
                      >
                        <path
                          fill="currentColor"
                          d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"
                        />
                      </svg>
                    )}
                    {!sameSenderAsPrev && !isOutbound && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 8 13"
                        width="8"
                        height="13"
                        className="absolute top-0 -left-[7px] text-white dark:text-[#202c33]"
                      >
                        <path
                          fill="currentColor"
                          d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"
                        />
                      </svg>
                    )}

                    {/* Hover quick actions: Reply + Outbound Receipt Switcher */}
                    <div
                      className={`absolute top-1 ${
                        isOutbound ? '-left-16' : '-right-9'
                      } flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(msg);
                          inputRef.current?.focus();
                        }}
                        aria-label="Reply to message"
                        title="Reply"
                        className="w-7 h-7 rounded-full bg-white/90 dark:bg-[#202c33] border border-black/10 dark:border-white/10 text-[#54656f] dark:text-[#aebac1] flex items-center justify-center hover:text-[#111b21] dark:hover:text-white shadow-xs"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>

                      {isOutbound && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setReceiptMenuMsgId(receiptMenuMsgId === msg.id ? null : msg.id)
                            }
                            aria-label="Override delivery receipt status"
                            title="Set receipt status (QA)"
                            className="w-7 h-7 rounded-full bg-white/90 dark:bg-[#202c33] border border-black/10 dark:border-white/10 text-[#54656f] dark:text-[#aebac1] flex items-center justify-center hover:text-[#00a884] shadow-xs"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                          </button>

                          {receiptMenuMsgId === msg.id && (
                            <div className="absolute right-0 top-8 z-30 w-32 py-1 rounded-lg bg-white dark:bg-[#233138] shadow-lg border border-[#e9edef] dark:border-[#374248] text-[12px]">
                              {(['queued', 'sent', 'delivered', 'read', 'failed'] as MessageStatus[]).map(
                                (st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => {
                                      setReceiptMenuMsgId(null);
                                      void onUpdateReceipt(msg.id, st);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left capitalize hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center justify-between ${
                                      msg.status === st ? 'font-semibold text-[#00a884]' : ''
                                    }`}
                                  >
                                    <span>{st}</span>
                                    <MessageTicks status={st} />
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Group sender name */}
                    {chat.type === 'group' && !isOutbound && !sameSenderAsPrev && (
                      <div
                        className="text-[12.5px] font-semibold mb-0.5 leading-tight"
                        style={{ color: getSenderColor(msg.senderId) }}
                      >
                        {msg.senderName}
                      </div>
                    )}

                    {/* Quoted Reply Preview */}
                    {msg.replyTo && (
                      <div className="mb-1.5 rounded bg-black/5 dark:bg-black/20 px-2.5 py-1.5 text-[12.5px] border-l-[3px] border-[#00a884]">
                        <div className="font-semibold text-[#008069] dark:text-[#25d366] text-[12px]">
                          {msg.replyTo.senderName}
                        </div>
                        <div className="text-[#54656f] dark:text-[#aebac1] truncate max-w-[260px]">
                          {msg.replyTo.body}
                        </div>
                      </div>
                    )}

                    {/* Media: Image */}
                    {msg.type === 'image' && msg.media?.url && (
                      <button
                        type="button"
                        onClick={() => onPreviewImage(msg.media!.url, msg.media?.caption || msg.body)}
                        aria-label="View full image"
                        className="block w-full mb-1.5 rounded-md overflow-hidden bg-black/10"
                      >
                        <img
                          src={msg.media.url}
                          alt={msg.media.caption || msg.media.filename || 'Attachment'}
                          referrerPolicy="no-referrer"
                          className="w-full h-[215px] object-cover hover:opacity-95 transition-opacity"
                        />
                      </button>
                    )}

                    {/* Media: Document */}
                    {msg.type === 'document' && msg.media && (
                      <div className="mb-1 rounded-md bg-black/5 dark:bg-black/20 p-2.5 flex items-center gap-3 min-w-[230px]">
                        <div className="w-10 h-10 rounded-lg bg-[#ea0038]/12 text-[#ea0038] flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium truncate">
                            {msg.media.filename || msg.body}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0]">
                            {formatFileSize(msg.media.sizeBytes)} · {msg.media.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                          </div>
                        </div>
                        {msg.media.url && msg.media.url !== '#' && (
                          <a
                            href={msg.media.url}
                            download={msg.media.filename || 'attachment'}
                            aria-label="Download document"
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/10 dark:hover:bg-white/10"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Media: Voice Note */}
                    {msg.type === 'voice' && (
                      <VoiceNoteBubble
                        media={msg.media}
                        senderName={isOutbound ? self.name : msg.senderName}
                        senderAvatarUrl={isOutbound ? self.avatarUrl : senderContact?.avatarUrl}
                        senderColor={senderContact?.avatarColor || '#00a884'}
                        isOutbound={isOutbound}
                      />
                    )}

                    {/* Business Catalog Product Card */}
                    {msg.type === 'catalog_item' && msg.catalogItem && (
                      <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-[#025144] w-full border border-black/5 dark:border-white/10">
                        {msg.catalogItem.imageUrl && (
                          <img
                            src={msg.catalogItem.imageUrl}
                            alt={msg.catalogItem.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-40 object-cover"
                          />
                        )}
                        <div className="p-2.5 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#008069] dark:text-[#25d366]">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Catalog Item · {msg.catalogItem.sku}</span>
                          </div>
                          <div className="text-[14px] font-semibold leading-snug">
                            {msg.catalogItem.name}
                          </div>
                          <div className="text-[12.5px] text-[#54656f] dark:text-[#d1d7db] line-clamp-2">
                            {msg.catalogItem.description}
                          </div>
                          <div className="pt-1 text-[14px] font-bold font-mono tabular-nums text-[#111b21] dark:text-[#e9edef]">
                            {msg.catalogItem.currency} {msg.catalogItem.price}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Text / Caption Body + Inline Timestamp & Ticks */}
                    <div className="flex flex-wrap items-end justify-end gap-x-2">
                      {msg.type !== 'voice' && msg.type !== 'document' && msg.type !== 'catalog_item' && (
                        <p className="text-[14.2px] leading-[1.42] whitespace-pre-wrap break-words flex-1 min-w-0">
                          {msg.body}
                        </p>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0] ml-auto pt-0.5 select-none">
                        <span>{formatTime(msg.timestamp)}</span>
                        {isOutbound && <MessageTicks status={msg.status} />}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Live Typing / Recording Indicator Bubble */}
        {typingContact && (
          <div className="flex justify-start mt-2" data-testid="typing-indicator">
            <div className="bg-white dark:bg-[#202c33] rounded-lg rounded-tl-none px-3.5 py-2.5 shadow-xs flex items-center gap-2 text-[13px] text-[#667781] dark:text-[#8696a0]">
              {chat.typingMode === 'recording' ? (
                <>
                  <Mic className="w-4 h-4 text-[#00a884]" />
                  <span>{typingContact.name} is recording audio...</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:-0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:-0.1s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce" />
                  </span>
                  <span className="sr-only">{typingContact.name} is typing</span>
                </>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer Area */}
      <footer className="relative bg-[#f0f2f5] dark:bg-[#202c33] border-t border-[#d1d7db] dark:border-[#2a3942] shrink-0">
        {/* Quoted Reply Bar */}
        {replyingTo && (
          <div className="px-4 py-2 bg-[#e9edef] dark:bg-[#182229] flex items-center justify-between gap-3 border-b border-[#d1d7db] dark:border-[#2a3942]">
            <div className="min-w-0 border-l-[3px] border-[#00a884] pl-2.5">
              <div className="text-[12px] font-semibold text-[#008069] dark:text-[#25d366]">
                Replying to {replyingTo.direction === 'outbound' ? 'You' : replyingTo.senderName}
              </div>
              <div className="text-[13px] text-[#54656f] dark:text-[#aebac1] truncate">
                {replyingTo.body}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Business Quick Reply "/" Autocomplete Popover */}
        {quickReplyMatches.length > 0 && (
          <div
            role="listbox"
            aria-label="Quick replies"
            className="absolute bottom-full left-3 right-3 mb-1.5 max-h-56 overflow-y-auto rounded-lg bg-white dark:bg-[#233138] shadow-xl border border-[#d1d7db] dark:border-[#374248] divide-y divide-[#f0f2f5] dark:divide-[#2a3942] z-30"
          >
            <div className="px-3.5 py-2 text-[11.5px] font-semibold text-[#008069] dark:text-[#25d366] flex items-center gap-1.5 bg-[#f7f8fa] dark:bg-[#182229]">
              <Zap className="w-3.5 h-3.5" />
              <span>Quick Replies (WhatsApp Business)</span>
            </div>
            {quickReplyMatches.map((qr) => (
              <button
                key={qr.id}
                type="button"
                role="option"
                onClick={() => {
                  setDraft(qr.message);
                  inputRef.current?.focus();
                }}
                className="w-full px-3.5 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors"
              >
                <div className="text-[13px] font-mono font-semibold text-[#008069] dark:text-[#25d366]">
                  /{qr.shortcut}
                </div>
                <div className="text-[13px] text-[#3b4a54] dark:text-[#d1d7db] truncate">
                  {qr.message}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Emoji Picker Popover */}
        {showEmoji && (
          <div className="absolute bottom-full left-3 mb-2 p-2.5 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#d1d7db] dark:border-[#374248] grid grid-cols-8 gap-1 z-30">
            {COMMON_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  setDraft((d) => d + em);
                  inputRef.current?.focus();
                }}
                className="w-8 h-8 rounded hover:bg-[#f0f2f5] dark:hover:bg-[#374248] text-lg flex items-center justify-center"
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {/* Attachment Menu Popover */}
        {showAttach && (
          <div className="absolute bottom-full left-12 mb-2 w-52 py-1.5 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#d1d7db] dark:border-[#374248] z-30 text-[14px] text-[#3b4a54] dark:text-[#e9edef]">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
            >
              <ImageIcon className="w-4 h-4 text-[#007bfc]" /> Photos & Images
            </button>
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
            >
              <FileText className="w-4 h-4 text-[#7f66ff]" /> Document
            </button>
            {variant === 'business' && (
              <button
                type="button"
                onClick={() => {
                  setShowAttach(false);
                  setShowCatalogPicker(true);
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
              >
                <ShoppingBag className="w-4 h-4 text-[#00a884]" /> Catalog Item
              </button>
            )}
          </div>
        )}

        {/* Business Catalog Item Picker */}
        {showCatalogPicker && variant === 'business' && (
          <div className="absolute bottom-full left-3 right-3 sm:right-auto sm:w-80 mb-2 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#d1d7db] dark:border-[#374248] overflow-hidden z-30">
            <div className="px-3.5 py-2.5 bg-[#f7f8fa] dark:bg-[#182229] flex items-center justify-between border-b border-[#e9edef] dark:border-[#2a3942]">
              <span className="text-[13px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                Send Catalog Item
              </span>
              <button
                type="button"
                onClick={() => setShowCatalogPicker(false)}
                aria-label="Close catalog picker"
                className="text-[#54656f] dark:text-[#aebac1]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#f0f2f5] dark:divide-[#2a3942]">
              {catalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleSendCatalogItem(item)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">
                      {item.name}
                    </div>
                    <div className="text-[11.5px] font-mono text-[#667781] dark:text-[#8696a0]">
                      {item.sku} · {item.currency} {item.price}
                    </div>
                  </div>
                  <SendHorizontal className="w-4 h-4 text-[#00a884] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFileSelected(e, 'image')}
        />
        <input
          ref={docInputRef}
          type="file"
          className="hidden"
          onChange={(e) => void handleFileSelected(e, 'document')}
        />

        {/* Voice Recorder Bar OR Standard Input Bar */}
        {recording ? (
          <div
            className="h-[62px] px-4 flex items-center justify-between gap-4"
            data-testid="voice-recorder-bar"
          >
            <button
              type="button"
              onClick={() => {
                setRecording(false);
                setRecordSec(0);
              }}
              aria-label="Discard voice recording"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#ea0038] hover:bg-[#ea0038]/10 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-center justify-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ea0038] animate-pulse" />
              <span className="text-[15px] font-mono tabular-nums font-medium text-[#111b21] dark:text-[#e9edef]">
                {formatDuration(recordSec)}
              </span>
              <div className="hidden sm:flex items-center gap-1 h-6" aria-hidden="true">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-[3px] h-5 rounded-full bg-[#00a884] wa-rec-bar"
                    style={{ animationDelay: `${(i % 6) * 110}ms` }}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSendVoiceNote()}
              aria-label="Send voice note"
              className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] transition-colors shadow-xs"
            >
              <SendHorizontal className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="min-h-[62px] px-3 py-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEmoji((v) => !v);
                setShowAttach(false);
              }}
              aria-label="Insert emoji"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAttach((v) => !v);
                setShowEmoji(false);
                setShowCatalogPicker(false);
              }}
              aria-label="Attach media"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Message input"
              placeholder={
                variant === 'business'
                  ? 'Type a message or / for quick replies'
                  : 'Type a message'
              }
              className="flex-1 h-[42px] px-4 rounded-lg bg-white dark:bg-[#2a3942] text-[14.5px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#00a884]/35"
            />

            {draft.trim() ? (
              <button
                type="button"
                onClick={() => void handleSendText()}
                aria-label="Send message"
                className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] transition-colors shrink-0"
              >
                <SendHorizontal className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRecording(true);
                  setRecordSec(0);
                  setShowAttach(false);
                  setShowEmoji(false);
                }}
                aria-label="Record voice message"
                title="Record voice note"
                className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </footer>
    </main>
  );
}
