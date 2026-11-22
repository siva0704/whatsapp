import { useEffect, useRef, useState } from 'react';
import type {
  AutoReplyRule,
  BroadcastCreateRequest,
  BroadcastJob,
  BulkSeedRequest,
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CatalogItemRef,
  Chat,
  ClientResponseSimulationRequest,
  Contact,
  ContactCardPayload,
  ConversationCategory,
  EmulatorState,
  EmulatorVariant,
  FailureInjectionConfig,
  InteractivePayload,
  LocationPayload,
  MediaAttachment,
  MessageError,
  MessageStatus,
  MessageTemplate,
  MessageType,
  OptInStatus,
  OrderPayload,
  PhoneNumberConfig,
  QuickReply,
  RateLimitConfig,
  RateLimitSnapshot,
  ServerWsEvent,
  TemplateApprovalStatus,
} from '../../shared/types';

const UI_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-WA-Sim-UI': '1',
};

export class ApiRequestError extends Error {
  status: number;
  metaError?: MessageError;

  constructor(message: string, status: number, metaError?: MessageError) {
    super(message);
    this.status = status;
    this.metaError = metaError;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...UI_HEADERS,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rawErr = (body as { error?: string | MessageError }).error;
    if (rawErr && typeof rawErr === 'object') {
      throw new ApiRequestError(rawErr.message || rawErr.title, res.status, rawErr);
    }
    throw new ApiRequestError(
      typeof rawErr === 'string' ? rawErr : `Request failed (${res.status})`,
      res.status
    );
  }
  return body as T;
}

export const emulatorApi = {
  getState: () => apiRequest<EmulatorState>('/api/state'),

  reset: (variant?: EmulatorVariant) =>
    apiRequest<{ ok: boolean; state: EmulatorState }>('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ variant }),
    }),

  updateConfig: (patch: {
    variant?: EmulatorVariant;
    activePhoneNumberId?: string;
    webhookUrl?: string;
    webhookSecret?: string;
    lifecycleDeliveredMs?: number;
    lifecycleReadMs?: number;
    autoMarkReadOnAutoReply?: boolean;
    enforce24hWindow?: boolean;
    enforceOptIn?: boolean;
    self?: Partial<{ name: string; phone: string; about: string }>;
  }) =>
    apiRequest('/api/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  upsertPhoneNumber: (input: {
    id?: string;
    phoneNumber: string;
    displayName: string;
    verifiedName?: string;
    webhookUrl?: string;
  }) =>
    apiRequest<{ phoneNumber: PhoneNumberConfig }>('/api/phone-numbers', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createContact: (input: {
    name: string;
    profileName?: string;
    phone: string;
    about?: string;
    isBot?: boolean;
    isBusiness?: boolean;
    optInStatus?: OptInStatus;
  }) =>
    apiRequest<{ contact: Contact; chat: Chat }>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateContact: (
    contactId: string,
    patch: Partial<
      Pick<
        Contact,
        | 'name'
        | 'profileName'
        | 'phone'
        | 'about'
        | 'blocked'
        | 'disabled'
        | 'invalidNumber'
        | 'country'
        | 'tags'
        | 'timezone'
        | 'personality'
        | 'customReplyText'
      >
    >
  ) =>
    apiRequest<{ contact: Contact }>(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  blockContact: (contactId: string, blocked: boolean) =>
    apiRequest<{ contact: Contact }>(`/api/contacts/${contactId}/block`, {
      method: 'POST',
      body: JSON.stringify({ blocked }),
    }),

  setContactOptIn: (
    contactId: string,
    status: OptInStatus,
    source: string = 'ui',
    note?: string
  ) =>
    apiRequest<{ contact: Contact }>(`/api/contacts/${contactId}/opt-in`, {
      method: 'POST',
      body: JSON.stringify({ status, source, note }),
    }),

  createGroup: (input: { name: string; description?: string; participantIds: string[] }) =>
    apiRequest<{ chat: Chat }>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'group', ...input }),
    }),

  updateChat: (
    chatId: string,
    patch: Partial<
      Pick<
        Chat,
        | 'name'
        | 'description'
        | 'archived'
        | 'pinned'
        | 'muted'
        | 'labelIds'
        | 'participantIds'
        | 'unreadCount'
        | 'lastInboundAt'
        | 'conversationCategory'
        | 'phoneNumberId'
      >
    >
  ) =>
    apiRequest<{ chat: Chat }>(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  clearChat: (chatId: string) =>
    apiRequest<{ ok: boolean }>(`/api/chats/${chatId}/clear`, { method: 'POST' }),

  deleteChat: (chatId: string) =>
    apiRequest<{ ok: boolean }>(`/api/chats/${chatId}`, { method: 'DELETE' }),

  markChatRead: (chatId: string) =>
    apiRequest<{ ok: boolean; chat: Chat }>(`/api/chats/${chatId}/read`, { method: 'POST' }),

  setTyping: (
    chatId: string,
    isTyping: boolean,
    mode: 'typing' | 'recording' = 'typing',
    contactId?: string
  ) =>
    apiRequest<{ ok: boolean }>(`/api/chats/${chatId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping, mode, contactId }),
    }),

  sendMessage: (payload: {
    chatId?: string;
    toPhone?: string;
    phoneNumberId?: string;
    body?: string;
    type?: MessageType;
    media?: MediaAttachment;
    mediaId?: string;
    location?: LocationPayload;
    contacts?: ContactCardPayload[];
    interactive?: InteractivePayload;
    templateId?: string;
    templateName?: string;
    templateVariables?: string[];
    templateOtpCode?: string;
    catalogItemId?: string;
    carouselItemIds?: string[];
    order?: OrderPayload;
    replyToMessageId?: string;
    simulateErrorCode?: number;
  }) =>
    apiRequest('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  receiveMessage: (payload: {
    chatId?: string;
    phoneNumberId?: string;
    fromPhone?: string;
    fromName?: string;
    senderId?: string;
    body?: string;
    type?: MessageType;
    media?: MediaAttachment;
    mediaId?: string;
    location?: LocationPayload;
    contacts?: ContactCardPayload[];
    interactive?: InteractivePayload;
    order?: OrderPayload;
  }) =>
    apiRequest<{ chat?: Chat; optInChanged?: { status: OptInStatus; keyword: string } }>(
      '/api/messages/receive',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateReceipt: (messageId: string, status: MessageStatus, errorCode?: number) =>
    apiRequest(`/api/messages/${messageId}/receipt`, {
      method: 'POST',
      body: JSON.stringify({ status, errorCode }),
    }),

  uploadMedia: (payload: { dataUrl: string; filename?: string; mimeType?: string }) =>
    apiRequest<MediaAttachment>('/api/media', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  upsertTemplate: (
    tpl: Partial<MessageTemplate> & {
      name: string;
      bodyText: string;
      category: MessageTemplate['category'];
    }
  ) =>
    apiRequest<{ template: MessageTemplate }>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(tpl),
    }),

  setTemplateStatus: (id: string, status: TemplateApprovalStatus, rejectionReason?: string) =>
    apiRequest<{ template: MessageTemplate }>(`/api/templates/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason }),
    }),

  deleteTemplate: (id: string) =>
    apiRequest(`/api/templates/${id}`, { method: 'DELETE' }),

  getPricingSummary: () =>
    apiRequest<{
      ratesUsd: Record<ConversationCategory, number>;
      totalConversations: number;
      grandTotalUsd: number;
      byCategory: Record<ConversationCategory, { count: number; totalCostUsd: number }>;
    }>('/api/conversations/pricing'),

  updateBusinessProfile: (patch: Partial<BusinessProfile>) =>
    apiRequest('/api/business/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  updateBusinessAutomation: (patch: Partial<BusinessAutomation>) =>
    apiRequest('/api/business/automation', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  upsertCatalogItem: (item: Partial<CatalogItemRef> & { name: string; price: string }) =>
    apiRequest('/api/business/catalog', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  deleteCatalogItem: (id: string) =>
    apiRequest(`/api/business/catalog/${id}`, { method: 'DELETE' }),

  upsertQuickReply: (qr: Partial<QuickReply> & { shortcut: string; message: string }) =>
    apiRequest('/api/business/quick-replies', {
      method: 'POST',
      body: JSON.stringify(qr),
    }),

  deleteQuickReply: (id: string) =>
    apiRequest(`/api/business/quick-replies/${id}`, { method: 'DELETE' }),

  upsertLabel: (lbl: Partial<BusinessLabel> & { name: string; color: string }) =>
    apiRequest('/api/business/labels', {
      method: 'POST',
      body: JSON.stringify(lbl),
    }),

  deleteLabel: (id: string) =>
    apiRequest(`/api/business/labels/${id}`, { method: 'DELETE' }),

  upsertAutoReplyRule: (
    rule: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }
  ) =>
    apiRequest('/api/auto-replies', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  deleteAutoReplyRule: (id: string) =>
    apiRequest(`/api/auto-replies/${id}`, { method: 'DELETE' }),

  clearWebhookLogs: () => apiRequest('/api/webhooks/logs', { method: 'DELETE' }),

  // Phase 3: Seeded Clients, Broadcasts, Failure Injection & Rate Limits
  bulkSeedClients: (payload: BulkSeedRequest) =>
    apiRequest<{ seededCount: number; contacts: Contact[]; chats: Chat[] }>('/api/clients/seed', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  simulateClientResponse: (payload: ClientResponseSimulationRequest) =>
    apiRequest<{
      ok: boolean;
      affected: number;
      results: Array<{ contactId: string; phone: string; action: string; ok: boolean; note?: string }>;
    }>('/api/clients/simulate-response', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createBroadcast: (payload: BroadcastCreateRequest) =>
    apiRequest<{ broadcast: BroadcastJob }>('/api/broadcasts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  scheduleBroadcast: (payload: BroadcastCreateRequest) =>
    apiRequest<{ broadcast: BroadcastJob }>('/api/broadcasts/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  dispatchBroadcastNow: (broadcastId: string) =>
    apiRequest<{ broadcast: BroadcastJob }>(`/api/broadcasts/${broadcastId}/dispatch`, {
      method: 'POST',
    }),

  getBroadcast: (broadcastId: string) =>
    apiRequest<{ broadcast: BroadcastJob }>(`/api/broadcasts/${broadcastId}`),

  updateFailureInjection: (patch: Partial<FailureInjectionConfig>) =>
    apiRequest<{ failureInjection: FailureInjectionConfig }>('/api/testing/failure-injection', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  updateRateLimits: (patch: Partial<RateLimitConfig>) =>
    apiRequest<{ rateLimits: RateLimitConfig; usage: RateLimitSnapshot }>(
      '/api/testing/rate-limits',
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  resetRateLimits: () =>
    apiRequest<{ ok: boolean; usage: RateLimitSnapshot }>('/api/testing/rate-limits/reset', {
      method: 'POST',
    }),
};

export function applyWsEvent(prev: EmulatorState | null, event: ServerWsEvent): EmulatorState | null {
  if (event.type === 'state:sync') {
    return event.payload;
  }
  if (!prev) return prev;

  switch (event.type) {
    case 'message:created': {
      const { chatId, message, chat } = event.payload;
      const existingList = prev.messages[chatId] || [];
      const alreadyExists = existingList.some((m) => m.id === message.id);
      const nextList = alreadyExists ? existingList : [...existingList, message];

      const chatExists = prev.chats.some((c) => c.id === chat.id);
      const nextChats = chatExists
        ? prev.chats.map((c) => (c.id === chat.id ? chat : c))
        : [chat, ...prev.chats];

      return {
        ...prev,
        chats: nextChats,
        messages: {
          ...prev.messages,
          [chatId]: nextList,
        },
      };
    }
    case 'message:updated': {
      const { chatId, message } = event.payload;
      const list = prev.messages[chatId] || [];
      return {
        ...prev,
        messages: {
          ...prev.messages,
          [chatId]: list.map((m) => (m.id === message.id ? message : m)),
        },
      };
    }
    case 'chat:updated': {
      const chat = event.payload;
      const exists = prev.chats.some((c) => c.id === chat.id);
      return {
        ...prev,
        chats: exists ? prev.chats.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...prev.chats],
      };
    }
    case 'chat:deleted': {
      const { chatId } = event.payload;
      const nextMessages = { ...prev.messages };
      delete nextMessages[chatId];
      return {
        ...prev,
        chats: prev.chats.filter((c) => c.id !== chatId),
        messages: nextMessages,
      };
    }
    case 'contact:updated': {
      const contact = event.payload;
      const exists = prev.contacts.some((c) => c.id === contact.id);
      return {
        ...prev,
        contacts: exists
          ? prev.contacts.map((c) => (c.id === contact.id ? contact : c))
          : [...prev.contacts, contact],
      };
    }
    case 'contact:deleted': {
      return {
        ...prev,
        contacts: prev.contacts.filter((c) => c.id !== event.payload.contactId),
      };
    }
    case 'typing:updated': {
      const { chatId, contactId, mode } = event.payload;
      return {
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === chatId ? { ...c, typingContactId: contactId, typingMode: mode } : c
        ),
      };
    }
    case 'config:updated': {
      return {
        ...prev,
        settings: event.payload.settings,
        self: event.payload.self,
        phoneNumbers: event.payload.phoneNumbers,
      };
    }
    case 'business:updated': {
      return {
        ...prev,
        catalog: event.payload.catalog,
        quickReplies: event.payload.quickReplies,
        labels: event.payload.labels,
        autoReplyRules: event.payload.autoReplyRules,
        templates: event.payload.templates,
        conversations: event.payload.conversations,
      };
    }
    case 'broadcast:updated': {
      const job = event.payload;
      const existing = prev.broadcasts || [];
      const exists = existing.some((b) => b.id === job.id);
      return {
        ...prev,
        broadcasts: exists
          ? existing.map((b) => (b.id === job.id ? job : b))
          : [job, ...existing].slice(0, 40),
      };
    }
    case 'clients:seeded': {
      const { contacts: addedContacts, chats: addedChats } = event.payload;
      const existingContactIds = new Set(prev.contacts.map((c) => c.id));
      const existingChatIds = new Set(prev.chats.map((c) => c.id));
      const nextMessages = { ...prev.messages };
      for (const ch of addedChats) {
        if (!nextMessages[ch.id]) nextMessages[ch.id] = [];
      }
      return {
        ...prev,
        contacts: [
          ...prev.contacts,
          ...addedContacts.filter((c) => !existingContactIds.has(c.id)),
        ],
        chats: [
          ...prev.chats,
          ...addedChats.filter((c) => !existingChatIds.has(c.id)),
        ],
        messages: nextMessages,
      };
    }
    case 'testing:updated': {
      return {
        ...prev,
        failureInjection: event.payload.failureInjection,
        rateLimits: event.payload.rateLimits,
        rateLimitUsage: event.payload.rateLimitUsage,
      };
    }
    case 'webhook:logged': {
      const exists = prev.webhookLogs.some((l) => l.id === event.payload.id);
      if (exists) return prev;
      return {
        ...prev,
        webhookLogs: [event.payload, ...prev.webhookLogs].slice(0, 80),
      };
    }
    default:
      return prev;
  }
}

export const DEFAULT_PROTOCOL_STATE: EmulatorState = {
  self: {
    id: 'me',
    name: 'Karnataka State Protocol Vehicle Desk',
    phone: '+918022033588',
    about: "Official Vehicle Allotment Desk for Hon'ble MLAs | DPAR, Government of Karnataka",
    avatarUrl: '/assets/vehicle-desk-emblem.svg',
  },
  settings: {
    variant: 'business',
    activePhoneNumberId: 'wa-sim-phone-001',
    webhookUrl: '',
    webhookSecret: 'wa-sim-webhook-secret',
    apiKeyConfigured: false,
    lifecycleDeliveredMs: 450,
    lifecycleReadMs: 1400,
    autoMarkReadOnAutoReply: true,
    enforce24hWindow: false,
    enforceOptIn: false,
    pricingRatesUsd: {
      MARKETING: 0.025,
      UTILITY: 0.015,
      AUTHENTICATION: 0.0135,
      SERVICE: 0,
    },
    businessProfile: {
      name: 'Karnataka State Protocol Vehicle Desk',
      avatarUrl: '/assets/vehicle-desk-emblem.svg',
      category: 'Government & Public Services',
      description: 'Official VIP & MLA Vehicle Allotment Desk, DPAR, Government of Karnataka.',
      address: 'Vidhana Soudha, Bengaluru, Karnataka 560001',
      hours: '24/7 Protocol Dispatch',
      email: 'protocol@karnataka.gov.in',
      website: 'https://dpar.karnataka.gov.in',
      verified: true,
    },
    businessAutomation: {
      greetingEnabled: false,
      greetingMessage: '',
      awayEnabled: false,
      awayMessage: '',
      awaySchedule: 'outside_hours',
    },
  },
  phoneNumbers: [
    {
      id: 'wa-sim-phone-001',
      wabaId: 'waba-primary',
      phoneNumber: '+918022033588',
      displayName: 'Karnataka State Protocol Vehicle Desk',
      verifiedName: 'Karnataka State Protocol Vehicle Desk',
      qualityRating: 'GREEN',
      webhookUrl: '',
      businessProfile: {
        name: 'Karnataka State Protocol Vehicle Desk',
        avatarUrl: '/assets/vehicle-desk-emblem.svg',
        category: 'Government & Public Services',
        description: 'Official VIP & MLA Vehicle Allotment Desk, DPAR, Government of Karnataka.',
        address: 'Vidhana Soudha, Bengaluru, Karnataka 560001',
        hours: '24/7 Protocol Dispatch',
        email: 'protocol@karnataka.gov.in',
        website: 'https://dpar.karnataka.gov.in',
        verified: true,
      },
    },
  ],
  contacts: [
    {
      id: 'contact-mla-1',
      name: 'Hon. Rajesh Kumar',
      profileName: 'Hon. Rajesh Kumar',
      phone: '+919845011223',
      about: 'Special Secretary to Govt (DPAR)',
      avatarColor: '#00a884',
      isBot: false,
      isBusiness: false,
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: new Date().toISOString(),
      optInSource: 'env_seed',
      optInHistory: [],
      presence: 'online',
    },
    {
      id: 'contact-mla-2',
      name: 'Dr. Ananya Hegde',
      profileName: 'Dr. Ananya Hegde',
      phone: '+919845022334',
      about: 'Principal Secretary (Higher Education)',
      avatarColor: '#53bdeb',
      isBot: false,
      isBusiness: false,
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: new Date().toISOString(),
      optInSource: 'env_seed',
      optInHistory: [],
      presence: 'online',
    },
    {
      id: 'contact-mla-3',
      name: 'Sri B. S. Patil',
      profileName: 'Sri B. S. Patil',
      phone: '+919845033445',
      about: 'Joint Secretary (Protocol Liaison)',
      avatarColor: '#7f66ff',
      isBot: false,
      isBusiness: false,
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: new Date().toISOString(),
      optInSource: 'env_seed',
      optInHistory: [],
      presence: 'online',
    },
    {
      id: 'contact-driver-1',
      name: 'Suresh Gowda',
      profileName: 'Suresh Gowda',
      phone: '+919448033445',
      about: 'Chauffeur - Toyota Camry Hybrid (KA-01-GA-1001)',
      avatarColor: '#ff7b29',
      isBot: false,
      isBusiness: false,
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: new Date().toISOString(),
      optInSource: 'env_seed',
      optInHistory: [],
      presence: 'online',
    },
  ],
  chats: [
    {
      id: 'chat-contact-mla-1',
      contactId: 'contact-mla-1',
      unreadCount: 0,
      pinned: true,
      lastMessageAt: new Date().toISOString(),
      labels: ['VIP MLA'],
    },
    {
      id: 'chat-contact-mla-2',
      contactId: 'contact-mla-2',
      unreadCount: 0,
      pinned: true,
      lastMessageAt: new Date().toISOString(),
      labels: ['VIP MLA'],
    },
    {
      id: 'chat-contact-mla-3',
      contactId: 'contact-mla-3',
      unreadCount: 0,
      pinned: true,
      lastMessageAt: new Date().toISOString(),
      labels: ['VIP MLA'],
    },
  ],
  messages: {
    'chat-contact-mla-1': [
      {
        id: 'msg-seed-1',
        chatId: 'chat-contact-mla-1',
        senderId: 'contact-mla-1',
        fromMe: false,
        type: 'text',
        body: 'Namaskara, need official car tomorrow 10 AM from Vidhana Soudha to Airport',
        status: 'read',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'msg-seed-2',
        chatId: 'chat-contact-mla-1',
        senderId: 'me',
        fromMe: true,
        type: 'text',
        body: 'Namaskara Hon. Rajesh Kumar. Your booking is confirmed. Assigned Toyota Camry Hybrid (KA-01-GA-1001), Chauffeur: Suresh Gowda (+919448033445).',
        status: 'read',
        timestamp: new Date(Date.now() - 3500000).toISOString(),
      },
    ],
  },
  templates: [],
  catalog: [],
  quickReplies: [],
  labels: [],
  autoReplyRules: [],
  mediaIndex: {},
  conversations: [],
  webhookLogs: [],
  statusUpdates: [],
  callLogs: [],
  broadcasts: [],
  failureInjection: {
    enabled: false,
    failureRatePercent: 0,
    forcedErrorCode: 0,
    forcedErrorStage: 'send',
  },
  rateLimits: {
    messagesPerSecond: 80,
    messagesPerMinute: 1200,
    pairMessagesPerMinute: 15,
    dailyTemplateLimit: 1000,
  },
  rateLimitUsage: {
    windowSecondCounts: {},
    windowMinuteCounts: {},
    dailyTemplatesSent: 0,
    dailyResetAt: new Date(Date.now() + 86400000).toISOString(),
    totalThrottled: 0,
  },
};

export function useEmulatorState() {
  const [state, setState] = useState<EmulatorState>(() => {
    try {
      const cached = localStorage.getItem('wa_sim_cached_state');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.contacts && parsed.settings) return parsed;
      }
    } catch {}
    return DEFAULT_PROTOCOL_STATE;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Fetch initial state from server
    emulatorApi
      .getState()
      .then((initial) => {
        if (!cancelled && initial && initial.contacts) {
          setState(initial);
          try {
            localStorage.setItem('wa_sim_cached_state', JSON.stringify(initial));
          } catch {}
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[WA-Sim] Using resilient client protocol state:', err);
          setError(null);
        }
      });

    // Disable WebSocket loop on Vercel serverless where WebSockets fail
    const isServerless =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('vercel.app') ||
        window.location.hostname.includes('netlify.app'));

    let ws: WebSocket | null = null;

    if (!isServerless) {
      const connect = () => {
        if (cancelled) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        try {
          ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

          ws.onopen = () => {
            if (!cancelled) setWsConnected(true);
          };

          ws.onmessage = (ev) => {
            try {
              const parsed = JSON.parse(ev.data) as ServerWsEvent;
              if (!cancelled) {
                setState((prev) => applyWsEvent(prev, parsed));
              }
            } catch {}
          };

          ws.onclose = () => {
            if (!cancelled) {
              setWsConnected(false);
              reconnectTimer.current = setTimeout(connect, 3000);
            }
          };

          ws.onerror = () => {
            ws?.close();
          };
        } catch {
          // Ignore
        }
      };

      connect();
    }

    // Polling interval (2.5s) for live message synchronization
    const pollInterval = setInterval(() => {
      if (cancelled) return;
      emulatorApi
        .getState()
        .then((latest) => {
          if (!cancelled && latest && latest.contacts) {
            setState(latest);
            try {
              localStorage.setItem('wa_sim_cached_state', JSON.stringify(latest));
            } catch {}
            setError(null);
          }
        })
        .catch(() => {
          // Silent catch to prevent console error spam
        });
    }, 2500);

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clearInterval(pollInterval);
      ws?.close();
    };
  }, []);

  return { state, loading, error, wsConnected };
}
