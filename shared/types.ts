export type EmulatorVariant = 'personal' | 'business';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageDirection = 'outbound' | 'inbound';

export type MessageType = 'text' | 'image' | 'document' | 'voice' | 'catalog_item' | 'system';

export type PresenceState = 'online' | 'offline' | 'typing' | 'recording';

export interface MediaAttachment {
  id: string;
  url: string;
  mimeType: string;
  filename?: string;
  sizeBytes?: number;
  caption?: string;
  durationSec?: number;
  waveform?: number[];
}

export interface CatalogItemRef {
  id: string;
  name: string;
  price: string;
  currency: string;
  description: string;
  sku: string;
  imageUrl?: string;
  inStock: boolean;
}

export interface QuotedMessageRef {
  messageId: string;
  senderName: string;
  body: string;
  type: MessageType;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  direction: MessageDirection;
  type: MessageType;
  body: string;
  timestamp: string; // ISO-8601
  status: MessageStatus;
  media?: MediaAttachment;
  catalogItem?: CatalogItemRef;
  replyTo?: QuotedMessageRef;
  metadata?: Record<string, unknown>;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  avatarColor: string;
  about: string;
  isBot?: boolean;
  isBusiness?: boolean;
  presence: PresenceState;
  lastSeen: string; // ISO-8601
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatarUrl?: string;
  avatarColor: string;
  description?: string;
  contactId?: string; // for direct chats
  participantIds: string[]; // contact IDs (excluding 'me')
  unreadCount: number;
  archived: boolean;
  pinned: boolean;
  muted: boolean;
  labelIds: string[];
  typingContactId?: string | null;
  typingMode?: 'typing' | 'recording' | null;
  lastMessageId?: string | null;
  lastMessageAt: string;
}

export interface BusinessProfile {
  name: string;
  category: string;
  description: string;
  address: string;
  hours: string;
  email: string;
  website: string;
  verified: boolean;
  avatarUrl?: string;
}

export interface QuickReply {
  id: string;
  shortcut: string; // without leading slash, e.g. "thanks"
  message: string;
  keywords: string[];
}

export interface BusinessLabel {
  id: string;
  name: string;
  color: string; // hex
}

export interface BusinessAutomation {
  greetingEnabled: boolean;
  greetingMessage: string;
  awayEnabled: boolean;
  awayMessage: string;
  awaySchedule: 'always' | 'outside_hours' | 'custom';
}

export interface AutoReplyRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: 'contains' | 'regex' | 'exact';
  pattern: string;
  reply: string;
  contactId?: string; // optional: restrict to specific contact
  delayMs: number;
  simulateTypingMs: number;
}

export interface WebhookLogEntry {
  id: string;
  event: string;
  targetUrl: string;
  timestamp: string;
  statusCode: number | null;
  ok: boolean;
  durationMs: number;
  error?: string;
  payload: Record<string, unknown>;
}

export interface SelfAccount {
  id: 'me';
  name: string;
  phone: string;
  about: string;
  avatarUrl?: string;
}

export interface EmulatorSettings {
  variant: EmulatorVariant;
  webhookUrl: string;
  webhookSecret: string;
  apiKeyConfigured: boolean;
  lifecycleDeliveredMs: number;
  lifecycleReadMs: number;
  autoMarkReadOnAutoReply: boolean;
  businessProfile: BusinessProfile;
  businessAutomation: BusinessAutomation;
}

export interface EmulatorState {
  self: SelfAccount;
  settings: EmulatorSettings;
  contacts: Contact[];
  chats: Chat[];
  messages: Record<string, Message[]>; // keyed by chatId
  catalog: CatalogItemRef[];
  quickReplies: QuickReply[];
  labels: BusinessLabel[];
  autoReplyRules: AutoReplyRule[];
  webhookLogs: WebhookLogEntry[];
}

// WebSocket events (Server -> Client)
export type ServerWsEvent =
  | { type: 'state:sync'; payload: EmulatorState }
  | { type: 'message:created'; payload: { chatId: string; message: Message; chat: Chat } }
  | { type: 'message:updated'; payload: { chatId: string; message: Message } }
  | { type: 'chat:updated'; payload: Chat }
  | { type: 'chat:deleted'; payload: { chatId: string } }
  | { type: 'contact:updated'; payload: Contact }
  | { type: 'contact:deleted'; payload: { contactId: string } }
  | { type: 'typing:updated'; payload: { chatId: string; contactId: string | null; mode: 'typing' | 'recording' | null } }
  | { type: 'config:updated'; payload: { settings: EmulatorSettings; self: SelfAccount } }
  | { type: 'business:updated'; payload: { catalog: CatalogItemRef[]; quickReplies: QuickReply[]; labels: BusinessLabel[]; autoReplyRules: AutoReplyRule[] } }
  | { type: 'webhook:logged'; payload: WebhookLogEntry };
