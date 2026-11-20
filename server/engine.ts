import crypto from 'crypto';
import type {
  AutoReplyRule,
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CatalogItemRef,
  Chat,
  Contact,
  EmulatorSettings,
  EmulatorState,
  MediaAttachment,
  Message,
  MessageStatus,
  MessageType,
  QuotedMessageRef,
  QuickReply,
  ServerWsEvent,
  WebhookLogEntry,
} from '../shared/types';
import {
  type EmulatorEnvConfig,
  toContactFromSeed,
  toRuleFromSeed,
} from './config';
import type { StateStore } from './storage';
import { buildCloudWebhookEnvelope, dispatchWebhook } from './webhooks';

export type EngineListener = (event: ServerWsEvent) => void;

export interface SendMessageParams {
  chatId?: string;
  toPhone?: string;
  body: string;
  type?: MessageType;
  media?: MediaAttachment;
  catalogItemId?: string;
  replyToMessageId?: string;
  skipLifecycleTimers?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ReceiveMessageParams {
  chatId?: string;
  fromPhone?: string;
  fromName?: string;
  senderId?: string;
  body: string;
  type?: MessageType;
  media?: MediaAttachment;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface CloudApiNormalizedSend {
  toPhone: string;
  type: MessageType;
  body: string;
  media?: MediaAttachment;
}

export function normalizeCloudApiSendPayload(payload: Record<string, unknown>): CloudApiNormalizedSend | null {
  const to = typeof payload.to === 'string' ? payload.to.trim() : '';
  if (!to) return null;

  const rawType = typeof payload.type === 'string' ? payload.type : 'text';
  if (rawType === 'text') {
    const textObj = payload.text as Record<string, unknown> | undefined;
    const body = typeof textObj?.body === 'string' ? textObj.body : '';
    if (!body) return null;
    return { toPhone: to, type: 'text', body };
  }

  if (rawType === 'image') {
    const img = payload.image as Record<string, unknown> | undefined;
    const link = typeof img?.link === 'string' ? img.link : '';
    const caption = typeof img?.caption === 'string' ? img.caption : '';
    return {
      toPhone: to,
      type: 'image',
      body: caption || 'Photo',
      media: {
        id: `ext_${crypto.randomUUID().slice(0, 8)}`,
        url: link,
        mimeType: 'image/jpeg',
        caption,
      },
    };
  }

  if (rawType === 'document') {
    const doc = payload.document as Record<string, unknown> | undefined;
    const link = typeof doc?.link === 'string' ? doc.link : '';
    const filename = typeof doc?.filename === 'string' ? doc.filename : 'document.pdf';
    const caption = typeof doc?.caption === 'string' ? doc.caption : '';
    return {
      toPhone: to,
      type: 'document',
      body: caption || filename,
      media: {
        id: `ext_${crypto.randomUUID().slice(0, 8)}`,
        url: link,
        mimeType: 'application/pdf',
        filename,
        caption,
      },
    };
  }

  if (rawType === 'audio') {
    const audio = payload.audio as Record<string, unknown> | undefined;
    const link = typeof audio?.link === 'string' ? audio.link : '';
    return {
      toPhone: to,
      type: 'voice',
      body: 'Voice message',
      media: {
        id: `ext_${crypto.randomUUID().slice(0, 8)}`,
        url: link,
        mimeType: 'audio/ogg',
        durationSec: 8,
        waveform: [18, 35, 62, 48, 84, 72, 55, 40, 68, 90, 60, 44, 30, 52, 74, 48, 28, 20],
      },
    };
  }

  if (rawType === 'template') {
    const tpl = payload.template as Record<string, unknown> | undefined;
    const name = typeof tpl?.name === 'string' ? tpl.name : 'template';
    return {
      toPhone: to,
      type: 'text',
      body: `[Template: ${name}]`,
    };
  }

  return null;
}

export function matchAutoReplyRule(
  rules: AutoReplyRule[],
  messageBody: string,
  contactId?: string
): AutoReplyRule | null {
  const normalized = messageBody.trim();
  if (!normalized) return null;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.contactId && contactId && rule.contactId !== contactId) continue;

    if (rule.matchType === 'exact') {
      if (normalized.toLowerCase() === rule.pattern.trim().toLowerCase()) {
        return rule;
      }
    } else if (rule.matchType === 'contains') {
      if (normalized.toLowerCase().includes(rule.pattern.trim().toLowerCase())) {
        return rule;
      }
    } else if (rule.matchType === 'regex') {
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(normalized)) {
          return rule;
        }
      } catch {
        // Ignore malformed user regex
      }
    }
  }
  return null;
}

export function createSeedState(env: EmulatorEnvConfig): EmulatorState {
  const now = Date.now();
  const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  const contacts: Contact[] = [
    {
      id: 'contact-alex',
      name: 'Alex Rivera',
      phone: '+14155550142',
      avatarUrl: '/src/assets/images/avatar_alex_dev_1795189142888.jpg',
      avatarColor: '#00a884',
      about: 'Staff QA Engineer · Webhook Pipeline',
      presence: 'online',
      lastSeen: minsAgo(0),
    },
    {
      id: 'contact-priya',
      name: 'Priya Patel',
      phone: '+14155550188',
      avatarUrl: '/src/assets/images/avatar_priya_ops_1795189209154.jpg',
      avatarColor: '#53bdeb',
      about: 'Operations Lead · Order Verification',
      isBusiness: true,
      presence: 'online',
      lastSeen: minsAgo(2),
    },
    {
      id: 'contact-orderbot',
      name: 'Fulfillment Test Bot',
      phone: '+14155550199',
      avatarColor: '#7f66ff',
      about: 'Automated responder for order, status, refund, and ping flows',
      isBot: true,
      presence: 'online',
      lastSeen: minsAgo(0),
    },
    {
      id: 'contact-elena',
      name: 'Elena Rostova',
      phone: '+14155550164',
      avatarColor: '#e542a3',
      about: 'Mobile SDK Integration',
      presence: 'offline',
      lastSeen: minsAgo(48),
    },
    {
      id: 'contact-marcus',
      name: 'Marcus Chen',
      phone: '+14155550127',
      avatarColor: '#ff7b29',
      about: 'Archived Staging Client',
      presence: 'offline',
      lastSeen: minsAgo(360),
    },
  ];

  // Merge .env preloaded contacts if provided
  env.preloadedContacts.forEach((seed, idx) => {
    if (!contacts.some((c) => c.phone === seed.phone)) {
      contacts.push(toContactFromSeed(seed, idx));
    }
  });

  const catalog: CatalogItemRef[] = [
    {
      id: 'cat-pour-over',
      name: 'Matte Pour-Over Brew Kit',
      price: '84.00',
      currency: 'USD',
      description: 'Gooseneck 900ml kettle with ceramic V60 dripper and borosilicate carafe.',
      sku: 'BRW-PO-900',
      imageUrl: '/src/assets/images/catalog_espresso_kit_1795189175804.jpg',
      inStock: true,
    },
    {
      id: 'cat-single-origin',
      name: 'Ethiopia Yirgacheffe 340g',
      price: '22.50',
      currency: 'USD',
      description: 'Washed heirloom roast with bergamot, jasmine, and white peach tasting notes.',
      sku: 'COF-ETH-340',
      inStock: true,
    },
    {
      id: 'cat-filter-pack',
      name: 'Unbleached Paper Filters (100ct)',
      price: '9.00',
      currency: 'USD',
      description: 'Precision cone filters compatible with size 02 ceramic drippers.',
      sku: 'ACC-FLT-100',
      inStock: true,
    },
  ];

  const labels: BusinessLabel[] = [
    { id: 'lbl-new', name: 'New Customer', color: '#00a884' },
    { id: 'lbl-pending', name: 'Pending Payment', color: '#f59e0b' },
    { id: 'lbl-vip', name: 'VIP Account', color: '#8b5cf6' },
    { id: 'lbl-complete', name: 'Order Complete', color: '#3b82f6' },
  ];

  const quickReplies: QuickReply[] = [
    {
      id: 'qr-thanks',
      shortcut: 'thanks',
      message: 'Thanks for reaching out to Meridian Coffee Roasters! How can we help with your order today?',
      keywords: ['welcome', 'greeting'],
    },
    {
      id: 'qr-hours',
      shortcut: 'hours',
      message: 'Our support desk is open Monday–Friday, 08:00–18:00 PT. Orders ship same-day before 14:00 PT.',
      keywords: ['schedule', 'open'],
    },
    {
      id: 'qr-tracking',
      shortcut: 'tracking',
      message: 'Your shipment is confirmed! Reply with your order ID (e.g. #ORD-4821) and we will pull the live carrier link.',
      keywords: ['shipping', 'order'],
    },
    {
      id: 'qr-refund',
      shortcut: 'refund',
      message: 'We have initiated your refund request. Please allow 2–3 business days for the credit to appear on your statement.',
      keywords: ['return', 'billing'],
    },
  ];

  const defaultRules: AutoReplyRule[] = [
    {
      id: 'rule-status',
      name: 'Order Status Lookup',
      enabled: true,
      matchType: 'contains',
      pattern: 'status',
      reply: 'Order #ORD-4821 is packed and out for courier pickup. Estimated arrival: tomorrow by 16:00.',
      delayMs: 750,
      simulateTypingMs: 600,
    },
    {
      id: 'rule-ping',
      name: 'Health Ping / Echo',
      enabled: true,
      matchType: 'regex',
      pattern: '^(ping|health|test)$',
      reply: 'pong — WA-Sim responder active (200 OK).',
      delayMs: 500,
      simulateTypingMs: 400,
    },
    {
      id: 'rule-help',
      name: 'Help Menu',
      enabled: true,
      matchType: 'contains',
      pattern: 'help',
      reply: 'Simulated Bot Commands: send "status" for order lookup, "ping" for health echo, or "refund" for return workflow.',
      delayMs: 650,
      simulateTypingMs: 500,
    },
    {
      id: 'rule-refund',
      name: 'Refund Workflow',
      enabled: true,
      matchType: 'contains',
      pattern: 'refund',
      reply: 'Return authorization #RMA-904 created. Please confirm your order email to finalize.',
      delayMs: 850,
      simulateTypingMs: 650,
    },
  ];

  const autoReplyRules = [
    ...defaultRules,
    ...env.autoReplyRules.map((seed, idx) => toRuleFromSeed(seed, idx)),
  ];

  const chats: Chat[] = [
    {
      id: 'chat-alex',
      type: 'direct',
      name: 'Alex Rivera',
      avatarUrl: '/src/assets/images/avatar_alex_dev_1795189142888.jpg',
      avatarColor: '#00a884',
      contactId: 'contact-alex',
      participantIds: ['contact-alex'],
      unreadCount: 0,
      archived: false,
      pinned: true,
      muted: false,
      labelIds: ['lbl-vip'],
      lastMessageId: 'msg-alex-4',
      lastMessageAt: minsAgo(4),
    },
    {
      id: 'chat-orderbot',
      type: 'direct',
      name: 'Fulfillment Test Bot',
      avatarColor: '#7f66ff',
      contactId: 'contact-orderbot',
      participantIds: ['contact-orderbot'],
      unreadCount: 1,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: ['lbl-new'],
      lastMessageId: 'msg-bot-2',
      lastMessageAt: minsAgo(9),
    },
    {
      id: 'chat-priya',
      type: 'direct',
      name: 'Priya Patel',
      avatarUrl: '/src/assets/images/avatar_priya_ops_1795189209154.jpg',
      avatarColor: '#53bdeb',
      contactId: 'contact-priya',
      participantIds: ['contact-priya'],
      unreadCount: 2,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: ['lbl-pending'],
      lastMessageId: 'msg-priya-3',
      lastMessageAt: minsAgo(22),
    },
    {
      id: 'chat-qa-group',
      type: 'group',
      name: 'Release QA · Webhook Sync',
      avatarColor: '#008069',
      description: 'Automated integration group for multi-participant message routing and delivery receipt verification.',
      participantIds: ['contact-alex', 'contact-priya', 'contact-elena'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: ['lbl-complete'],
      lastMessageId: 'msg-grp-3',
      lastMessageAt: minsAgo(41),
    },
    {
      id: 'chat-marcus',
      type: 'direct',
      name: 'Marcus Chen',
      avatarColor: '#ff7b29',
      contactId: 'contact-marcus',
      participantIds: ['contact-marcus'],
      unreadCount: 0,
      archived: true,
      pinned: false,
      muted: true,
      labelIds: [],
      lastMessageId: 'msg-marcus-1',
      lastMessageAt: minsAgo(360),
    },
  ];

  // Add direct chats for any extra .env contacts
  env.preloadedContacts.forEach((seed, idx) => {
    const contactId = `contact-env-${idx + 1}`;
    if (!chats.some((c) => c.contactId === contactId)) {
      chats.push({
        id: `chat-env-${idx + 1}`,
        type: 'direct',
        name: seed.name,
        avatarColor: '#00a884',
        contactId,
        participantIds: [contactId],
        unreadCount: 0,
        archived: false,
        pinned: false,
        muted: false,
        labelIds: [],
        lastMessageId: null,
        lastMessageAt: minsAgo(120 + idx),
      });
    }
  });

  const messages: Record<string, Message[]> = {
    'chat-alex': [
      {
        id: 'msg-alex-1',
        chatId: 'chat-alex',
        senderId: 'contact-alex',
        senderName: 'Alex Rivera',
        direction: 'inbound',
        type: 'text',
        body: 'Hey! Pointed the staging webhook runner at localhost:3000. Ready to verify outbound delivery ticks.',
        timestamp: minsAgo(28),
        status: 'read',
      },
      {
        id: 'msg-alex-2',
        chatId: 'chat-alex',
        senderId: 'me',
        senderName: env.selfName,
        direction: 'outbound',
        type: 'text',
        body: 'Confirmed — receipts transition from sent to delivered to read automatically, or via POST /api/messages/:id/receipt.',
        timestamp: minsAgo(25),
        status: 'read',
      },
      {
        id: 'msg-alex-3',
        chatId: 'chat-alex',
        senderId: 'contact-alex',
        senderName: 'Alex Rivera',
        direction: 'inbound',
        type: 'voice',
        body: 'Voice message (0:14)',
        timestamp: minsAgo(12),
        status: 'read',
        media: {
          id: 'seed-voice-1',
          url: '',
          mimeType: 'audio/ogg',
          durationSec: 14,
          waveform: [16, 28, 52, 74, 61, 38, 82, 95, 70, 48, 63, 88, 76, 54, 41, 66, 44, 26, 35, 22, 18, 25],
        },
      },
      {
        id: 'msg-alex-4',
        chatId: 'chat-alex',
        senderId: 'me',
        senderName: env.selfName,
        direction: 'outbound',
        type: 'image',
        body: 'Latest pour-over kit asset uploaded for Business catalog verification.',
        timestamp: minsAgo(4),
        status: 'delivered',
        media: {
          id: 'seed-img-1',
          url: '/src/assets/images/catalog_espresso_kit_1795189175804.jpg',
          mimeType: 'image/jpeg',
          filename: 'pour-over-kit.jpg',
          caption: 'Latest pour-over kit asset uploaded for Business catalog verification.',
        },
      },
    ],
    'chat-orderbot': [
      {
        id: 'msg-bot-1',
        chatId: 'chat-orderbot',
        senderId: 'me',
        senderName: env.selfName,
        direction: 'outbound',
        type: 'text',
        body: 'help',
        timestamp: minsAgo(10),
        status: 'read',
      },
      {
        id: 'msg-bot-2',
        chatId: 'chat-orderbot',
        senderId: 'contact-orderbot',
        senderName: 'Fulfillment Test Bot',
        direction: 'inbound',
        type: 'text',
        body: 'Simulated Bot Commands: send "status" for order lookup, "ping" for health echo, or "refund" for return workflow.',
        timestamp: minsAgo(9),
        status: 'delivered',
      },
    ],
    'chat-priya': [
      {
        id: 'msg-priya-1',
        chatId: 'chat-priya',
        senderId: 'contact-priya',
        senderName: 'Priya Patel',
        direction: 'inbound',
        type: 'text',
        body: 'Could you send over the Pour-Over Brew Kit catalog card so I can test the Business webhook parser?',
        timestamp: minsAgo(30),
        status: 'read',
      },
      {
        id: 'msg-priya-2',
        chatId: 'chat-priya',
        senderId: 'contact-priya',
        senderName: 'Priya Patel',
        direction: 'inbound',
        type: 'document',
        body: 'webhook-schema-v19.pdf',
        timestamp: minsAgo(24),
        status: 'delivered',
        media: {
          id: 'seed-doc-1',
          url: '#',
          mimeType: 'application/pdf',
          filename: 'webhook-schema-v19.pdf',
          sizeBytes: 248320,
        },
      },
      {
        id: 'msg-priya-3',
        chatId: 'chat-priya',
        senderId: 'contact-priya',
        senderName: 'Priya Patel',
        direction: 'inbound',
        type: 'text',
        body: 'Also checking if away/greeting messages fire when Business variant is active.',
        timestamp: minsAgo(22),
        status: 'delivered',
      },
    ],
    'chat-qa-group': [
      {
        id: 'msg-grp-1',
        chatId: 'chat-qa-group',
        senderId: 'contact-elena',
        senderName: 'Elena Rostova',
        direction: 'inbound',
        type: 'text',
        body: 'Group fanout check: verifying sender metadata and quoted reply references.',
        timestamp: minsAgo(55),
        status: 'read',
      },
      {
        id: 'msg-grp-2',
        chatId: 'chat-qa-group',
        senderId: 'contact-alex',
        senderName: 'Alex Rivera',
        direction: 'inbound',
        type: 'text',
        body: 'Looks clean on the WebSocket stream — zero duplicate message IDs after reconnect.',
        timestamp: minsAgo(48),
        status: 'read',
        replyTo: {
          messageId: 'msg-grp-1',
          senderName: 'Elena Rostova',
          body: 'Group fanout check: verifying sender metadata and quoted reply references.',
          type: 'text',
        },
      },
      {
        id: 'msg-grp-3',
        chatId: 'chat-qa-group',
        senderId: 'me',
        senderName: env.selfName,
        direction: 'outbound',
        type: 'text',
        body: 'CI smoke suite passed 14/14 assertions against the local emulator.',
        timestamp: minsAgo(41),
        status: 'read',
      },
    ],
    'chat-marcus': [
      {
        id: 'msg-marcus-1',
        chatId: 'chat-marcus',
        senderId: 'contact-marcus',
        senderName: 'Marcus Chen',
        direction: 'inbound',
        type: 'text',
        body: 'Archived smoke test thread from yesterday.',
        timestamp: minsAgo(360),
        status: 'read',
      },
    ],
  };

  return {
    self: {
      id: 'me',
      name: env.selfName,
      phone: env.selfPhone,
      about: 'Available · Local Integration Sandbox',
      avatarUrl: '/src/assets/images/avatar_store_logo_1795189141688.jpg',
    },
    settings: {
      variant: env.variant,
      webhookUrl: env.webhookUrl,
      webhookSecret: env.webhookSecret,
      apiKeyConfigured: Boolean(env.apiKey),
      lifecycleDeliveredMs: env.lifecycleDeliveredMs,
      lifecycleReadMs: env.lifecycleReadMs,
      autoMarkReadOnAutoReply: true,
      businessProfile: {
        name: 'Meridian Coffee Roasters',
        category: 'Specialty Coffee & Equipment',
        description: 'Direct-trade roastery and brewing hardware storefront. Automated WhatsApp Business sandbox profile.',
        address: '420 Brannan St, San Francisco, CA 94107',
        hours: 'Mon–Fri · 08:00 – 18:00 PT',
        email: 'orders@meridian-sandbox.example',
        website: 'https://meridian-sandbox.example',
        verified: true,
        avatarUrl: '/src/assets/images/avatar_store_logo_1795189141688.jpg',
      },
      businessAutomation: {
        greetingEnabled: true,
        greetingMessage: 'Welcome to Meridian Coffee Roasters! Reply "status" for order updates or browse our catalog.',
        awayEnabled: false,
        awayMessage: 'We are currently outside business hours (Mon–Fri 08:00–18:00 PT). Leave your order number and we will respond promptly.',
        awaySchedule: 'outside_hours',
      },
    },
    contacts,
    chats,
    messages,
    catalog,
    quickReplies,
    labels,
    autoReplyRules,
    webhookLogs: [],
  };
}

export class EmulatorEngine {
  private state: EmulatorState;
  private readonly store: StateStore;
  private readonly env: EmulatorEnvConfig;
  private readonly listeners = new Set<EngineListener>();
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly greetedChatIds = new Set<string>();

  constructor(store: StateStore, env: EmulatorEnvConfig) {
    this.store = store;
    this.env = env;
    const loaded = store.load();
    if (loaded) {
      this.state = loaded;
      // Ensure env webhookUrl/variant still reflect explicit env if unset
      this.state.settings.apiKeyConfigured = Boolean(env.apiKey);
    } else {
      this.state = createSeedState(env);
      this.persist();
    }
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ServerWsEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private persist(): void {
    this.store.save(this.state);
  }

  private scheduleTimer(fn: () => void, ms: number): void {
    if (ms <= 0) {
      fn();
      return;
    }
    const t = setTimeout(() => {
      this.pendingTimers.delete(t);
      fn();
    }, ms);
    this.pendingTimers.add(t);
  }

  clearTimers(): void {
    for (const t of this.pendingTimers) {
      clearTimeout(t);
    }
    this.pendingTimers.clear();
  }

  getState(): EmulatorState {
    return this.state;
  }

  reset(variantOverride?: 'personal' | 'business'): EmulatorState {
    this.clearTimers();
    this.greetedChatIds.clear();
    const effectiveEnv = variantOverride
      ? { ...this.env, variant: variantOverride }
      : this.env;
    this.state = createSeedState(effectiveEnv);
    this.persist();
    this.emit({ type: 'state:sync', payload: this.state });
    return this.state;
  }

  private recordWebhook(event: string, payload: Record<string, unknown>): void {
    const { webhookUrl, webhookSecret } = this.state.settings;
    void dispatchWebhook({
      event,
      targetUrl: webhookUrl,
      secret: webhookSecret,
      payload,
    }).then((entry: WebhookLogEntry) => {
      this.state.webhookLogs = [entry, ...this.state.webhookLogs].slice(0, 60);
      this.persist();
      this.emit({ type: 'webhook:logged', payload: entry });
    });
  }

  // --- Contacts ---
  createContact(input: {
    name: string;
    phone: string;
    about?: string;
    isBot?: boolean;
    isBusiness?: boolean;
    avatarUrl?: string;
  }): { contact: Contact; chat: Chat } {
    const cleanPhone = input.phone.trim();
    const existing = this.state.contacts.find((c) => c.phone === cleanPhone);
    if (existing) {
      const existingChat = this.ensureDirectChat(existing);
      return { contact: existing, chat: existingChat };
    }

    const palette = ['#00a884', '#53bdeb', '#7f66ff', '#e542a3', '#ff7b29', '#009de2'];
    const contact: Contact = {
      id: `contact-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim() || cleanPhone,
      phone: cleanPhone,
      avatarUrl: input.avatarUrl,
      avatarColor: palette[this.state.contacts.length % palette.length],
      about: input.about?.trim() || 'Hey there! I am using WhatsApp.',
      isBot: Boolean(input.isBot),
      isBusiness: Boolean(input.isBusiness),
      presence: 'online',
      lastSeen: new Date().toISOString(),
    };

    this.state.contacts.push(contact);
    const chat = this.ensureDirectChat(contact);
    this.persist();
    this.emit({ type: 'contact:updated', payload: contact });
    this.emit({ type: 'chat:updated', payload: chat });
    return { contact, chat };
  }

  updateContact(id: string, patch: Partial<Pick<Contact, 'name' | 'phone' | 'about' | 'presence' | 'isBot' | 'isBusiness'>>): Contact | null {
    const contact = this.state.contacts.find((c) => c.id === id);
    if (!contact) return null;

    Object.assign(contact, patch);
    if (patch.presence === 'offline') {
      contact.lastSeen = new Date().toISOString();
    }

    // Keep direct chat name synced
    const directChat = this.state.chats.find((c) => c.type === 'direct' && c.contactId === id);
    if (directChat && patch.name) {
      directChat.name = patch.name;
      this.emit({ type: 'chat:updated', payload: directChat });
    }

    this.persist();
    this.emit({ type: 'contact:updated', payload: contact });
    return contact;
  }

  deleteContact(id: string): boolean {
    const idx = this.state.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.state.contacts.splice(idx, 1);
    this.persist();
    this.emit({ type: 'contact:deleted', payload: { contactId: id } });
    return true;
  }

  private ensureDirectChat(contact: Contact): Chat {
    let chat = this.state.chats.find((c) => c.type === 'direct' && c.contactId === contact.id);
    if (!chat) {
      chat = {
        id: `chat-${crypto.randomUUID().slice(0, 8)}`,
        type: 'direct',
        name: contact.name,
        avatarUrl: contact.avatarUrl,
        avatarColor: contact.avatarColor,
        contactId: contact.id,
        participantIds: [contact.id],
        unreadCount: 0,
        archived: false,
        pinned: false,
        muted: false,
        labelIds: [],
        lastMessageId: null,
        lastMessageAt: new Date().toISOString(),
      };
      this.state.chats.unshift(chat);
      this.state.messages[chat.id] = [];
    }
    return chat;
  }

  // --- Chats ---
  createGroupChat(input: { name: string; description?: string; participantIds: string[] }): Chat {
    const validIds = input.participantIds.filter((pid) =>
      this.state.contacts.some((c) => c.id === pid)
    );
    const now = new Date().toISOString();
    const chat: Chat = {
      id: `chat-grp-${crypto.randomUUID().slice(0, 8)}`,
      type: 'group',
      name: input.name.trim() || 'New QA Group',
      avatarColor: '#008069',
      description: input.description?.trim() || 'Group conversation',
      participantIds: validIds,
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageId: null,
      lastMessageAt: now,
    };

    const sysMsg: Message = {
      id: `msg-${crypto.randomUUID().slice(0, 10)}`,
      chatId: chat.id,
      senderId: 'system',
      senderName: 'System',
      direction: 'inbound',
      type: 'system',
      body: `You created group "${chat.name}"`,
      timestamp: now,
      status: 'read',
    };
    chat.lastMessageId = sysMsg.id;

    this.state.chats.unshift(chat);
    this.state.messages[chat.id] = [sysMsg];
    this.persist();
    this.emit({ type: 'chat:updated', payload: chat });
    this.emit({ type: 'message:created', payload: { chatId: chat.id, message: sysMsg, chat } });
    return chat;
  }

  updateChat(
    chatId: string,
    patch: Partial<Pick<Chat, 'name' | 'description' | 'archived' | 'pinned' | 'muted' | 'labelIds' | 'participantIds' | 'unreadCount'>>
  ): Chat | null {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;
    Object.assign(chat, patch);
    this.persist();
    this.emit({ type: 'chat:updated', payload: chat });
    return chat;
  }

  clearChatMessages(chatId: string): Chat | null {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;
    this.state.messages[chatId] = [];
    chat.lastMessageId = null;
    chat.unreadCount = 0;
    this.persist();
    this.emit({ type: 'state:sync', payload: this.state });
    return chat;
  }

  deleteChat(chatId: string): boolean {
    const idx = this.state.chats.findIndex((c) => c.id === chatId);
    if (idx === -1) return false;
    this.state.chats.splice(idx, 1);
    delete this.state.messages[chatId];
    this.persist();
    this.emit({ type: 'chat:deleted', payload: { chatId } });
    return true;
  }

  // --- Messaging ---
  private findQuotedMessage(chatId: string, messageId?: string): QuotedMessageRef | undefined {
    if (!messageId) return undefined;
    const msg = (this.state.messages[chatId] || []).find((m) => m.id === messageId);
    if (!msg) return undefined;
    return {
      messageId: msg.id,
      senderName: msg.direction === 'outbound' ? 'You' : msg.senderName,
      body: msg.body || (msg.media?.caption ?? msg.media?.filename ?? msg.type),
      type: msg.type,
    };
  }

  sendMessage(params: SendMessageParams): { message: Message; chat: Chat } | null {
    let chat: Chat | undefined;
    if (params.chatId) {
      chat = this.state.chats.find((c) => c.id === params.chatId);
    } else if (params.toPhone) {
      const cleanPhone = params.toPhone.trim();
      let contact = this.state.contacts.find((c) => c.phone === cleanPhone);
      if (!contact) {
        const created = this.createContact({ name: cleanPhone, phone: cleanPhone });
        contact = created.contact;
        chat = created.chat;
      } else {
        chat = this.ensureDirectChat(contact);
      }
    }

    if (!chat) return null;

    let catalogItem: CatalogItemRef | undefined;
    let msgType: MessageType = params.type || 'text';
    let body = params.body;

    if (params.catalogItemId) {
      catalogItem = this.state.catalog.find((item) => item.id === params.catalogItemId);
      if (catalogItem) {
        msgType = 'catalog_item';
        if (!body) {
          body = `${catalogItem.name} — ${catalogItem.currency} ${catalogItem.price}`;
        }
      }
    }

    const now = new Date().toISOString();
    const message: Message = {
      id: `wamid.${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
      chatId: chat.id,
      senderId: 'me',
      senderName: this.state.self.name,
      direction: 'outbound',
      type: msgType,
      body,
      timestamp: now,
      status: 'queued',
      media: params.media,
      catalogItem,
      replyTo: this.findQuotedMessage(chat.id, params.replyToMessageId),
      metadata: params.metadata,
    };

    if (!this.state.messages[chat.id]) {
      this.state.messages[chat.id] = [];
    }
    this.state.messages[chat.id].push(message);
    chat.lastMessageId = message.id;
    chat.lastMessageAt = now;
    if (chat.archived) {
      chat.archived = false;
    }

    this.persist();
    this.emit({ type: 'message:created', payload: { chatId: chat.id, message, chat } });

    // Immediate transition: queued -> sent
    this.updateMessageReceipt(message.id, 'sent');

    if (!params.skipLifecycleTimers) {
      const deliveredMs = this.state.settings.lifecycleDeliveredMs;
      const readMs = this.state.settings.lifecycleReadMs;

      this.scheduleTimer(() => {
        const current = this.findMessage(message.id);
        if (current && current.status === 'sent') {
          this.updateMessageReceipt(message.id, 'delivered');
        }
      }, deliveredMs);

      this.scheduleTimer(() => {
        const current = this.findMessage(message.id);
        if (current && (current.status === 'delivered' || current.status === 'sent')) {
          this.updateMessageReceipt(message.id, 'read');
        }
      }, Math.max(readMs, deliveredMs + 150));

      // Check configurable auto-reply bot rules on human/API outbound messages
      // (skip for automated Business greeting/away responses to avoid unintended loops)
      if (!params.metadata?.businessAutomation) {
        this.triggerAutoReplyIfMatched(chat, message);
      }
    }

    return { message, chat };
  }

  receiveMessage(params: ReceiveMessageParams): { message: Message; chat: Chat } | null {
    let chat: Chat | undefined;
    let sender: Contact | undefined;

    if (params.chatId) {
      chat = this.state.chats.find((c) => c.id === params.chatId);
    }

    if (params.senderId) {
      sender = this.state.contacts.find((c) => c.id === params.senderId);
    } else if (params.fromPhone) {
      const cleanPhone = params.fromPhone.trim();
      sender = this.state.contacts.find((c) => c.phone === cleanPhone);
      if (!sender) {
        const created = this.createContact({
          name: params.fromName?.trim() || cleanPhone,
          phone: cleanPhone,
        });
        sender = created.contact;
        if (!chat) chat = created.chat;
      }
    }

    if (!chat && sender) {
      chat = this.ensureDirectChat(sender);
    }

    if (!chat) return null;

    if (!sender) {
      const fallbackId = chat.contactId || chat.participantIds[0];
      sender = this.state.contacts.find((c) => c.id === fallbackId);
    }

    const now = new Date().toISOString();
    const message: Message = {
      id: `wamid.${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
      chatId: chat.id,
      senderId: sender?.id || 'external',
      senderName: sender?.name || params.fromName || 'External Contact',
      direction: 'inbound',
      type: params.type || 'text',
      body: params.body,
      timestamp: now,
      status: 'delivered',
      media: params.media,
      replyTo: this.findQuotedMessage(chat.id, params.replyToMessageId),
      metadata: params.metadata,
    };

    if (!this.state.messages[chat.id]) {
      this.state.messages[chat.id] = [];
    }
    this.state.messages[chat.id].push(message);
    chat.lastMessageId = message.id;
    chat.lastMessageAt = now;
    chat.unreadCount += 1;
    chat.typingContactId = null;
    chat.typingMode = null;

    if (sender) {
      sender.presence = 'online';
      sender.lastSeen = now;
    }

    this.persist();
    this.emit({ type: 'message:created', payload: { chatId: chat.id, message, chat } });

    this.recordWebhook(
      'message.received',
      buildCloudWebhookEnvelope('messages', this.state.self.phone, {
        id: message.id,
        from: sender?.phone || params.fromPhone || 'unknown',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: message.type,
        text: message.type === 'text' ? { body: message.body } : undefined,
        media: message.media,
        chat_id: chat.id,
      })
    );

    // Trigger Business Greeting or Away auto-responses when Business variant is active
    this.triggerBusinessAutomation(chat);

    return { message, chat };
  }

  private triggerAutoReplyIfMatched(chat: Chat, outboundMessage: Message): void {
    const targetContactId = chat.contactId || chat.participantIds[0];
    const matched = matchAutoReplyRule(this.state.autoReplyRules, outboundMessage.body, targetContactId);
    if (!matched) return;

    const responderId = matched.contactId || targetContactId;
    const responder = this.state.contacts.find((c) => c.id === responderId);
    if (!responder) return;

    const typingStart = Math.max(120, matched.delayMs - matched.simulateTypingMs);

    this.scheduleTimer(() => {
      if (this.state.settings.autoMarkReadOnAutoReply) {
        this.updateMessageReceipt(outboundMessage.id, 'read');
      }
      this.setTyping(chat.id, responder.id, 'typing');
    }, typingStart);

    this.scheduleTimer(() => {
      this.setTyping(chat.id, null, null);
      this.receiveMessage({
        chatId: chat.id,
        senderId: responder.id,
        body: matched.reply,
        type: 'text',
        metadata: { autoReplyRuleId: matched.id, triggeredByMessageId: outboundMessage.id },
      });
    }, Math.max(matched.delayMs, typingStart + 200));
  }

  private triggerBusinessAutomation(chat: Chat): void {
    if (this.state.settings.variant !== 'business') return;
    if (chat.type !== 'direct') return;

    const auto = this.state.settings.businessAutomation;
    if (auto.awayEnabled && auto.awayMessage.trim()) {
      this.scheduleTimer(() => {
        this.sendMessage({
          chatId: chat.id,
          body: auto.awayMessage,
          type: 'text',
          skipLifecycleTimers: false,
          metadata: { businessAutomation: 'away' },
        });
      }, 650);
      return;
    }

    if (auto.greetingEnabled && auto.greetingMessage.trim() && !this.greetedChatIds.has(chat.id)) {
      this.greetedChatIds.add(chat.id);
      this.scheduleTimer(() => {
        this.sendMessage({
          chatId: chat.id,
          body: auto.greetingMessage,
          type: 'text',
          skipLifecycleTimers: false,
          metadata: { businessAutomation: 'greeting' },
        });
      }, 650);
    }
  }

  findMessage(messageId: string): Message | null {
    for (const list of Object.values(this.state.messages)) {
      const found = list.find((m) => m.id === messageId);
      if (found) return found;
    }
    return null;
  }

  updateMessageReceipt(messageId: string, status: MessageStatus): Message | null {
    for (const [chatId, list] of Object.entries(this.state.messages)) {
      const msg = list.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        this.persist();
        this.emit({ type: 'message:updated', payload: { chatId, message: msg } });
        this.recordWebhook(
          'message.status',
          buildCloudWebhookEnvelope('statuses', this.state.self.phone, {
            id: msg.id,
            status,
            timestamp: String(Math.floor(Date.now() / 1000)),
            chat_id: chatId,
          })
        );
        return msg;
      }
    }
    return null;
  }

  markChatRead(chatId: string): Chat | null {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;

    const msgs = this.state.messages[chatId] || [];
    const updated: Message[] = [];
    for (const msg of msgs) {
      if (msg.direction === 'inbound' && msg.status !== 'read') {
        msg.status = 'read';
        updated.push(msg);
      }
    }

    const hadUnread = chat.unreadCount > 0;
    chat.unreadCount = 0;

    if (hadUnread || updated.length > 0) {
      this.persist();
      this.emit({ type: 'chat:updated', payload: chat });
      for (const m of updated) {
        this.emit({ type: 'message:updated', payload: { chatId, message: m } });
      }
      if (updated.length > 0) {
        this.recordWebhook(
          'message.status',
          buildCloudWebhookEnvelope('statuses', this.state.self.phone, {
            id: updated[updated.length - 1].id,
            status: 'read',
            timestamp: String(Math.floor(Date.now() / 1000)),
            chat_id: chatId,
          })
        );
      }
    }
    return chat;
  }

  setTyping(chatId: string, contactId: string | null, mode: 'typing' | 'recording' | null): Chat | null {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;

    chat.typingContactId = contactId;
    chat.typingMode = contactId ? (mode || 'typing') : null;

    if (contactId) {
      const contact = this.state.contacts.find((c) => c.id === contactId);
      if (contact) {
        contact.presence = mode === 'recording' ? 'recording' : 'typing';
      }
    } else if (chat.contactId) {
      const contact = this.state.contacts.find((c) => c.id === chat.contactId);
      if (contact && (contact.presence === 'typing' || contact.presence === 'recording')) {
        contact.presence = 'online';
      }
    }

    this.emit({
      type: 'typing:updated',
      payload: { chatId, contactId: chat.typingContactId, mode: chat.typingMode },
    });

    this.recordWebhook(
      'presence.typing',
      buildCloudWebhookEnvelope('typing', this.state.self.phone, {
        chat_id: chatId,
        contact_id: contactId,
        state: chat.typingMode || 'idle',
      })
    );

    return chat;
  }

  // --- Config & Self Profile ---
  updateConfig(patch: {
    variant?: 'personal' | 'business';
    webhookUrl?: string;
    webhookSecret?: string;
    lifecycleDeliveredMs?: number;
    lifecycleReadMs?: number;
    autoMarkReadOnAutoReply?: boolean;
    self?: Partial<{ name: string; phone: string; about: string }>;
  }): { settings: EmulatorSettings; self: EmulatorState['self'] } {
    if (patch.variant === 'personal' || patch.variant === 'business') {
      this.state.settings.variant = patch.variant;
    }
    if (typeof patch.webhookUrl === 'string') {
      this.state.settings.webhookUrl = patch.webhookUrl.trim();
    }
    if (typeof patch.webhookSecret === 'string') {
      this.state.settings.webhookSecret = patch.webhookSecret.trim();
    }
    if (typeof patch.lifecycleDeliveredMs === 'number' && patch.lifecycleDeliveredMs >= 0) {
      this.state.settings.lifecycleDeliveredMs = patch.lifecycleDeliveredMs;
    }
    if (typeof patch.lifecycleReadMs === 'number' && patch.lifecycleReadMs >= 0) {
      this.state.settings.lifecycleReadMs = patch.lifecycleReadMs;
    }
    if (typeof patch.autoMarkReadOnAutoReply === 'boolean') {
      this.state.settings.autoMarkReadOnAutoReply = patch.autoMarkReadOnAutoReply;
    }
    if (patch.self) {
      if (typeof patch.self.name === 'string' && patch.self.name.trim()) {
        this.state.self.name = patch.self.name.trim();
      }
      if (typeof patch.self.phone === 'string' && patch.self.phone.trim()) {
        this.state.self.phone = patch.self.phone.trim();
      }
      if (typeof patch.self.about === 'string') {
        this.state.self.about = patch.self.about.trim();
      }
    }

    this.persist();
    this.emit({ type: 'config:updated', payload: { settings: this.state.settings, self: this.state.self } });
    return { settings: this.state.settings, self: this.state.self };
  }

  // --- Business Features ---
  updateBusinessProfile(patch: Partial<BusinessProfile>): BusinessProfile {
    Object.assign(this.state.settings.businessProfile, patch);
    this.persist();
    this.emit({ type: 'config:updated', payload: { settings: this.state.settings, self: this.state.self } });
    return this.state.settings.businessProfile;
  }

  updateBusinessAutomation(patch: Partial<BusinessAutomation>): BusinessAutomation {
    Object.assign(this.state.settings.businessAutomation, patch);
    this.persist();
    this.emit({ type: 'config:updated', payload: { settings: this.state.settings, self: this.state.self } });
    return this.state.settings.businessAutomation;
  }

  private emitBusinessUpdate(): void {
    this.persist();
    this.emit({
      type: 'business:updated',
      payload: {
        catalog: this.state.catalog,
        quickReplies: this.state.quickReplies,
        labels: this.state.labels,
        autoReplyRules: this.state.autoReplyRules,
      },
    });
  }

  upsertCatalogItem(item: Partial<CatalogItemRef> & { name: string; price: string }): CatalogItemRef {
    if (item.id) {
      const existing = this.state.catalog.find((c) => c.id === item.id);
      if (existing) {
        Object.assign(existing, item);
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created: CatalogItemRef = {
      id: `cat-${crypto.randomUUID().slice(0, 8)}`,
      name: item.name.trim(),
      price: item.price.trim(),
      currency: item.currency?.trim() || 'USD',
      description: item.description?.trim() || '',
      sku: item.sku?.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      imageUrl: item.imageUrl,
      inStock: item.inStock !== false,
    };
    this.state.catalog.unshift(created);
    this.emitBusinessUpdate();
    return created;
  }

  deleteCatalogItem(id: string): boolean {
    const idx = this.state.catalog.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.state.catalog.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }

  upsertQuickReply(input: Partial<QuickReply> & { shortcut: string; message: string }): QuickReply {
    const cleanShortcut = input.shortcut.replace(/^\/+/, '').trim().toLowerCase();
    if (input.id) {
      const existing = this.state.quickReplies.find((q) => q.id === input.id);
      if (existing) {
        existing.shortcut = cleanShortcut;
        existing.message = input.message.trim();
        existing.keywords = input.keywords || existing.keywords;
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created: QuickReply = {
      id: `qr-${crypto.randomUUID().slice(0, 8)}`,
      shortcut: cleanShortcut,
      message: input.message.trim(),
      keywords: input.keywords || [],
    };
    this.state.quickReplies.unshift(created);
    this.emitBusinessUpdate();
    return created;
  }

  deleteQuickReply(id: string): boolean {
    const idx = this.state.quickReplies.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    this.state.quickReplies.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }

  upsertLabel(input: Partial<BusinessLabel> & { name: string; color: string }): BusinessLabel {
    if (input.id) {
      const existing = this.state.labels.find((l) => l.id === input.id);
      if (existing) {
        existing.name = input.name.trim();
        existing.color = input.color;
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created: BusinessLabel = {
      id: `lbl-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      color: input.color,
    };
    this.state.labels.push(created);
    this.emitBusinessUpdate();
    return created;
  }

  deleteLabel(id: string): boolean {
    const idx = this.state.labels.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    this.state.labels.splice(idx, 1);
    for (const chat of this.state.chats) {
      if (chat.labelIds.includes(id)) {
        chat.labelIds = chat.labelIds.filter((lid) => lid !== id);
        this.emit({ type: 'chat:updated', payload: chat });
      }
    }
    this.emitBusinessUpdate();
    return true;
  }

  upsertAutoReplyRule(input: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }): AutoReplyRule {
    if (input.id) {
      const existing = this.state.autoReplyRules.find((r) => r.id === input.id);
      if (existing) {
        Object.assign(existing, {
          name: input.name.trim(),
          pattern: input.pattern,
          reply: input.reply,
          matchType: input.matchType || existing.matchType,
          enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled,
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : existing.delayMs,
          simulateTypingMs: typeof input.simulateTypingMs === 'number' ? input.simulateTypingMs : existing.simulateTypingMs,
          contactId: input.contactId,
        });
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created: AutoReplyRule = {
      id: `rule-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      enabled: input.enabled !== false,
      matchType: input.matchType || 'contains',
      pattern: input.pattern,
      reply: input.reply,
      contactId: input.contactId,
      delayMs: typeof input.delayMs === 'number' ? input.delayMs : 700,
      simulateTypingMs: typeof input.simulateTypingMs === 'number' ? input.simulateTypingMs : 500,
    };
    this.state.autoReplyRules.unshift(created);
    this.emitBusinessUpdate();
    return created;
  }

  deleteAutoReplyRule(id: string): boolean {
    const idx = this.state.autoReplyRules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.state.autoReplyRules.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }

  clearWebhookLogs(): void {
    this.state.webhookLogs = [];
    this.persist();
    this.emit({ type: 'state:sync', payload: this.state });
  }
}
