import {
  type ChangeEvent,
  type KeyboardEvent,
  type TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Info,
  LayoutList,
  Link2,
  Lock,
  MapPin,
  Mic,
  Paperclip,
  Phone,
  Receipt,
  Reply,
  Search,
  SendHorizontal,
  ShoppingBag,
  Smile,
  Sparkles,
  Sticker,
  Trash2,
  UserRound,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import type {
  CatalogItemRef,
  Chat,
  Contact,
  ContactCardPayload,
  EmulatorVariant,
  InteractivePayload,
  LocationPayload,
  MediaAttachment,
  Message,
  MessageStatus,
  OrderPayload,
  QuickReply,
  SelfAccount,
} from '../../shared/types';
import { ApiRequestError } from '../services/api';
import {
  formatDateDivider,
  formatDuration,
  formatFileSize,
  formatTime,
  getDayKey,
  getSenderColor,
  getWindowStatus,
} from '../utils/format';
import { Avatar } from './Avatar';
import { MessageTicks } from './MessageTicks';
import { VoiceNoteBubble } from './VoiceNoteBubble';

interface ChatViewProps {
  chat: Chat | null;
  variant: EmulatorVariant;
  perspective?: 'client' | 'business';
  onTogglePerspective?: () => void;
  enforce24hWindow: boolean;
  self: SelfAccount;
  contacts: Contact[];
  messages: Message[];
  quickReplies: QuickReply[];
  catalog: CatalogItemRef[];
  highlightedMessageId?: string | null;
  onBackMobile: () => void;
  onOpenInfo: () => void;
  onOpenSearch: () => void;
  onOpenTemplateModal: () => void;
  onOpenRichModal: () => void;
  onSendMessage: (payload: {
    chatId: string;
    body?: string;
    type?: Message['type'];
    media?: MediaAttachment;
    catalogItemId?: string;
    carouselItemIds?: string[];
    location?: LocationPayload;
    contacts?: ContactCardPayload[];
    interactive?: InteractivePayload;
    order?: OrderPayload;
    replyToMessageId?: string;
  }) => Promise<void>;
  onSendAsClient?: (payload: {
    chatId: string;
    body: string;
    type?: Message['type'];
    replyToMessageId?: string;
  }) => Promise<void>;
  onSimulateInteractiveReply: (payload: {
    chatId: string;
    selectedId: string;
    selectedTitle: string;
    kind: 'button_reply' | 'list_reply';
  }) => Promise<void>;
  onUploadMedia: (payload: {
    dataUrl: string;
    filename?: string;
    mimeType?: string;
  }) => Promise<MediaAttachment>;
  onUpdateReceipt: (messageId: string, status: MessageStatus, errorCode?: number) => Promise<void>;
  onPreviewImage: (url: string, caption?: string) => void;
}

const COMMON_EMOJIS = ['👍', '✅', '🎉', '🔥', '🙏', '👋', '📦', '☕', '🚀', '💬', '⚡', '❤️', '😊', '🤔', '👀', '📎'];

export function ChatView({
  chat,
  variant,
  perspective = 'client',
  onTogglePerspective,
  enforce24hWindow,
  self,
  contacts,
  messages,
  quickReplies,
  catalog,
  highlightedMessageId,
  onBackMobile,
  onOpenInfo,
  onOpenSearch,
  onOpenTemplateModal,
  onOpenRichModal,
  onSendMessage,
  onSendAsClient,
  onSimulateInteractiveReply,
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
  const [openListMsgId, setOpenListMsgId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [copiedOtp, setCopiedOtp] = useState<string | null>(null);

  // Voice Note Recorder state
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bubbleTouchStartRef = useRef<{ x: number; y: number; msg: Message } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.id, messages.length, chat?.typingContactId]);

  useEffect(() => {
    setReplyingTo(null);
    setShowAttach(false);
    setShowEmoji(false);
    setShowCatalogPicker(false);
    setReceiptMenuMsgId(null);
    setOpenListMsgId(null);
    setComposerError(null);
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
            Select a conversation to inspect real-time delivery ticks, 24-hour customer service windows, templates, interactive cards, and opt-in compliance—or open the QA Console to run automated scenarios.
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

  const windowStatus =
    variant === 'business' && chat.type === 'direct'
      ? getWindowStatus(chat.lastInboundAt)
      : null;

  const isWindowLocked = Boolean(
    variant === 'business' &&
    chat.type === 'direct' &&
    enforce24hWindow &&
    windowStatus &&
    !windowStatus.open
  );

  const isBlocked = Boolean(directContact?.blocked);

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
    if (directContact.blocked) return 'Blocked contact';
    if (directContact.presence === 'online') return 'online';
    return `last seen ${formatTime(directContact.lastSeen)}`;
  })();

  const sendSafe = async (fn: () => Promise<void>) => {
    setComposerError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiRequestError && err.metaError) {
        setComposerError(`#${err.metaError.code} ${err.metaError.title}: ${err.metaError.message}`);
      } else {
        setComposerError(err instanceof Error ? err.message : 'Message send failed');
      }
    }
  };

  const isClientView = perspective === 'client';

  const handleSendText = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    setShowEmoji(false);
    await sendSafe(async () => {
      if (isClientView && onSendAsClient) {
        await onSendAsClient({
          chatId: chat.id,
          body: trimmed,
          type: 'text',
          replyToMessageId: replyingTo?.id,
        });
      } else {
        await onSendMessage({
          chatId: chat.id,
          body: trimmed,
          type: 'text',
          replyToMessageId: replyingTo?.id,
        });
      }
      setReplyingTo(null);
    });
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
      await sendSafe(async () => {
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
      });
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
    await sendSafe(async () => {
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
    });
  };

  const handleSendCatalogItem = async (item: CatalogItemRef) => {
    setShowCatalogPicker(false);
    setShowAttach(false);
    await sendSafe(async () => {
      await onSendMessage({
        chatId: chat.id,
        body: `${item.name} — ${item.currency} ${item.price}`,
        type: 'catalog_item',
        catalogItemId: item.id,
      });
    });
  };

  const handleBubbleTouchStart = (e: TouchEvent<HTMLDivElement>, msg: Message) => {
    const t = e.touches[0];
    if (!t) return;
    bubbleTouchStartRef.current = { x: t.clientX, y: t.clientY, msg };
  };

  const handleBubbleTouchEnd = (e: TouchEvent<HTMLDivElement>, msg: Message) => {
    const start = bubbleTouchStartRef.current;
    bubbleTouchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || start.msg.id !== msg.id) return;
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 64 && dy < 36) {
      setReplyingTo(msg);
      inputRef.current?.focus();
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore in headless browsers
    }
    setCopiedOtp(code);
    setTimeout(() => setCopiedOtp(null), 1600);
  };

  return (
    <main className="flex-1 min-w-0 h-full flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
      {/* Chat Header */}
      <header className="h-[58px] md:h-[60px] px-2.5 md:px-4 pt-safe backdrop-blur-xl bg-[#f0f2f5]/90 dark:bg-[#202c33]/90 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="Back to chat list"
            className="md:hidden min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onOpenInfo}
            aria-label={`View info for ${chat.name}`}
            className="flex items-center gap-2.5 md:gap-3 min-w-0 text-left rounded-lg py-1 pr-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {isClientView && chat.type !== 'group' ? (
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 shadow-xs ring-2 ring-amber-500/40 border border-amber-400/30 bg-slate-900 flex items-center justify-center">
                <img
                  src={self.avatarUrl || '/assets/vehicle-desk-emblem.svg'}
                  alt="Karnataka State Protocol Vehicle Desk"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <Avatar
                name={chat.name}
                avatarUrl={chat.avatarUrl}
                color={chat.avatarColor}
                size="md"
                isGroup={chat.type === 'group'}
                isBot={directContact?.isBot}
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[15px] md:text-[15.5px] font-semibold text-[#111b21] dark:text-[#e9edef] truncate leading-snug">
                <span>{isClientView && chat.type !== 'group' ? (self.name || 'Karnataka State Protocol Vehicle Desk') : chat.name}</span>
                {isClientView && chat.type !== 'group' && (
                  <span title="Verified Business Account" className="inline-flex text-[#00a884] shrink-0">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </span>
                )}
              </div>
              <div
                className={`text-[12px] md:text-[12.5px] truncate leading-snug ${typingContact
                  ? 'text-[#00a884] font-medium'
                  : directContact?.blocked
                    ? 'text-[#ea0038] font-medium'
                    : 'text-[#667781] dark:text-[#8696a0]'
                  }`}
              >
                {isClientView && chat.type !== 'group' ? (
                  <span>
                    <span className="text-[#00a884] font-medium">Verified Business Account</span>
                    <span className="mx-1 text-[#8696a0]">·</span>
                    <span className="text-[#667781] dark:text-[#aebac1]">Simulating {chat.name} ({directContact?.phone || ''})</span>
                  </span>
                ) : (
                  subtitle
                )}
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onTogglePerspective && (
            <button
              type="button"
              onClick={onTogglePerspective}
              className={`min-h-[32px] px-3 py-1 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 border transition-all ${isClientView
                ? 'bg-[#00a884]/15 border-[#00a884] text-[#008069] dark:text-[#25d366] hover:bg-[#00a884]/25 shadow-xs'
                : 'bg-black/5 dark:bg-white/10 border-[#d1d7db] dark:border-[#374248] text-[#54656f] dark:text-[#aebac1] hover:border-[#00a884]'
                }`}
              title={isClientView ? 'Currently viewing from Client perspective (Received). Click to switch to Business view.' : 'Currently viewing from Business perspective (Sent). Click to switch to Client view.'}
            >
              {isClientView ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#00a884] animate-pulse" />
                  <span>Client View (Received)</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                  <span>Business View (Sent)</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search messages in chat"
            title="Search in chat"
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-9 md:h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="Contact info"
            title="Contact / Group info"
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-9 md:h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Client Encryption & Business Badge OR Business Compliance Context Bar */}
      {isClientView ? (
        <div className="px-3 sm:px-3.5 py-1 text-[11.5px] flex items-center justify-center gap-1.5 bg-[#f7f8fa] dark:bg-[#182229] border-b border-[#e9edef] dark:border-[#222d34] text-[#54656f] dark:text-[#8696a0] shrink-0">
          <Lock className="w-3 h-3 text-[#00a884] shrink-0" />
          <span>Messages are end-to-end encrypted · Official Business Account of {self.name || 'Karnataka State Protocol Vehicle Desk'}</span>
        </div>
      ) : variant === 'business' && chat.type === 'direct' ? (
        <div
          data-testid="window-status-bar"
          className={`px-3 sm:px-3.5 py-1.5 text-[11.5px] sm:text-[12px] flex items-center justify-between gap-2 border-b shrink-0 ${isBlocked
            ? 'bg-[#ea0038]/10 border-[#ea0038]/25 text-[#b91c1c] dark:text-[#fca5a5]'
            : isWindowLocked
              ? 'bg-[#fef3c7] dark:bg-[#3b2f13] border-[#f59e0b]/30 text-[#92400e] dark:text-[#fcd34d]'
              : 'bg-[#f7f8fa] dark:bg-[#182229] border-[#e9edef] dark:border-[#222d34] text-[#54656f] dark:text-[#aebac1]'
            }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {isBlocked ? (
              <>
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate font-medium">
                  Blocked (#131026)
                </span>
              </>
            ) : isWindowLocked ? (
              <>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate font-medium">
                  <span className="sm:hidden">24h closed · Template only</span>
                  <span className="hidden sm:inline">
                    24h customer service window closed — approved template required (#131047)
                  </span>
                </span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
                <span className="truncate">
                  <span className="hidden sm:inline">24h window: </span>
                  <strong className="font-mono">{windowStatus?.label}</strong> ·{' '}
                  <strong className="font-mono">{chat.conversationCategory}</strong>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {directContact?.optInStatus === 'opted_out' && (
              <span className="text-[#ea0038] font-semibold">Opted out</span>
            )}
            {!isBlocked && (
              <button
                type="button"
                onClick={onOpenTemplateModal}
                className="text-[#008069] dark:text-[#25d366] font-semibold hover:underline whitespace-nowrap"
              >
                <span className="sm:hidden">Template</span>
                <span className="hidden sm:inline">Send template</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Message Thread */}
      <div
        className="flex-1 overflow-y-auto wa-chat-wallpaper wa-scroll px-3 sm:px-8 lg:px-14 py-4 space-y-1.5"
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
            const isBubbleOutbound = isClientView
              ? msg.direction === 'inbound'
              : msg.direction === 'outbound';
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

            const isFixedCardWidth =
              msg.type === 'image' ||
              msg.type === 'video' ||
              msg.type === 'catalog_item' ||
              msg.type === 'template' ||
              msg.type === 'interactive' ||
              msg.type === 'location' ||
              msg.type === 'order';

            const isTemplateWithImage =
              msg.type === 'template' &&
              Boolean(msg.template?.headerImageUrl || msg.media?.url);

            const isSticker = msg.type === 'sticker';

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
                  onTouchStart={(e) => handleBubbleTouchStart(e, msg)}
                  onTouchEnd={(e) => handleBubbleTouchEnd(e, msg)}
                  className={`flex ${isBubbleOutbound ? 'justify-end' : 'justify-start'} ${sameSenderAsPrev ? 'mt-0.5' : 'mt-2'
                    }`}
                >
                  <div
                    className={`relative group ${isSticker
                      ? 'max-w-[190px]'
                      : msg.type === 'product_carousel'
                        ? 'w-full max-w-[340px] sm:max-w-[440px]'
                        : isTemplateWithImage
                          ? 'w-[320px] sm:w-[380px] max-w-[92%]'
                          : isFixedCardWidth
                            ? 'w-[285px] sm:w-[324px] max-w-[88%]'
                            : 'max-w-[85%] sm:max-w-[68%]'
                      } rounded-lg px-2.5 pt-1.5 pb-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-all ${isBubbleOutbound
                        ? `bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] ${!sameSenderAsPrev ? 'rounded-tr-none' : ''}`
                        : `bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] ${!sameSenderAsPrev ? 'rounded-tl-none' : ''}`
                      } ${isHighlighted ? 'ring-2 ring-[#00a884]' : ''}`}
                    data-testid={`message-bubble-${msg.direction}`}
                  >
                    {/* Authentic WhatsApp Bubble Corner Tail */}
                    {!sameSenderAsPrev && isBubbleOutbound && (
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
                    {!sameSenderAsPrev && !isBubbleOutbound && (
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
                      className={`hidden sm:flex absolute top-1 ${isBubbleOutbound ? '-left-16' : '-right-9'
                        } items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity`}
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

                      {isBubbleOutbound && (
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
                            <div className="absolute right-0 top-8 z-30 w-40 py-1 rounded-lg bg-white dark:bg-[#233138] shadow-lg border border-[#e9edef] dark:border-[#374248] text-[12px]">
                              {(['queued', 'sent', 'delivered', 'read'] as MessageStatus[]).map(
                                (st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => {
                                      setReceiptMenuMsgId(null);
                                      void onUpdateReceipt(msg.id, st);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left capitalize hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center justify-between ${msg.status === st ? 'font-semibold text-[#00a884]' : ''
                                      }`}
                                  >
                                    <span>{st}</span>
                                    <MessageTicks status={st} />
                                  </button>
                                )
                              )}
                              <div className="my-1 border-t border-[#e9edef] dark:border-[#2a3942]" />
                              {[
                                { code: 131026, label: 'Fail 131026' },
                                { code: 131047, label: 'Fail 131047' },
                                { code: 131049, label: 'Fail 131049' },
                              ].map((fe) => (
                                <button
                                  key={fe.code}
                                  type="button"
                                  onClick={() => {
                                    setReceiptMenuMsgId(null);
                                    void onUpdateReceipt(msg.id, 'failed', fe.code);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-[#ea0038] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center justify-between font-mono text-[11px]"
                                >
                                  <span>{fe.label}</span>
                                  <MessageTicks status="failed" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Group sender name OR In Client View: show official Vehicle Desk badge on received business messages */}
                    {isClientView && !isBubbleOutbound && !sameSenderAsPrev && (
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#008069] dark:text-[#25d366] mb-1">
                        <span>{self.name || 'Karnataka State Protocol Vehicle Desk'}</span>
                        <span title="Verified Business Account" className="inline-flex text-[#00a884]">
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        </span>
                      </div>
                    )}

                    {chat.type === 'group' && !isBubbleOutbound && !sameSenderAsPrev && (
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
                        className="group relative block w-full mb-1.5 rounded-md overflow-hidden bg-slate-950/70 cursor-pointer text-left focus:outline-none"
                      >
                        <img
                          src={msg.media.url}
                          alt={msg.media.caption || msg.media.filename || 'Attachment'}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-[460px] object-contain hover:opacity-95 transition-opacity mx-auto"
                        />
                        <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-black/75 text-white text-[11px] font-medium backdrop-blur-xs flex items-center gap-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 pointer-events-none">
                          <ZoomIn className="w-3.5 h-3.5 text-white" />
                          <span>Tap to view</span>
                        </div>
                      </button>
                    )}

                    {/* Media: Video */}
                    {msg.type === 'video' && (
                      <div className="mb-1.5 rounded-md overflow-hidden bg-[#111b21] text-white p-4 flex flex-col items-center justify-center gap-2 min-h-[150px]">
                        <Film className="w-8 h-8 text-[#25d366]" />
                        <div className="text-[12.5px] font-medium text-center truncate max-w-full">
                          {msg.media?.filename || 'video-clip.mp4'}
                        </div>
                        <div className="text-[11px] font-mono text-white/70">
                          VIDEO · {formatDuration(msg.media?.durationSec || 14)}
                          {msg.media?.mediaId ? ` · ${msg.media.mediaId.slice(0, 14)}` : ''}
                        </div>
                      </div>
                    )}

                    {/* Media: Sticker */}
                    {msg.type === 'sticker' && (
                      <div className="py-2 px-3 flex flex-col items-center justify-center">
                        <div className="text-5xl leading-none select-none" aria-label="Sticker">
                          {msg.body || '🎉'}
                        </div>
                      </div>
                    )}

                    {/* Media: Document */}
                    {msg.type === 'document' && msg.media && (
                      <div className="mb-1 rounded-md bg-black/5 dark:bg-black/20 p-2.5 flex items-center gap-3 min-w-[220px]">
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

                    {/* Media: Voice / Audio Note */}
                    {(msg.type === 'voice' || msg.type === 'audio') && (
                      <VoiceNoteBubble
                        media={msg.media}
                        senderName={isBubbleOutbound ? self.name : (isClientView ? (self.name || 'Vehicle Desk') : msg.senderName)}
                        senderAvatarUrl={isBubbleOutbound ? self.avatarUrl : senderContact?.avatarUrl}
                        senderColor={senderContact?.avatarColor || '#00a884'}
                        isOutbound={isBubbleOutbound}
                      />
                    )}

                    {/* Location Card */}
                    {msg.type === 'location' && msg.location && (
                      <div className="mb-1.5 rounded-md overflow-hidden bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/10">
                        <div className="h-24 bg-[#e2ece9] dark:bg-[#16292d] flex flex-col items-center justify-center gap-1 text-[#008069] dark:text-[#25d366]">
                          <MapPin className="w-6 h-6" />
                          <span className="text-[11px] font-mono tabular-nums">
                            {msg.location.latitude.toFixed(4)}, {msg.location.longitude.toFixed(4)}
                          </span>
                        </div>
                        <div className="p-2.5">
                          <div className="text-[13.5px] font-semibold">
                            {msg.location.name || 'Shared Location'}
                          </div>
                          {msg.location.address && (
                            <div className="text-[12px] text-[#54656f] dark:text-[#aebac1] mt-0.5">
                              {msg.location.address}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Shared Contact Cards */}
                    {msg.type === 'contacts' && msg.contacts && msg.contacts.length > 0 && (
                      <div className="mb-1.5 space-y-1.5 min-w-[220px]">
                        {msg.contacts.map((c, ci) => (
                          <div
                            key={`${c.phone}-${ci}`}
                            className="rounded-md bg-black/5 dark:bg-black/20 p-2.5 flex items-center gap-2.5"
                          >
                            <div className="w-9 h-9 rounded-full bg-[#00a884]/20 text-[#008069] dark:text-[#25d366] flex items-center justify-center shrink-0">
                              <UserRound className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-semibold truncate">{c.name}</div>
                              <div className="text-[12px] font-mono text-[#54656f] dark:text-[#aebac1] truncate">
                                {c.phone}
                              </div>
                              {c.org && (
                                <div className="text-[11px] text-[#667781] dark:text-[#8696a0] truncate">
                                  {c.org}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Template Message Card */}
                    {msg.type === 'template' && msg.template && (
                      <div className="mb-1 space-y-1.5 -mx-1 -mt-1">
                        {/* 1. Top Header Banner Image */}
                        {Boolean(msg.template.headerImageUrl || msg.media?.url) && (() => {
                          const bannerUrl = (msg.template.headerImageUrl || msg.media?.url) as string;
                          const captionText = msg.template.headerText || msg.template.templateName || 'Template Banner';
                          return (
                            <button
                              type="button"
                              onClick={() => onPreviewImage(bannerUrl, captionText)}
                              aria-label="View full size attached image"
                              className="group relative block w-full rounded-t-xl overflow-hidden bg-slate-950/70 mb-2 shadow-xs cursor-pointer text-left focus:outline-none"
                            >
                              <img
                                src={bannerUrl}
                                alt={captionText}
                                className="w-full max-h-[480px] object-contain mx-auto transition-transform duration-200 group-hover:scale-[1.01]"
                              />
                              <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-black/80 text-white text-[11px] font-medium backdrop-blur-xs flex items-center gap-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 pointer-events-none">
                                <ZoomIn className="w-3.5 h-3.5 text-white" />
                                <span>Tap to view full image</span>
                              </div>
                            </button>
                          );
                        })()}

                        <div className="px-1 space-y-1.5">
                          {msg.template.headerText && (
                            <div className="text-[15px] font-bold leading-snug text-slate-900 dark:text-white">
                              {msg.template.headerText}
                            </div>
                          )}
                          <p className="text-[14px] leading-[1.42] whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100">
                            {msg.template.renderedBody}
                          </p>
                          {msg.template.footerText &&
                            !msg.template.footerText.includes('INZ000123456') &&
                            !msg.template.footerText.includes('ARN-98765') && (
                              <p className="text-[11.5px] text-[#667781] dark:text-[#aebac1] border-t border-black/10 dark:border-white/10 pt-1">
                                {msg.template.footerText}
                              </p>
                            )}
                        </div>

                        {Boolean(msg.template.buttons && msg.template.buttons.length > 0) && (
                          <div className="pt-1.5 mt-1.5 border-t border-black/10 dark:border-white/15 divide-y divide-black/10 dark:divide-white/15">
                            {msg.template.buttons?.map((btn, bi) => {
                              const codeVal = msg.template?.otpCode || btn.exampleCode || '482910';
                              return (
                                <button
                                  key={`${btn.text}-${bi}`}
                                  type="button"
                                  onClick={() => {
                                    if (btn.type === 'OTP' || btn.type === 'COPY_CODE') {
                                      void copyCode(codeVal);
                                    } else if (btn.type === 'QUICK_REPLY') {
                                      void onSimulateInteractiveReply({
                                        chatId: chat.id,
                                        selectedId: `tpl_qr_${bi}`,
                                        selectedTitle: btn.text,
                                        kind: 'button_reply',
                                      });
                                    }
                                  }}
                                  className="w-full py-2 text-center text-[13px] font-semibold text-[#027eb5] dark:text-[#53bdeb] hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5"
                                >
                                  {btn.type === 'URL' && <ExternalLink className="w-3.5 h-3.5" />}
                                  {btn.type === 'PHONE_NUMBER' && <Phone className="w-3.5 h-3.5" />}
                                  {(btn.type === 'OTP' || btn.type === 'COPY_CODE') && (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  {btn.type === 'QUICK_REPLY' && <Reply className="w-3.5 h-3.5" />}
                                  <span>
                                    {(btn.type === 'OTP' || btn.type === 'COPY_CODE') &&
                                      copiedOtp === codeVal
                                      ? `Copied ${codeVal}`
                                      : btn.text}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interactive Message Card */}
                    {msg.type === 'interactive' && msg.interactive && (
                      <div className="mb-1 space-y-1.5">
                        {msg.interactive.kind === 'button_reply' ||
                          msg.interactive.kind === 'list_reply' ? (
                          <div>
                            <div className="text-[11px] font-mono text-[#008069] dark:text-[#25d366] mb-0.5">
                              {msg.interactive.kind === 'button_reply'
                                ? 'Interactive button reply'
                                : 'Interactive list selection'}{' '}
                              ({msg.interactive.selectedId})
                            </div>
                            <p className="text-[14px] font-medium">
                              {msg.interactive.selectedTitle || msg.body}
                            </p>
                          </div>
                        ) : (
                          <>
                            {msg.interactive.headerText && (
                              <div className="text-[14px] font-bold">
                                {msg.interactive.headerText}
                              </div>
                            )}
                            <p className="text-[14px] leading-[1.42] whitespace-pre-wrap">
                              {msg.interactive.bodyText}
                            </p>
                            {msg.interactive.footerText && (
                              <p className="text-[12px] text-[#667781] dark:text-[#aebac1]">
                                {msg.interactive.footerText}
                              </p>
                            )}

                            {/* Reply Buttons */}
                            {msg.interactive.kind === 'button' && msg.interactive.buttons && (
                              <div className="pt-1.5 mt-1.5 border-t border-black/10 dark:border-white/15 divide-y divide-black/10 dark:divide-white/15">
                                {msg.interactive.buttons.map((b) => (
                                  <button
                                    key={b.id}
                                    type="button"
                                    onClick={() =>
                                      void onSimulateInteractiveReply({
                                        chatId: chat.id,
                                        selectedId: b.id,
                                        selectedTitle: b.title,
                                        kind: 'button_reply',
                                      })
                                    }
                                    title="Click to simulate customer tapping this reply button"
                                    className="w-full py-2 text-center text-[13px] font-semibold text-[#027eb5] dark:text-[#53bdeb] hover:bg-black/5 dark:hover:bg-white/5"
                                  >
                                    {b.title}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* CTA URL Button */}
                            {msg.interactive.kind === 'cta_url' && (
                              <div className="pt-1.5 mt-1.5 border-t border-black/10 dark:border-white/15">
                                <a
                                  href={msg.interactive.ctaUrl || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full py-2 text-center text-[13px] font-semibold text-[#027eb5] dark:text-[#53bdeb] hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>{msg.interactive.ctaDisplayText || 'Open link'}</span>
                                </a>
                              </div>
                            )}

                            {/* List Message Menu */}
                            {msg.interactive.kind === 'list' && msg.interactive.sections && (
                              <div className="pt-1.5 mt-1.5 border-t border-black/10 dark:border-white/15">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenListMsgId(openListMsgId === msg.id ? null : msg.id)
                                  }
                                  className="w-full py-2 text-center text-[13px] font-semibold text-[#027eb5] dark:text-[#53bdeb] hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5"
                                >
                                  <LayoutList className="w-4 h-4" />
                                  <span>{msg.interactive.listButtonText || 'Choose an option'}</span>
                                </button>
                                {openListMsgId === msg.id && (
                                  <div className="mt-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#2a3942] divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
                                    {msg.interactive.sections.map((sec) => (
                                      <div key={sec.title} className="p-2 space-y-1">
                                        <div className="text-[11px] font-semibold text-[#008069] dark:text-[#25d366]">
                                          {sec.title}
                                        </div>
                                        {sec.rows.map((row) => (
                                          <button
                                            key={row.id}
                                            type="button"
                                            onClick={() => {
                                              setOpenListMsgId(null);
                                              void onSimulateInteractiveReply({
                                                chatId: chat.id,
                                                selectedId: row.id,
                                                selectedTitle: row.title,
                                                kind: 'list_reply',
                                              });
                                            }}
                                            className="w-full px-2 py-1.5 rounded text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                                          >
                                            <div className="text-[13px] font-medium text-[#111b21] dark:text-[#e9edef]">
                                              {row.title}
                                            </div>
                                            {row.description && (
                                              <div className="text-[11.5px] text-[#667781] dark:text-[#8696a0]">
                                                {row.description}
                                              </div>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
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

                    {/* Product Carousel */}
                    {msg.type === 'product_carousel' && msg.carouselItems && msg.carouselItems.length > 0 && (
                      <div className="mb-1.5 space-y-1.5">
                        <div className="text-[11px] font-mono text-[#008069] dark:text-[#25d366]">
                          PRODUCT CAROUSEL · {msg.carouselItems.length} ITEMS
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                          {msg.carouselItems.map((item) => (
                            <div
                              key={item.id}
                              className="w-[180px] shrink-0 snap-start rounded-md overflow-hidden bg-white dark:bg-[#111b21] border border-black/10 dark:border-white/10"
                            >
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-24 object-cover"
                                />
                              ) : (
                                <div className="w-full h-24 bg-[#e7fce3] dark:bg-[#0a332c] flex items-center justify-center text-[#00a884]">
                                  <ShoppingBag className="w-6 h-6" />
                                </div>
                              )}
                              <div className="p-2">
                                <div className="text-[12.5px] font-semibold truncate">{item.name}</div>
                                <div className="text-[11.5px] font-mono font-bold text-[#008069] dark:text-[#25d366] mt-0.5">
                                  {item.currency} {item.price}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Order Message Card */}
                    {msg.type === 'order' && msg.order && (
                      <div className="mb-1.5 rounded-md bg-black/5 dark:bg-black/20 p-2.5 space-y-2 border border-black/5 dark:border-white/10">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#008069] dark:text-[#25d366]">
                            <Receipt className="w-4 h-4" /> Order {msg.order.orderId}
                          </span>
                          <span className="text-[12px] font-mono font-bold">
                            {msg.order.currency} {msg.order.totalAmount}
                          </span>
                        </div>
                        <div className="divide-y divide-black/5 dark:divide-white/10 text-[12.5px]">
                          {msg.order.items.map((line) => (
                            <div key={line.sku} className="py-1 flex items-center justify-between gap-2">
                              <span className="truncate">
                                {line.quantity}× {line.name}
                              </span>
                              <span className="font-mono text-[11.5px] shrink-0">
                                {line.currency} {line.unitPrice}
                              </span>
                            </div>
                          ))}
                        </div>
                        {msg.order.note && (
                          <div className="text-[11.5px] text-[#54656f] dark:text-[#aebac1]">
                            Note: {msg.order.note}
                          </div>
                        )}
                      </div>
                    )}

                    {/* URL Link Preview Card */}
                    {msg.linkPreview && (
                      <a
                        href={msg.linkPreview.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-1.5 block rounded-md bg-black/5 dark:bg-black/20 p-2.5 border-l-[3px] border-[#00a884] hover:bg-black/10 transition-colors"
                      >
                        <div className="flex items-center gap-1 text-[11px] font-mono text-[#008069] dark:text-[#25d366]">
                          <Link2 className="w-3 h-3" />
                          <span className="truncate">{msg.linkPreview.domain}</span>
                        </div>
                        <div className="text-[13px] font-semibold mt-0.5 truncate">
                          {msg.linkPreview.title}
                        </div>
                        <div className="text-[11.5px] text-[#54656f] dark:text-[#aebac1] line-clamp-2">
                          {msg.linkPreview.description}
                        </div>
                      </a>
                    )}

                    {/* Text / Caption Body + Inline Timestamp & Ticks */}
                    <div className="flex flex-wrap items-end justify-end gap-x-2">
                      {msg.type !== 'voice' &&
                        msg.type !== 'audio' &&
                        msg.type !== 'document' &&
                        msg.type !== 'catalog_item' &&
                        msg.type !== 'template' &&
                        msg.type !== 'interactive' &&
                        msg.type !== 'location' &&
                        msg.type !== 'contacts' &&
                        msg.type !== 'sticker' &&
                        msg.type !== 'order' && (
                          <p className="text-[14.2px] leading-[1.42] whitespace-pre-wrap break-words flex-1 min-w-0">
                            {msg.body}
                          </p>
                        )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0] ml-auto pt-0.5 select-none">
                        <span>{formatTime(msg.timestamp)}</span>
                        {isBubbleOutbound && <MessageTicks status={msg.status} />}
                      </span>
                    </div>

                    {/* Failed Delivery Meta Error Banner */}
                    {msg.status === 'failed' && msg.error && (
                      <div className="mt-1.5 pt-1.5 border-t border-[#ea0038]/30 flex items-start gap-1.5 text-[11.5px] text-[#b91c1c] dark:text-[#fca5a5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-mono font-bold">#{msg.error.code}</span>{' '}
                          <span className="font-semibold">{msg.error.title}:</span>{' '}
                          <span>{msg.error.message}</span>
                        </div>
                      </div>
                    )}
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
      <footer className="relative bg-[#f0f2f5] dark:bg-[#202c33] border-t border-[#d1d7db] dark:border-[#2a3942] pb-safe shrink-0">
        {/* Inline API / Compliance Error Feedback */}
        {composerError && (
          <div
            role="alert"
            className="px-4 py-2 bg-[#ea0038]/12 border-b border-[#ea0038]/30 flex items-center justify-between gap-2 text-[12.5px] text-[#b91c1c] dark:text-[#fca5a5]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{composerError}</span>
            </div>
            <button
              type="button"
              onClick={() => setComposerError(null)}
              aria-label="Dismiss error"
              className="p-1 hover:bg-black/5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/10 dark:hover:bg-white/10"
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
          <div className="absolute bottom-full left-3 sm:left-12 mb-2 w-60 py-1.5 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#d1d7db] dark:border-[#374248] z-30 text-[14px] text-[#3b4a54] dark:text-[#e9edef]">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
            >
              <ImageIcon className="w-4 h-4 text-[#007bfc]" /> Photos &amp; Images
            </button>
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
            >
              <FileText className="w-4 h-4 text-[#7f66ff]" /> Document
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttach(false);
                void sendSafe(() =>
                  onSendMessage({
                    chatId: chat.id,
                    type: 'sticker',
                    body: '🚀',
                  })
                );
              }}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
            >
              <Sticker className="w-4 h-4 text-[#f59e0b]" /> Send Sticker
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttach(false);
                onOpenRichModal();
              }}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
            >
              <LayoutList className="w-4 h-4 text-[#00a884]" /> Interactive / Location / Order
            </button>
            {variant === 'business' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowAttach(false);
                    onOpenTemplateModal();
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
                >
                  <Sparkles className="w-4 h-4 text-[#00a884]" /> Template Message
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAttach(false);
                    setShowCatalogPicker(true);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3"
                >
                  <ShoppingBag className="w-4 h-4 text-[#00a884]" /> Catalog Item / Carousel
                </button>
              </>
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
              {catalog.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCatalogPicker(false);
                    void sendSafe(() =>
                      onSendMessage({
                        chatId: chat.id,
                        type: 'product_carousel',
                        body: `Featured Catalog (${catalog.length} products)`,
                        carouselItemIds: catalog.map((c) => c.id),
                      })
                    );
                  }}
                  className="w-full px-3.5 py-2.5 text-left bg-[#e7fce3]/40 dark:bg-[#0a332c]/50 hover:bg-[#e7fce3] dark:hover:bg-[#0a332c] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#008069] dark:text-[#25d366]">
                      Send Full Product Carousel ({catalog.length})
                    </div>
                    <div className="text-[11.5px] text-[#667781] dark:text-[#8696a0]">
                      Multi-card swipeable catalog showcase
                    </div>
                  </div>
                  <SendHorizontal className="w-4 h-4 text-[#00a884] shrink-0" />
                </button>
              )}
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

        {/* Blocked Contact OR 24h Window Closed Lock Bar OR Voice Recorder OR Standard Input Bar */}
        {isBlocked ? (
          <div
            data-testid="composer-blocked-bar"
            className="min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-[13.5px] text-[#667781] dark:text-[#aebac1]"
          >
            <span>You blocked this contact. Unblock in Contact Info to resume messaging.</span>
            <button
              type="button"
              onClick={onOpenInfo}
              className="px-3.5 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold shrink-0"
            >
              Contact info
            </button>
          </div>
        ) : !isClientView && isWindowLocked ? (
          <div
            data-testid="composer-window-locked"
            className="min-h-[60px] px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
          >
            <div className="text-[13px] text-[#54656f] dark:text-[#aebac1] min-w-0">
              <strong className="text-[#111b21] dark:text-[#e9edef]">Free-form messaging locked.</strong>{' '}
              More than 24h since customer&apos;s last inbound message. Send an approved template to re-engage.
            </div>
            <button
              type="button"
              onClick={onOpenTemplateModal}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Sparkles className="w-4 h-4" /> Send Template
            </button>
          </div>
        ) : recording ? (
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
              className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[#ea0038] hover:bg-[#ea0038]/10 transition-colors"
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
              className="min-w-[44px] min-h-[44px] rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] transition-colors shadow-xs"
            >
              <SendHorizontal className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="min-h-[60px] px-2 sm:px-3 py-2 flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEmoji((v) => !v);
                setShowAttach(false);
              }}
              aria-label="Insert emoji"
              className="min-w-[42px] min-h-[42px] sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
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
              className="min-w-[42px] min-h-[42px] sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
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
                isClientView
                  ? `Reply as ${chat.name}... (type START, STOP, or chat)`
                  : variant === 'business'
                    ? 'Message or /quick-reply'
                    : 'Type a message'
              }
              className="flex-1 min-w-0 h-[42px] px-3.5 sm:px-4 rounded-lg bg-white dark:bg-[#2a3942] text-[14.5px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#00a884]/35"
            />

            {draft.trim() ? (
              <button
                type="button"
                onClick={() => void handleSendText()}
                aria-label="Send message"
                className="min-w-[44px] min-h-[44px] sm:w-10 sm:h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] transition-colors shrink-0"
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
                className="min-w-[44px] min-h-[44px] sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
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
