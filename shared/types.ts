export type EmulatorVariant = 'personal' | 'business';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageDirection = 'outbound' | 'inbound';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'template'
  | 'catalog_item'
  | 'product_carousel'
  | 'order'
  | 'system';

export type PresenceState = 'online' | 'offline' | 'typing' | 'recording';

export type ConversationCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE';

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
export type TemplateApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type OptInStatus = 'opted_in' | 'opted_out' | 'unknown';

export interface OptInHistoryEntry {
  id: string;
  status: OptInStatus;
  timestamp: string;
  source: string; // e.g. 'inbound_keyword', 'api', 'ui', 'web_form', 'seed'
  keyword?: string;
  note?: string;
}

export interface MediaAttachment {
  id: string;
  mediaId?: string;
  url: string;
  mimeType: string;
  filename?: string;
  sizeBytes?: number;
  caption?: string;
  durationSec?: number;
  waveform?: number[];
}

export interface MediaRecord {
  id: string;
  url: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface LinkPreview {
  url: string;
  domain: string;
  title: string;
  description: string;
}

export interface LocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactCardPayload {
  name: string;
  phone: string;
  org?: string;
  email?: string;
}

export interface InteractiveReplyButton {
  id: string;
  title: string;
}

export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: InteractiveListRow[];
}

export interface InteractivePayload {
  kind: 'button' | 'list' | 'cta_url' | 'button_reply' | 'list_reply';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: InteractiveReplyButton[];
  listButtonText?: string;
  sections?: InteractiveListSection[];
  ctaDisplayText?: string;
  ctaUrl?: string;
  // For inbound interactive replies
  selectedId?: string;
  selectedTitle?: string;
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OTP';
  text: string;
  url?: string;
  phoneNumber?: string;
  exampleCode?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateApprovalStatus;
  headerText?: string;
  headerImageUrl?: string;
  bodyText: string; // Supports {{1}}, {{2}}, etc.
  footerText?: string;
  buttons: TemplateButton[];
  sampleValues: string[];
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

export interface TemplateMessagePayload {
  templateId: string;
  templateName: string;
  language: string;
  category: TemplateCategory;
  headerText?: string;
  headerImageUrl?: string;
  renderedBody: string;
  footerText?: string;
  buttons: TemplateButton[];
  variables: string[];
  otpCode?: string;
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

export interface OrderItemLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  currency: string;
}

export interface OrderPayload {
  orderId: string;
  items: OrderItemLine[];
  totalAmount: string;
  currency: string;
  note?: string;
}

export interface MessageError {
  code: number;
  title: string;
  message: string;
  errorData?: { details: string };
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
  phoneNumberId?: string;
  senderId: string;
  senderName: string;
  direction: MessageDirection;
  type: MessageType;
  body: string;
  timestamp: string; // ISO-8601
  status: MessageStatus;
  error?: MessageError;
  media?: MediaAttachment;
  location?: LocationPayload;
  contacts?: ContactCardPayload[];
  interactive?: InteractivePayload;
  template?: TemplateMessagePayload;
  catalogItem?: CatalogItemRef;
  carouselItems?: CatalogItemRef[];
  order?: OrderPayload;
  linkPreview?: LinkPreview;
  replyTo?: QuotedMessageRef;
  conversationCategory?: ConversationCategory;
  metadata?: Record<string, unknown>;
}

export interface Contact {
  id: string;
  name: string;
  profileName?: string;
  phone: string; // E.164 format
  avatarUrl?: string;
  avatarColor: string;
  about: string;
  isBot?: boolean;
  isBusiness?: boolean;
  blocked?: boolean;
  optInStatus: OptInStatus;
  optInUpdatedAt: string;
  optInSource: string;
  optInHistory: OptInHistoryEntry[];
  presence: PresenceState;
  lastSeen: string; // ISO-8601
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  phoneNumberId: string;
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
  lastInboundAt?: string | null;
  conversationCategory: ConversationCategory;
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

export interface PhoneNumberConfig {
  id: string; // Cloud API phone_number_id
  wabaId: string;
  phoneNumber: string;
  displayName: string;
  verifiedName: string;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED';
  webhookUrl: string; // Optional per-number override; falls back to global settings.webhookUrl
  businessProfile: BusinessProfile;
}

export interface ConversationBillingRecord {
  id: string;
  chatId: string;
  phoneNumberId: string;
  category: ConversationCategory;
  billable: boolean;
  estimatedCostUsd: number;
  startedAt: string;
  expiresAt: string;
  messageId: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
  keywords: string[];
}

export interface BusinessLabel {
  id: string;
  name: string;
  color: string;
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
  contactId?: string;
  delayMs: number;
  simulateTypingMs: number;
  respectOptOut?: boolean;
}

export interface WebhookLogEntry {
  id: string;
  event: string;
  phoneNumberId?: string;
  targetUrl: string;
  timestamp: string;
  statusCode: number | null;
  ok: boolean;
  durationMs: number;
  signatureHeader?: string;
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

export interface StatusUpdateItem {
  id: string;
  contactId: string;
  contactName: string;
  avatarUrl?: string;
  avatarColor: string;
  caption: string;
  mediaUrl?: string;
  timestamp: string;
  viewed: boolean;
}

export interface CallLogItem {
  id: string;
  contactId: string;
  contactName: string;
  avatarUrl?: string;
  avatarColor: string;
  direction: 'incoming' | 'outgoing' | 'missed';
  kind: 'voice' | 'video';
  durationSec?: number;
  timestamp: string;
}

export interface EmulatorSettings {
  variant: EmulatorVariant;
  activePhoneNumberId: string;
  webhookUrl: string;
  webhookSecret: string;
  apiKeyConfigured: boolean;
  lifecycleDeliveredMs: number;
  lifecycleReadMs: number;
  autoMarkReadOnAutoReply: boolean;
  enforce24hWindow: boolean;
  enforceOptIn: boolean;
  pricingRatesUsd: Record<ConversationCategory, number>;
  businessProfile: BusinessProfile;
  businessAutomation: BusinessAutomation;
}

export interface EmulatorState {
  self: SelfAccount;
  settings: EmulatorSettings;
  phoneNumbers: PhoneNumberConfig[];
  contacts: Contact[];
  chats: Chat[];
  messages: Record<string, Message[]>;
  templates: MessageTemplate[];
  catalog: CatalogItemRef[];
  quickReplies: QuickReply[];
  labels: BusinessLabel[];
  autoReplyRules: AutoReplyRule[];
  mediaIndex: Record<string, MediaRecord>;
  conversations: ConversationBillingRecord[];
  webhookLogs: WebhookLogEntry[];
  statusUpdates: StatusUpdateItem[];
  callLogs: CallLogItem[];
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
  | { type: 'config:updated'; payload: { settings: EmulatorSettings; self: SelfAccount; phoneNumbers: PhoneNumberConfig[] } }
  | {
      type: 'business:updated';
      payload: {
        catalog: CatalogItemRef[];
        quickReplies: QuickReply[];
        labels: BusinessLabel[];
        autoReplyRules: AutoReplyRule[];
        templates: MessageTemplate[];
        conversations: ConversationBillingRecord[];
      };
    }
  | { type: 'webhook:logged'; payload: WebhookLogEntry };
