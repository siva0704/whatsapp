import crypto from 'crypto';
import type {
  AutoReplyRule,
  BroadcastCreateRequest,
  BroadcastJob,
  BroadcastRecipientRecord,
  BulkSeedRequest,
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CallLogItem,
  CatalogItemRef,
  Chat,
  ClientPersonality,
  ClientResponseSimulationRequest,
  Contact,
  ContactCardPayload,
  ConversationBillingRecord,
  ConversationCategory,
  EmulatorSettings,
  EmulatorState,
  FailureInjectionConfig,
  InteractivePayload,
  LocationPayload,
  MediaAttachment,
  MediaRecord,
  Message,
  MessageError,
  MessageStatus,
  MessageTemplate,
  MessageType,
  OptInStatus,
  OrderPayload,
  PhoneNumberConfig,
  QuickReply,
  QuotedMessageRef,
  RateLimitConfig,
  ServerWsEvent,
  StatusUpdateItem,
  TemplateApprovalStatus,
  WebhookLogEntry,
} from '../shared/types';
import {
  DEFAULT_FAILURE_INJECTION,
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  createBroadcastRollGenerator,
  evaluateFailureInjection,
  resolveRecipientTemplateVariables,
  selectBroadcastRecipients,
} from './broadcast';
import {
  META_ERRORS,
  TWENTY_FOUR_HOURS_MS,
  detectOptInKeyword,
  extractLinkPreview,
  getCustomerServiceWindowStatus,
  isValidE164,
  normalizeE164,
  renderTemplateBody,
} from './compliance';
import {
  type EmulatorEnvConfig,
  toContactFromSeed,
  toRuleFromSeed,
} from './config';
import {
  buildContactFromClientSeed,
  computeClientAutoResponse,
  generateSeededClients,
  loadClientSeedFile,
} from './seeder';
import type { StateStore } from './storage';
import { buildCloudWebhookEnvelope, dispatchWebhook } from './webhooks';

export type EngineListener = (event: ServerWsEvent) => void;

export interface SendMessageParams {
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
  templateName?: string;
  templateId?: string;
  templateVariables?: string[];
  templateOtpCode?: string;
  templateHeaderImageUrl?: string;
  catalogItemId?: string;
  carouselItemIds?: string[];
  order?: OrderPayload;
  replyToMessageId?: string;
  skipLifecycleTimers?: boolean;
  simulateErrorCode?: number;
  broadcastId?: string;
  failureRollPercent?: number;
  deferPersist?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ReceiveMessageParams {
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
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  ok: boolean;
  message?: Message;
  chat?: Chat;
  error?: MessageError;
  httpStatus?: number;
}

export interface CloudApiNormalizedSend {
  toPhone: string;
  type: MessageType;
  body: string;
  media?: MediaAttachment;
  mediaId?: string;
  location?: LocationPayload;
  contacts?: ContactCardPayload[];
  interactive?: InteractivePayload;
  templateName?: string;
  templateVariables?: string[];
  templateOtpCode?: string;
  templateHeaderImageUrl?: string;
}

export function normalizeCloudApiSendPayload(
  payload: Record<string, unknown>
): CloudApiNormalizedSend | null {
  const to = typeof payload.to === 'string' ? payload.to.trim() : '';
  if (!to) return null;

  const rawType = typeof payload.type === 'string' ? payload.type : 'text';

  if (rawType === 'text') {
    const textObj = payload.text as Record<string, unknown> | undefined;
    const body = typeof textObj?.body === 'string' ? textObj.body : '';
    if (!body) return null;
    return { toPhone: to, type: 'text', body };
  }

  if (rawType === 'image' || rawType === 'video' || rawType === 'audio' || rawType === 'document' || rawType === 'sticker') {
    const mediaObj = payload[rawType] as Record<string, unknown> | undefined;
    const mediaId = typeof mediaObj?.id === 'string' ? mediaObj.id : undefined;
    const link = typeof mediaObj?.link === 'string' ? mediaObj.link : '';
    const caption = typeof mediaObj?.caption === 'string' ? mediaObj.caption : '';
    const filename = typeof mediaObj?.filename === 'string' ? mediaObj.filename : undefined;
    const defaultMime: Record<string, string> = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: 'audio/ogg',
      document: 'application/pdf',
      sticker: 'image/webp',
    };
    return {
      toPhone: to,
      type: rawType === 'audio' ? 'voice' : (rawType as MessageType),
      body: caption || filename || (rawType === 'sticker' ? 'Sticker' : rawType),
      mediaId,
      media: mediaId
        ? undefined
        : {
            id: `ext_${crypto.randomUUID().slice(0, 8)}`,
            url: link,
            mimeType: defaultMime[rawType],
            filename,
            caption: caption || undefined,
            durationSec: rawType === 'audio' ? 8 : undefined,
          },
    };
  }

  if (rawType === 'location') {
    const loc = payload.location as Record<string, unknown> | undefined;
    if (typeof loc?.latitude !== 'number' || typeof loc?.longitude !== 'number') return null;
    return {
      toPhone: to,
      type: 'location',
      body: typeof loc.name === 'string' ? loc.name : `${loc.latitude}, ${loc.longitude}`,
      location: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: typeof loc.name === 'string' ? loc.name : undefined,
        address: typeof loc.address === 'string' ? loc.address : undefined,
      },
    };
  }

  if (rawType === 'contacts') {
    const arr = Array.isArray(payload.contacts) ? payload.contacts : [];
    const cards: ContactCardPayload[] = arr.map((c: Record<string, unknown>) => {
      const nameObj = c.name as Record<string, unknown> | undefined;
      const phones = Array.isArray(c.phones) ? (c.phones as Array<Record<string, unknown>>) : [];
      const orgObj = c.org as Record<string, unknown> | undefined;
      return {
        name: String(nameObj?.formatted_name || c.name || 'Contact'),
        phone: String(phones[0]?.phone || c.phone || ''),
        org: typeof orgObj?.company === 'string' ? orgObj.company : undefined,
      };
    });
    if (cards.length === 0) return null;
    return {
      toPhone: to,
      type: 'contacts',
      body: cards.map((c) => c.name).join(', '),
      contacts: cards,
    };
  }

  if (rawType === 'interactive') {
    const inter = payload.interactive as Record<string, unknown> | undefined;
    if (!inter) return null;
    const interType = String(inter.type || 'button');
    const bodyObj = inter.body as Record<string, unknown> | undefined;
    const headerObj = inter.header as Record<string, unknown> | undefined;
    const footerObj = inter.footer as Record<string, unknown> | undefined;
    const actionObj = inter.action as Record<string, unknown> | undefined;
    const bodyText = typeof bodyObj?.text === 'string' ? bodyObj.text : 'Interactive message';

    if (interType === 'list') {
      const sectionsRaw = Array.isArray(actionObj?.sections) ? actionObj.sections : [];
      const sections = sectionsRaw.map((s: Record<string, unknown>) => ({
        title: String(s.title || 'Options'),
        rows: Array.isArray(s.rows)
          ? (s.rows as Array<Record<string, unknown>>).map((r) => ({
              id: String(r.id || crypto.randomUUID().slice(0, 6)),
              title: String(r.title || 'Option'),
              description: typeof r.description === 'string' ? r.description : undefined,
            }))
          : [],
      }));
      return {
        toPhone: to,
        type: 'interactive',
        body: bodyText,
        interactive: {
          kind: 'list',
          headerText: typeof headerObj?.text === 'string' ? headerObj.text : undefined,
          bodyText,
          footerText: typeof footerObj?.text === 'string' ? footerObj.text : undefined,
          listButtonText: typeof actionObj?.button === 'string' ? actionObj.button : 'Select option',
          sections,
        },
      };
    }

    if (interType === 'cta_url') {
      const params = actionObj?.parameters as Record<string, unknown> | undefined;
      return {
        toPhone: to,
        type: 'interactive',
        body: bodyText,
        interactive: {
          kind: 'cta_url',
          headerText: typeof headerObj?.text === 'string' ? headerObj.text : undefined,
          bodyText,
          footerText: typeof footerObj?.text === 'string' ? footerObj.text : undefined,
          ctaDisplayText: String(params?.display_text || 'Open Link'),
          ctaUrl: String(params?.url || 'https://example.com'),
        },
      };
    }

    const buttonsRaw = Array.isArray(actionObj?.buttons) ? actionObj.buttons : [];
    const buttons = buttonsRaw.map((b: Record<string, unknown>) => {
      const reply = b.reply as Record<string, unknown> | undefined;
      return {
        id: String(reply?.id || b.id || crypto.randomUUID().slice(0, 6)),
        title: String(reply?.title || b.title || 'Reply'),
      };
    });
    return {
      toPhone: to,
      type: 'interactive',
      body: bodyText,
      interactive: {
        kind: 'button',
        headerText: typeof headerObj?.text === 'string' ? headerObj.text : undefined,
        bodyText,
        footerText: typeof footerObj?.text === 'string' ? footerObj.text : undefined,
        buttons,
      },
    };
  }

  if (rawType === 'template') {
    const tpl = payload.template as Record<string, unknown> | undefined;
    const name = typeof tpl?.name === 'string' ? tpl.name : '';
    if (!name) return null;
    const components = Array.isArray(tpl?.components)
      ? (tpl.components as Array<Record<string, unknown>>)
      : [];
    const variables: string[] = [];
    let otpCode: string | undefined;
    let headerImageUrl: string | undefined;

    for (const comp of components) {
      const params = Array.isArray(comp.parameters)
        ? (comp.parameters as Array<Record<string, unknown>>)
        : [];
      if (comp.type === 'header') {
        for (const p of params) {
          if (p.type === 'image' && p.image) {
            const imgObj = p.image as Record<string, unknown>;
            if (typeof imgObj.link === 'string') headerImageUrl = imgObj.link;
            else if (typeof imgObj.id === 'string') headerImageUrl = imgObj.id;
          }
        }
      }
      if (comp.type === 'body') {
        for (const p of params) {
          if (typeof p.text === 'string') variables.push(p.text);
        }
      } else if (comp.type === 'button' && comp.sub_type === 'url') {
        const first = params[0];
        if (typeof first?.text === 'string') otpCode = first.text;
      }
    }
    return {
      toPhone: to,
      type: 'template',
      body: `[Template: ${name}]`,
      templateName: name,
      templateVariables: variables,
      templateOtpCode: otpCode,
      templateHeaderImageUrl: headerImageUrl,
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
        // Ignore malformed regex
      }
    }
  }
  return null;
}

export function createSeedState(env: EmulatorEnvConfig): EmulatorState {
  const now = Date.now();
  const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  const defaultBusinessProfile: BusinessProfile = {
    name: env.selfName || 'WhatsApp Business',
    category: '',
    description: '',
    address: '',
    hours: '',
    email: '',
    website: '',
    verified: false,
  };

  // Strictly empty unless explicitly configured via .env
  const phoneNumbers: PhoneNumberConfig[] = [];

  if (env.selfPhone && isValidE164(normalizeE164(env.selfPhone))) {
    phoneNumbers.push({
      id: 'phone-primary',
      wabaId: 'waba-primary',
      phoneNumber: normalizeE164(env.selfPhone),
      displayName: env.selfName || 'Primary Number',
      verifiedName: env.selfName || 'WhatsApp Business',
      qualityRating: 'GREEN',
      webhookUrl: '',
      businessProfile: { ...defaultBusinessProfile },
    });
  }

  env.phoneNumbers.forEach((seed) => {
    const normalized = normalizeE164(seed.phoneNumber);
    if (normalized && isValidE164(normalized) && !phoneNumbers.some((p) => p.id === seed.id)) {
      phoneNumbers.push({
        id: seed.id,
        wabaId: seed.wabaId || 'waba-primary',
        phoneNumber: normalized,
        displayName: seed.displayName,
        verifiedName: seed.verifiedName || seed.displayName,
        qualityRating: 'GREEN',
        webhookUrl: seed.webhookUrl || '',
        businessProfile: {
          ...defaultBusinessProfile,
          name: seed.displayName,
        },
      });
    }
  });

  const activePhoneNumberId = phoneNumbers[0]?.id || '';

  const contacts: Contact[] = [];
  env.preloadedContacts.forEach((seed, idx) => {
    const norm = normalizeE164(seed.phone);
    if (norm && !contacts.some((c) => c.phone === norm)) {
      contacts.push(toContactFromSeed({ ...seed, phone: norm }, idx));
    }
  });

  const chats: Chat[] = [];
  env.preloadedContacts.forEach((seed, idx) => {
    const contactId = `contact-env-${idx + 1}`;
    if (contacts.some((c) => c.id === contactId) && !chats.some((c) => c.contactId === contactId)) {
      chats.push({
        id: `chat-env-${idx + 1}`,
        type: 'direct',
        phoneNumberId: activePhoneNumberId,
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
        lastMessageAt: minsAgo(idx),
        lastInboundAt: null,
        conversationCategory: 'SERVICE',
      });
    }
  });

  const autoReplyRules: AutoReplyRule[] = env.autoReplyRules.map((seed, idx) =>
    toRuleFromSeed(seed, idx)
  );

  return {
    self: {
      id: 'me',
      name: env.selfName || 'WhatsApp Business',
      phone: env.selfPhone ? normalizeE164(env.selfPhone) : '',
      about: '',
    },
    settings: {
      variant: env.variant,
      activePhoneNumberId,
      webhookUrl: env.webhookUrl,
      webhookSecret: env.webhookSecret,
      apiKeyConfigured: Boolean(env.apiKey),
      lifecycleDeliveredMs: env.lifecycleDeliveredMs,
      lifecycleReadMs: env.lifecycleReadMs,
      autoMarkReadOnAutoReply: true,
      enforce24hWindow: env.enforce24hWindow,
      enforceOptIn: env.enforceOptIn,
      pricingRatesUsd: env.pricingRatesUsd,
      businessProfile: defaultBusinessProfile,
      businessAutomation: {
        greetingEnabled: false,
        greetingMessage: '',
        awayEnabled: false,
        awayMessage: '',
        awaySchedule: 'outside_hours',
      },
    },
    phoneNumbers,
    contacts,
    chats,
    messages: {},
    templates: [],
    catalog: [],
    quickReplies: [],
    labels: [],
    autoReplyRules,
    mediaIndex: {},
    conversations: [],
    webhookLogs: [],
    statusUpdates: [],
    callLogs: [],
    broadcasts: [],
    failureInjection: { ...DEFAULT_FAILURE_INJECTION },
    rateLimits: {
      ...DEFAULT_RATE_LIMITS,
      messagesPerSecond: env.rateLimitPerSecond ?? DEFAULT_RATE_LIMITS.messagesPerSecond,
      messagesPerMinute: env.rateLimitPerMinute ?? DEFAULT_RATE_LIMITS.messagesPerMinute,
      pairMessagesPerMinute:
        env.pairRateLimitPerMinute ?? DEFAULT_RATE_LIMITS.pairMessagesPerMinute,
      dailyTemplateLimit: env.dailyTemplateLimit ?? DEFAULT_RATE_LIMITS.dailyTemplateLimit,
    },
    rateLimitUsage: {
      windowSecondCounts: {},
      windowMinuteCounts: {},
      dailyTemplatesSent: 0,
      dailyResetAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString(),
      totalThrottled: 0,
    },
  };
}

export class EmulatorEngine {
  private state: EmulatorState;
  private readonly store: StateStore;
  private readonly env: EmulatorEnvConfig;
  private readonly listeners = new Set<EngineListener>();
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly greetedChatIds = new Set<string>();
  private readonly rateLimiter = new RateLimiter();
  private readonly broadcastMessageIndex = new Map<
    string,
    { broadcastId: string; contactId: string }
  >();
  private readonly broadcastPayloads = new Map<string, BroadcastCreateRequest>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly broadcastEmitTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(store: StateStore, env: EmulatorEnvConfig) {
    this.store = store;
    this.env = env;
    const loaded = store.load();
    if (loaded && loaded.phoneNumbers && loaded.templates) {
      this.state = loaded;
      this.state.settings.apiKeyConfigured = Boolean(env.apiKey);
      // Seamlessly upgrade Phase 2 persisted files to Phase 3 schema
      if (!Array.isArray(this.state.broadcasts)) this.state.broadcasts = [];
      if (!this.state.failureInjection) {
        this.state.failureInjection = { ...DEFAULT_FAILURE_INJECTION };
      }
      if (!this.state.rateLimits) {
        this.state.rateLimits = {
          ...DEFAULT_RATE_LIMITS,
          messagesPerSecond: env.rateLimitPerSecond ?? DEFAULT_RATE_LIMITS.messagesPerSecond,
          messagesPerMinute: env.rateLimitPerMinute ?? DEFAULT_RATE_LIMITS.messagesPerMinute,
          pairMessagesPerMinute:
            env.pairRateLimitPerMinute ?? DEFAULT_RATE_LIMITS.pairMessagesPerMinute,
          dailyTemplateLimit: env.dailyTemplateLimit ?? DEFAULT_RATE_LIMITS.dailyTemplateLimit,
        };
      }
      this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    } else {
      this.state = createSeedState(env);
      this.applyEnvClientSeeds();
      this.persist();
    }
  }

  private applyEnvClientSeeds(): void {
    if (this.env.clientSeedFile) {
      const fileClients = loadClientSeedFile(this.env.clientSeedFile);
      if (fileClients.length > 0) {
        this.bulkSeedClients({ clients: fileClients }, true);
      }
    }
    if (this.env.clientSeedCount && this.env.clientSeedCount > 0) {
      this.bulkSeedClients({ count: this.env.clientSeedCount, seed: 202604 }, true);
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
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.store.save(this.state);
  }

  private persistDeferred(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.store.save(this.state);
    }, 180);
    this.pendingTimers.add(this.persistTimer);
  }

  private scheduleTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout> | null {
    if (ms <= 0) {
      fn();
      return null;
    }
    const t = setTimeout(() => {
      this.pendingTimers.delete(t);
      fn();
    }, ms);
    this.pendingTimers.add(t);
    return t;
  }

  clearTimers(): void {
    for (const t of this.pendingTimers) {
      clearTimeout(t);
    }
    this.pendingTimers.clear();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (const t of this.broadcastEmitTimers.values()) {
      clearTimeout(t);
    }
    this.broadcastEmitTimers.clear();
  }

  getState(): EmulatorState {
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    return this.state;
  }

  getPhoneConfig(phoneNumberId?: string): PhoneNumberConfig {
    const id = phoneNumberId || this.state.settings.activePhoneNumberId;
    return (
      this.state.phoneNumbers.find((p) => p.id === id) ||
      this.state.phoneNumbers[0] || {
        id: id || 'default',
        wabaId: 'waba-primary',
        phoneNumber: this.state.self.phone || '',
        displayName: this.state.self.name || 'WhatsApp Business',
        verifiedName: this.state.self.name || 'WhatsApp Business',
        qualityRating: 'GREEN',
        webhookUrl: this.state.settings.webhookUrl || '',
        businessProfile: this.state.settings.businessProfile,
      }
    );
  }

  reset(variantOverride?: 'personal' | 'business'): EmulatorState {
    this.clearTimers();
    this.greetedChatIds.clear();
    this.rateLimiter.reset();
    this.broadcastMessageIndex.clear();
    this.broadcastPayloads.clear();
    const effectiveEnv = variantOverride
      ? { ...this.env, variant: variantOverride }
      : this.env;
    this.state = createSeedState(effectiveEnv);
    this.applyEnvClientSeeds();
    this.persist();
    this.emit({ type: 'state:sync', payload: this.state });
    return this.state;
  }

  private recordWebhook(
    event: string,
    payload: Record<string, unknown>,
    phoneNumberId?: string
  ): void {
    const phoneCfg = this.getPhoneConfig(phoneNumberId);
    const targetUrl = phoneCfg.webhookUrl || this.state.settings.webhookUrl;
    const { webhookSecret } = this.state.settings;

    void dispatchWebhook({
      event,
      phoneNumberId: phoneCfg.id,
      targetUrl,
      secret: webhookSecret,
      payload,
    }).then((entry: WebhookLogEntry) => {
      this.state.webhookLogs = [entry, ...this.state.webhookLogs].slice(0, 80);
      this.persist();
      this.emit({ type: 'webhook:logged', payload: entry });
    });
  }

  private trackConversationBilling(
    chat: Chat,
    category: ConversationCategory,
    messageId: string
  ): void {
    const now = Date.now();
    const activeExisting = this.state.conversations.find(
      (c) =>
        c.chatId === chat.id &&
        c.category === category &&
        new Date(c.expiresAt).getTime() > now
    );
    chat.conversationCategory = category;
    if (activeExisting) return;

    const rate = this.state.settings.pricingRatesUsd[category] ?? 0;
    const record: ConversationBillingRecord = {
      id: `conv_${crypto.randomUUID().slice(0, 10)}`,
      chatId: chat.id,
      phoneNumberId: chat.phoneNumberId,
      category,
      billable: rate > 0,
      estimatedCostUsd: rate,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TWENTY_FOUR_HOURS_MS).toISOString(),
      messageId,
    };
    this.state.conversations = [record, ...this.state.conversations].slice(0, 200);
    this.emitBusinessUpdate();
  }

  // --- Media Index ---
  registerMedia(record: MediaRecord): MediaRecord {
    this.state.mediaIndex[record.id] = record;
    this.persist();
    return record;
  }

  getMediaRecord(id: string): MediaRecord | null {
    return this.state.mediaIndex[id] || null;
  }

  // --- Phone Numbers / WABA ---
  upsertPhoneNumber(input: {
    id?: string;
    phoneNumber: string;
    displayName: string;
    verifiedName?: string;
    wabaId?: string;
    webhookUrl?: string;
    qualityRating?: 'GREEN' | 'YELLOW' | 'RED';
  }): { ok: boolean; phoneNumber?: PhoneNumberConfig; error?: string } {
    const normalized = normalizeE164(input.phoneNumber);
    if (!isValidE164(normalized)) {
      return { ok: false, error: 'Phone number must be valid E.164 format (e.g. +14155550199).' };
    }

    if (input.id) {
      const existing = this.state.phoneNumbers.find((p) => p.id === input.id);
      if (existing) {
        existing.phoneNumber = normalized;
        existing.displayName = input.displayName.trim() || existing.displayName;
        if (input.verifiedName) existing.verifiedName = input.verifiedName.trim();
        if (typeof input.webhookUrl === 'string') existing.webhookUrl = input.webhookUrl.trim();
        if (input.qualityRating) existing.qualityRating = input.qualityRating;
        this.persist();
        this.emitConfigUpdate();
        this.recordWebhook(
          'account.update',
          buildCloudWebhookEnvelope('account_update', existing, {
            event: 'PHONE_NUMBER_NAME_UPDATE',
            phone_number_id: existing.id,
            display_phone_number: existing.phoneNumber,
            verified_name: existing.verifiedName,
          }),
          existing.id
        );
        return { ok: true, phoneNumber: existing };
      }
    }

    const created: PhoneNumberConfig = {
      id: input.id?.trim() || `phone-${crypto.randomUUID().slice(0, 8)}`,
      wabaId: input.wabaId?.trim() || 'waba-primary',
      phoneNumber: normalized,
      displayName: input.displayName.trim() || normalized,
      verifiedName: input.verifiedName?.trim() || input.displayName.trim() || normalized,
      qualityRating: input.qualityRating || 'GREEN',
      webhookUrl: input.webhookUrl?.trim() || '',
      businessProfile: {
        ...this.state.settings.businessProfile,
        name: input.displayName.trim() || normalized,
      },
    };
    this.state.phoneNumbers.push(created);
    if (!this.state.settings.activePhoneNumberId) {
      this.state.settings.activePhoneNumberId = created.id;
    }
    if (!this.state.self.phone) {
      this.state.self.phone = created.phoneNumber;
    }
    this.persist();
    this.emitConfigUpdate();
    return { ok: true, phoneNumber: created };
  }

  // --- Contacts & Compliance (E.164, Block/Unblock, Opt-In/Out) ---
  createContact(input: {
    name: string;
    profileName?: string;
    phone: string;
    about?: string;
    isBot?: boolean;
    isBusiness?: boolean;
    avatarUrl?: string;
    optInStatus?: OptInStatus;
    optInSource?: string;
  }): { contact: Contact; chat: Chat; error?: string } {
    const cleanPhone = normalizeE164(input.phone);
    if (!isValidE164(cleanPhone)) {
      throw new Error('Invalid E.164 phone number (expected + followed by 7-15 digits, e.g. +14155550199)');
    }

    const existing = this.state.contacts.find((c) => c.phone === cleanPhone);
    if (existing) {
      const existingChat = this.ensureDirectChat(existing);
      return { contact: existing, chat: existingChat };
    }

    const now = new Date().toISOString();
    const optStatus: OptInStatus = input.optInStatus || 'opted_in';
    const optSource = input.optInSource || 'manual';
    const palette = ['#00a884', '#53bdeb', '#7f66ff', '#e542a3', '#ff7b29', '#009de2'];
    const contact: Contact = {
      id: `contact-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim() || cleanPhone,
      profileName: input.profileName?.trim() || input.name.trim() || cleanPhone,
      phone: cleanPhone,
      avatarUrl: input.avatarUrl,
      avatarColor: palette[this.state.contacts.length % palette.length],
      about: input.about?.trim() || 'Hey there! I am using WhatsApp.',
      isBot: Boolean(input.isBot),
      isBusiness: Boolean(input.isBusiness),
      blocked: false,
      optInStatus: optStatus,
      optInUpdatedAt: now,
      optInSource: optSource,
      optInHistory: [
        {
          id: `opt-${crypto.randomUUID().slice(0, 8)}`,
          status: optStatus,
          timestamp: now,
          source: optSource,
          note: 'Initial contact registration',
        },
      ],
      presence: 'online',
      lastSeen: now,
    };

    this.state.contacts.push(contact);
    const chat = this.ensureDirectChat(contact);
    this.persist();
    this.emit({ type: 'contact:updated', payload: contact });
    this.emit({ type: 'chat:updated', payload: chat });
    return { contact, chat };
  }

  updateContact(
    id: string,
    patch: Partial<
      Pick<
        Contact,
        | 'name'
        | 'profileName'
        | 'phone'
        | 'about'
        | 'presence'
        | 'isBot'
        | 'isBusiness'
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
  ): Contact | null {
    const contact = this.state.contacts.find((c) => c.id === id);
    if (!contact) return null;

    if (patch.phone) {
      const norm = normalizeE164(patch.phone);
      if (!isValidE164(norm)) {
        throw new Error('Invalid E.164 phone number');
      }
      patch.phone = norm;
    }

    Object.assign(contact, patch);
    if (patch.presence === 'offline') {
      contact.lastSeen = new Date().toISOString();
    }

    const directChat = this.state.chats.find((c) => c.type === 'direct' && c.contactId === id);
    if (directChat && patch.name) {
      directChat.name = patch.name;
      this.emit({ type: 'chat:updated', payload: directChat });
    }

    this.persist();
    this.emit({ type: 'contact:updated', payload: contact });
    return contact;
  }

  setContactOptIn(
    contactIdOrPhone: string,
    status: OptInStatus,
    source: string,
    keyword?: string,
    note?: string
  ): Contact | null {
    const contact =
      this.state.contacts.find((c) => c.id === contactIdOrPhone) ||
      this.state.contacts.find((c) => c.phone === normalizeE164(contactIdOrPhone));
    if (!contact) return null;

    const now = new Date().toISOString();
    contact.optInStatus = status;
    contact.optInUpdatedAt = now;
    contact.optInSource = source;
    contact.optInHistory.unshift({
      id: `opt-${crypto.randomUUID().slice(0, 8)}`,
      status,
      timestamp: now,
      source,
      keyword,
      note,
    });

    this.persist();
    this.emit({ type: 'contact:updated', payload: contact });

    const phoneCfg = this.getPhoneConfig();
    this.recordWebhook(
      'account.opt_in_updated',
      buildCloudWebhookEnvelope('account_update', phoneCfg, {
        event: status === 'opted_out' ? 'CONTACT_OPT_OUT' : 'CONTACT_OPT_IN',
        contact_id: contact.id,
        wa_id: contact.phone.replace(/[^\d]/g, ''),
        phone: contact.phone,
        opt_in_status: status,
        source,
        keyword,
        timestamp: now,
      }),
      phoneCfg.id
    );

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

  private ensureDirectChat(contact: Contact, phoneNumberId?: string): Chat {
    let chat = this.state.chats.find((c) => c.type === 'direct' && c.contactId === contact.id);
    if (!chat) {
      chat = {
        id: `chat-${crypto.randomUUID().slice(0, 8)}`,
        type: 'direct',
        phoneNumberId: phoneNumberId || this.state.settings.activePhoneNumberId,
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
        lastInboundAt: null,
        conversationCategory: 'SERVICE',
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
      phoneNumberId: this.state.settings.activePhoneNumberId,
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
      lastInboundAt: now,
      conversationCategory: 'SERVICE',
    };

    const sysMsg: Message = {
      id: `msg-${crypto.randomUUID().slice(0, 10)}`,
      chatId: chat.id,
      phoneNumberId: chat.phoneNumberId,
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

  // --- Messaging (with 24h Window, Opt-In/Out, Block, Templates, Rich Types & Error Codes) ---
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

  private resolveMediaAttachment(
    media?: MediaAttachment,
    mediaId?: string
  ): MediaAttachment | undefined {
    if (mediaId) {
      const rec = this.state.mediaIndex[mediaId];
      if (rec) {
        return {
          id: rec.id,
          mediaId: rec.id,
          url: rec.url,
          mimeType: rec.mimeType,
          filename: rec.filename,
          sizeBytes: rec.sizeBytes,
          caption: media?.caption,
          durationSec: media?.durationSec,
          waveform: media?.waveform,
        };
      }
    }
    return media;
  }

  sendMessage(params: SendMessageParams): SendMessageResult {
    let chat: Chat | undefined;
    let directContact: Contact | undefined;

    if (params.chatId) {
      chat = this.state.chats.find((c) => c.id === params.chatId);
      if (chat?.contactId) {
        directContact = this.state.contacts.find((c) => c.id === chat!.contactId);
      }
    } else if (params.toPhone) {
      const cleanPhone = normalizeE164(params.toPhone);
      if (!isValidE164(cleanPhone)) {
        return {
          ok: false,
          httpStatus: 400,
          error: {
            code: 100,
            title: 'Invalid parameter',
            message: 'Recipient phone must be valid E.164 format (e.g. +14155550142).',
          },
        };
      }
      directContact = this.state.contacts.find((c) => c.phone === cleanPhone);
      if (!directContact) {
        const created = this.createContact({ name: cleanPhone, phone: cleanPhone });
        directContact = created.contact;
        chat = created.chat;
      } else {
        chat = this.ensureDirectChat(directContact, params.phoneNumberId);
      }
    }

    if (!chat) {
      return {
        ok: false,
        httpStatus: 404,
        error: { code: 100, title: 'Chat not found', message: 'Target chat could not be resolved.' },
      };
    }

    const phoneCfg = this.getPhoneConfig(params.phoneNumberId || chat.phoneNumberId);
    const isBusiness = this.state.settings.variant === 'business';
    const isTemplate = params.type === 'template' || Boolean(params.templateId || params.templateName);
    const recipientPhone = directContact?.phone || params.toPhone || chat.id;

    // 0a. Rate-limit check (per-number throughput, per-pair 131056, aggregate daily template 130429)
    const rateRes = this.rateLimiter.checkAndConsume(
      this.state.rateLimits,
      phoneCfg.id,
      recipientPhone,
      isTemplate
    );
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    if (!rateRes.ok) {
      return this.recordFailedOutbound(
        chat,
        phoneCfg,
        params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : '[Rate limited]'),
        isTemplate ? 'template' : params.type || 'text',
        rateRes.error,
        rateRes.httpStatus,
        params.deferPersist
      );
    }

    // 0b. Failure-injection check (configurable QA failure simulation)
    if (this.state.failureInjection.enabled) {
      const roll =
        typeof params.failureRollPercent === 'number'
          ? params.failureRollPercent
          : Math.random() * 100;
      const injected = evaluateFailureInjection(this.state.failureInjection, roll, recipientPhone);
      if (injected) {
        return this.recordFailedOutbound(
          chat,
          phoneCfg,
          params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : '[Injected failure]'),
          isTemplate ? 'template' : params.type || 'text',
          injected.error,
          injected.httpStatus,
          params.deferPersist
        );
      }
    }

    // 0c. Invalid or disabled client number check (seeded personal WhatsApp numbers)
    if (directContact?.invalidNumber) {
      const err = META_ERRORS.INVALID_RECIPIENT(
        `Recipient ${directContact.phone} is not a valid WhatsApp account.`
      );
      return this.recordFailedOutbound(
        chat,
        phoneCfg,
        params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : '[Invalid recipient]'),
        isTemplate ? 'template' : params.type || 'text',
        err,
        400,
        params.deferPersist
      );
    }

    if (directContact?.disabled) {
      const err = META_ERRORS.DISABLED_NUMBER(
        `Recipient ${directContact.phone} is disabled or unreachable.`
      );
      return this.recordFailedOutbound(
        chat,
        phoneCfg,
        params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : '[Disabled number]'),
        isTemplate ? 'template' : params.type || 'text',
        err,
        400,
        params.deferPersist
      );
    }

    // 1. Blocked contact check (rejects outbound per Meta behavior)
    if (directContact?.blocked) {
      const err = META_ERRORS.CONTACT_BLOCKED(
        `Cannot send to ${directContact.phone}: contact is blocked.`
      );
      return this.recordFailedOutbound(chat, phoneCfg, params.body || '[Blocked send]', params.type || 'text', err, 403, params.deferPersist);
    }

    // 2. Opt-out enforcement: business-initiated template messages are blocked when contact is opted out.
    //    Inbound-triggered session replies within an active 24h window remain allowed.
    if (isBusiness && this.state.settings.enforceOptIn && directContact && directContact.optInStatus === 'opted_out') {
      if (isTemplate) {
        const err = META_ERRORS.RECIPIENT_OPTED_OUT(
          `Contact ${directContact.phone} opted out (${directContact.optInSource}). Business-initiated templates are blocked until re-opt-in (e.g. START).`
        );
        return this.recordFailedOutbound(chat, phoneCfg, params.body || `[Template: ${params.templateName || params.templateId}]`, 'template', err, 403, params.deferPersist);
      }
    }

    // 3. 24-hour customer service window enforcement (Business mode, direct chats)
    if (
      isBusiness &&
      this.state.settings.enforce24hWindow &&
      chat.type === 'direct' &&
      !isTemplate
    ) {
      const windowStatus = getCustomerServiceWindowStatus(chat.lastInboundAt);
      if (!windowStatus.open) {
        const err = META_ERRORS.RE_ENGAGEMENT_REQUIRED(
          `24-hour customer service window closed for ${chat.name}. Send an APPROVED template message or wait for a new inbound customer message.`
        );
        return this.recordFailedOutbound(chat, phoneCfg, params.body || '[Session message blocked]', params.type || 'text', err, 400, params.deferPersist);
      }
    }

    // 4. Template resolution & approval check
    let templatePayload: Message['template'];
    let resolvedCategory: ConversationCategory = 'SERVICE';
    let msgType: MessageType = params.type || 'text';
    let body = params.body || '';

    if (isTemplate) {
      let tpl = this.state.templates.find(
        (t) =>
          (params.templateId && t.id === params.templateId) ||
          (params.templateName && t.name.toLowerCase() === params.templateName.toLowerCase())
      );

      // Resilient Auto-Registration for Testing / SIT / Emulation when template is missing
      if (!tpl) {
        const rawName = (params.templateName || params.templateId || 'broadcast_template').trim();
        const cleanName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const isBday = cleanName.includes('birthday') || cleanName.includes('bday');
        const isFest = cleanName.includes('festival') || cleanName.includes('festive') || cleanName.includes('diwali');

        tpl = this.upsertTemplate({
          name: cleanName,
          category: isBday ? 'UTILITY' : 'MARKETING',
          status: 'APPROVED',
          bodyText:
            params.body && !params.body.startsWith('[Template:')
              ? params.body
              : isBday
              ? 'Dear {{1}}, Wealth Transformers India wishes you a very Happy Birthday! 🎂 May this year bring you compounding prosperity, success, and good health.'
              : isFest
              ? 'Dear {{1}}, on this auspicious festive season, Wealth Transformers brings you 0% brokerage on delivery trades and 50% discount on PMS wealth advisory! Reply START to activate your festive benefits.'
              : 'Dear {{1}}, here is an important announcement and market update from Wealth Transformers India Pvt Ltd.',
          headerText: isBday
            ? 'Happy Birthday from Wealth Transformers! 🎂'
            : isFest
            ? 'Exclusive Festive Advisory Offer! 🚀'
            : 'Exclusive Market Announcement 📢',
          headerImageUrl: isBday
            ? 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80'
            : isFest
            ? 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80'
            : 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80',
          footerText: undefined,
          buttons: [
            {
              type: 'URL',
              text: isBday ? 'View Birthday Gift' : 'Claim Offer',
              url: 'https://wealthtrade.in/offers',
            },
          ],
          sampleValues: ['Valued Client'],
        });
      }

      if (!tpl || tpl.status !== 'APPROVED') {
        const err = META_ERRORS.TEMPLATE_NOT_APPROVED(
          tpl
            ? `Template "${tpl.name}" has status ${tpl.status} (must be APPROVED).`
            : `Template "${params.templateName || params.templateId}" was not found.`
        );
        return { ok: false, httpStatus: 400, error: err };
      }

      const contactObj = chat.contactId ? this.state.contacts.find((c) => c.id === chat.contactId) : undefined;
      const parsedVars = params.templateVariables && params.templateVariables.length > 0 ? params.templateVariables : [];
      const recipientName =
        parsedVars[0] ||
        contactObj?.name ||
        (chat.name && !chat.name.startsWith('+') ? chat.name : 'Valued Client');

      const vars =
        parsedVars.length > 0
          ? parsedVars
          : (tpl.sampleValues && tpl.sampleValues.length > 0 ? tpl.sampleValues : [recipientName]);

      let renderedBody = renderTemplateBody(tpl.bodyText, vars);
      renderedBody = renderedBody
        .replace(/\{\{1\}\}/g, recipientName)
        .replace(/\{\{name\}\}/gi, recipientName)
        .replace(/\{\{first_name\}\}/gi, recipientName.split(/\s+/)[0] || recipientName);

      // Auto-update chat name so recipient displays their actual full name in WA-Sim sidebar
      if (recipientName && recipientName !== 'Valued Client' && chat.name.startsWith('+')) {
        chat.name = recipientName;
      }

      templatePayload = {
        templateId: tpl.id,
        templateName: tpl.name,
        language: tpl.language,
        category: tpl.category,
        headerText: tpl.headerText,
        headerImageUrl: params.templateHeaderImageUrl || tpl.headerImageUrl,
        renderedBody,
        footerText: tpl.footerText,
        buttons: tpl.buttons,
        variables: vars,
        otpCode: params.templateOtpCode || (tpl.category === 'AUTHENTICATION' ? vars[0] : undefined),
      };
      msgType = 'template';
      body = renderedBody;
      resolvedCategory = tpl.category;
    }

    // 5. Catalog single item or product carousel
    let catalogItem: CatalogItemRef | undefined;
    let carouselItems: CatalogItemRef[] | undefined;

    if (params.catalogItemId) {
      catalogItem = this.state.catalog.find((item) => item.id === params.catalogItemId);
      if (catalogItem) {
        msgType = 'catalog_item';
        if (!body) body = `${catalogItem.name} — ${catalogItem.currency} ${catalogItem.price}`;
      }
    } else if (params.carouselItemIds && params.carouselItemIds.length > 0) {
      carouselItems = params.carouselItemIds
        .map((id) => this.state.catalog.find((item) => item.id === id))
        .filter((x): x is CatalogItemRef => Boolean(x));
      if (carouselItems.length > 0) {
        msgType = 'product_carousel';
        if (!body) body = `Product collection (${carouselItems.length} items)`;
      }
    }

    if (params.interactive) {
      msgType = 'interactive';
      if (!body) body = params.interactive.bodyText;
    } else if (params.location) {
      msgType = 'location';
      if (!body) body = params.location.name || `${params.location.latitude}, ${params.location.longitude}`;
    } else if (params.contacts && params.contacts.length > 0) {
      msgType = 'contacts';
      if (!body) body = params.contacts.map((c) => c.name).join(', ');
    } else if (params.order) {
      msgType = 'order';
      if (!body) body = `Order ${params.order.orderId} (${params.order.currency} ${params.order.totalAmount})`;
    }

    const resolvedMedia = this.resolveMediaAttachment(params.media, params.mediaId);
    const linkPreview = msgType === 'text' ? extractLinkPreview(body) : undefined;

    // 6. Optional simulated error code injection (QA error testing)
    if (params.simulateErrorCode) {
      const simulatedErr =
        params.simulateErrorCode === 131047
          ? META_ERRORS.RE_ENGAGEMENT_REQUIRED()
          : params.simulateErrorCode === 131049
            ? META_ERRORS.RECIPIENT_OPTED_OUT()
            : META_ERRORS.MESSAGE_UNDELIVERABLE(
                `Simulated Meta error code ${params.simulateErrorCode}`
              );
      return this.recordFailedOutbound(chat, phoneCfg, body || `[Error ${params.simulateErrorCode}]`, msgType, simulatedErr, 200);
    }

    const now = new Date().toISOString();
    const message: Message = {
      id: `wamid.${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
      chatId: chat.id,
      phoneNumberId: phoneCfg.id,
      senderId: 'me',
      senderName: isBusiness ? phoneCfg.displayName : this.state.self.name,
      direction: 'outbound',
      type: msgType,
      body,
      timestamp: now,
      status: 'queued',
      media: resolvedMedia,
      location: params.location,
      contacts: params.contacts,
      interactive: params.interactive,
      template: templatePayload,
      catalogItem,
      carouselItems,
      order: params.order,
      linkPreview,
      replyTo: this.findQuotedMessage(chat.id, params.replyToMessageId),
      conversationCategory: resolvedCategory,
      metadata: params.metadata,
    };

    if (!this.state.messages[chat.id]) {
      this.state.messages[chat.id] = [];
    }
    this.state.messages[chat.id].push(message);
    chat.lastMessageId = message.id;
    chat.lastMessageAt = now;
    if (chat.archived) chat.archived = false;

    this.trackConversationBilling(chat, resolvedCategory, message.id);
    if (params.deferPersist) {
      this.persistDeferred();
    } else {
      this.persist();
    }
    this.emit({ type: 'message:created', payload: { chatId: chat.id, message, chat } });

    if (params.broadcastId && directContact) {
      this.broadcastMessageIndex.set(message.id, {
        broadcastId: params.broadcastId,
        contactId: directContact.id,
      });
    }

    // Immediate transition: queued -> sent
    this.updateMessageReceipt(message.id, 'sent', undefined, params.deferPersist);

    if (!params.skipLifecycleTimers) {
      const timing = directContact?.receiptTiming;
      const deliveredMs = timing
        ? timing.deliveredMinMs +
          Math.floor(Math.random() * Math.max(1, timing.deliveredMaxMs - timing.deliveredMinMs))
        : this.state.settings.lifecycleDeliveredMs;
      const readMs = timing
        ? timing.readMinMs +
          Math.floor(Math.random() * Math.max(1, timing.readMaxMs - timing.readMinMs))
        : this.state.settings.lifecycleReadMs;
      const shouldRead = timing ? Math.random() <= timing.readProbability : true;

      this.scheduleTimer(() => {
        const current = this.findMessage(message.id);
        if (current && current.status === 'sent') {
          this.updateMessageReceipt(message.id, 'delivered', undefined, params.deferPersist);
        }
      }, deliveredMs);

      if (shouldRead) {
        this.scheduleTimer(() => {
          const current = this.findMessage(message.id);
          if (current && (current.status === 'delivered' || current.status === 'sent')) {
            this.updateMessageReceipt(message.id, 'read', undefined, params.deferPersist);
          }
        }, Math.max(readMs, deliveredMs + 80));
      }

      if (!params.metadata?.businessAutomation) {
        this.triggerAutoReplyIfMatched(chat, message);
        if (directContact?.seeded) {
          this.triggerSeededClientResponse(chat, directContact, message, params.broadcastId);
        }
      }
    }

    return { ok: true, message, chat, httpStatus: 201 };
  }

  private recordFailedOutbound(
    chat: Chat,
    phoneCfg: PhoneNumberConfig,
    body: string,
    type: MessageType,
    error: MessageError,
    httpStatus: number,
    deferPersist = false
  ): SendMessageResult {
    const now = new Date().toISOString();
    const failedMsg: Message = {
      id: `wamid.${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
      chatId: chat.id,
      phoneNumberId: phoneCfg.id,
      senderId: 'me',
      senderName: this.state.settings.variant === 'business' ? phoneCfg.displayName : this.state.self.name,
      direction: 'outbound',
      type,
      body,
      timestamp: now,
      status: 'failed',
      error,
    };

    if (!this.state.messages[chat.id]) this.state.messages[chat.id] = [];
    this.state.messages[chat.id].push(failedMsg);
    chat.lastMessageId = failedMsg.id;
    chat.lastMessageAt = now;
    if (deferPersist) {
      this.persistDeferred();
    } else {
      this.persist();
    }
    this.emit({ type: 'message:created', payload: { chatId: chat.id, message: failedMsg, chat } });

    this.recordWebhook(
      'message.status',
      buildCloudWebhookEnvelope('statuses', phoneCfg, {
        id: failedMsg.id,
        status: 'failed',
        timestamp: String(Math.floor(Date.now() / 1000)),
        recipient_id: chat.contactId
          ? this.state.contacts.find((c) => c.id === chat.contactId)?.phone.replace(/[^\d]/g, '')
          : undefined,
        errors: [
          {
            code: error.code,
            title: error.title,
            message: error.message,
            error_data: error.errorData,
          },
        ],
      }),
      phoneCfg.id
    );

    return { ok: false, message: failedMsg, chat, error, httpStatus };
  }

  receiveMessage(params: ReceiveMessageParams): {
    ok: boolean;
    message?: Message;
    chat?: Chat;
    optInChanged?: { status: OptInStatus; keyword: string };
    error?: MessageError;
  } {
    let chat: Chat | undefined;
    let sender: Contact | undefined;

    if (params.chatId) {
      chat = this.state.chats.find((c) => c.id === params.chatId);
    }

    if (params.senderId) {
      sender = this.state.contacts.find((c) => c.id === params.senderId);
    } else if (params.fromPhone) {
      const cleanPhone = normalizeE164(params.fromPhone);
      if (!isValidE164(cleanPhone)) {
        return {
          ok: false,
          error: { code: 100, title: 'Invalid phone', message: 'fromPhone must be valid E.164 format.' },
        };
      }
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
      chat = this.ensureDirectChat(sender, params.phoneNumberId);
    }

    if (!chat) {
      return {
        ok: false,
        error: { code: 100, title: 'Chat not found', message: 'Could not resolve target chat or sender.' },
      };
    }

    if (!sender) {
      const fallbackId = chat.contactId || chat.participantIds[0];
      sender = this.state.contacts.find((c) => c.id === fallbackId);
    }

    // Blocked contact check: blocked contacts reject inbound messages too
    if (sender?.blocked) {
      return {
        ok: false,
        error: META_ERRORS.CONTACT_BLOCKED(
          `Inbound message from ${sender.phone} rejected because contact is blocked.`
        ),
      };
    }

    const phoneCfg = this.getPhoneConfig(params.phoneNumberId || chat.phoneNumberId);
    const resolvedMedia = this.resolveMediaAttachment(params.media, params.mediaId);
    const msgType: MessageType = params.type || (params.interactive ? 'interactive' : params.location ? 'location' : params.order ? 'order' : 'text');
    const body =
      params.body ||
      params.interactive?.selectedTitle ||
      params.interactive?.bodyText ||
      params.location?.name ||
      resolvedMedia?.filename ||
      '';

    const now = new Date().toISOString();
    const message: Message = {
      id: `wamid.${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
      chatId: chat.id,
      phoneNumberId: phoneCfg.id,
      senderId: sender?.id || 'external',
      senderName: sender?.name || params.fromName || 'External Contact',
      direction: 'inbound',
      type: msgType,
      body,
      timestamp: now,
      status: 'delivered',
      media: resolvedMedia,
      location: params.location,
      contacts: params.contacts,
      interactive: params.interactive,
      order: params.order,
      linkPreview: msgType === 'text' ? extractLinkPreview(body) : undefined,
      replyTo: this.findQuotedMessage(chat.id, params.replyToMessageId),
      conversationCategory: 'SERVICE',
      metadata: params.metadata,
    };

    if (!this.state.messages[chat.id]) {
      this.state.messages[chat.id] = [];
    }
    this.state.messages[chat.id].push(message);
    chat.lastMessageId = message.id;
    chat.lastMessageAt = now;
    chat.lastInboundAt = now; // Opens/resets the 24-hour customer service window!
    chat.unreadCount += 1;
    chat.typingContactId = null;
    chat.typingMode = null;

    if (sender) {
      sender.presence = 'online';
      sender.lastSeen = now;
    }

    this.trackConversationBilling(chat, 'SERVICE', message.id);

    // Opt-in / Opt-out keyword handling (case-insensitive, internationalized word boundaries)
    let optInChanged: { status: OptInStatus; keyword: string } | undefined;
    if (sender && msgType === 'text') {
      const detected = detectOptInKeyword(body);
      if (detected) {
        this.setContactOptIn(
          sender.id,
          detected.action,
          'inbound_keyword',
          detected.keyword,
          `Triggered by inbound message: "${body.slice(0, 60)}"`
        );
        optInChanged = { status: detected.action, keyword: detected.keyword };
      }
    }

    this.persist();
    this.emit({ type: 'message:created', payload: { chatId: chat.id, message, chat } });

    // Construct Meta Cloud API webhook payload matching real message types
    const waFrom = (sender?.phone || params.fromPhone || 'unknown').replace(/[^\d]/g, '');
    const cloudMsgData: Record<string, unknown> = {
      id: message.id,
      from: waFrom,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: message.type === 'voice' ? 'audio' : message.type,
      chat_id: chat.id,
    };

    if (message.type === 'text') {
      cloudMsgData.text = { body: message.body };
    } else if (message.interactive) {
      if (message.interactive.kind === 'button_reply') {
        cloudMsgData.interactive = {
          type: 'button_reply',
          button_reply: {
            id: message.interactive.selectedId || 'btn_1',
            title: message.interactive.selectedTitle || message.body,
          },
        };
      } else if (message.interactive.kind === 'list_reply') {
        cloudMsgData.interactive = {
          type: 'list_reply',
          list_reply: {
            id: message.interactive.selectedId || 'row_1',
            title: message.interactive.selectedTitle || message.body,
          },
        };
      } else {
        cloudMsgData.interactive = message.interactive;
      }
    } else if (message.location) {
      cloudMsgData.location = message.location;
    } else if (message.order) {
      cloudMsgData.order = message.order;
    } else if (message.media) {
      cloudMsgData[message.type === 'voice' ? 'audio' : message.type] = {
        id: message.media.mediaId || message.media.id,
        mime_type: message.media.mimeType,
        caption: message.media.caption,
        filename: message.media.filename,
      };
    }

    this.recordWebhook(
      'message.received',
      buildCloudWebhookEnvelope(
        'messages',
        phoneCfg,
        cloudMsgData,
        sender
          ? [{ profile: { name: sender.profileName || sender.name }, wa_id: waFrom }]
          : undefined
      ),
      phoneCfg.id
    );

    // Trigger Business Greeting or Away auto-responses (skip if user just opted out!)
    if (!optInChanged || optInChanged.status !== 'opted_out') {
      this.triggerBusinessAutomation(chat, sender);
    }

    return { ok: true, message, chat, optInChanged };
  }

  private triggerAutoReplyIfMatched(chat: Chat, outboundMessage: Message): void {
    const targetContactId = chat.contactId || chat.participantIds[0];
    const matched = matchAutoReplyRule(
      this.state.autoReplyRules,
      outboundMessage.body,
      targetContactId
    );
    if (!matched) return;

    const responderId = matched.contactId || targetContactId;
    const responder = this.state.contacts.find((c) => c.id === responderId);
    if (!responder || responder.blocked) return;

    // Respect opt-out flag on auto-reply rules
    if (matched.respectOptOut !== false && responder.optInStatus === 'opted_out') {
      return;
    }

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

  private triggerBusinessAutomation(chat: Chat, sender?: Contact): void {
    if (this.state.settings.variant !== 'business') return;
    if (chat.type !== 'direct') return;
    if (sender?.blocked) return;

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

  updateMessageReceipt(
    messageId: string,
    status: MessageStatus,
    errorCode?: number,
    deferPersist = false
  ): Message | null {
    for (const [chatId, list] of Object.entries(this.state.messages)) {
      const msg = list.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        if (status === 'failed') {
          msg.error =
            errorCode === 131047
              ? META_ERRORS.RE_ENGAGEMENT_REQUIRED()
              : errorCode === 131049
                ? META_ERRORS.RECIPIENT_OPTED_OUT()
                : errorCode === 131030
                  ? META_ERRORS.INVALID_RECIPIENT()
                  : errorCode === 131056
                    ? META_ERRORS.PAIR_RATE_LIMIT()
                    : errorCode === 130429
                      ? META_ERRORS.THROUGHPUT_RATE_LIMIT()
                      : META_ERRORS.MESSAGE_UNDELIVERABLE(
                          `Failed receipt set with Meta error code ${errorCode || 131026}`
                        );
        } else {
          msg.error = undefined;
        }

        const phoneCfg = this.getPhoneConfig(msg.phoneNumberId);
        const category = msg.conversationCategory || 'SERVICE';
        const rate = this.state.settings.pricingRatesUsd[category] ?? 0;

        this.syncBroadcastRecipientStatus(msg.id, status, msg.error);

        if (deferPersist) {
          this.persistDeferred();
        } else {
          this.persist();
        }
        this.emit({ type: 'message:updated', payload: { chatId, message: msg } });
        this.recordWebhook(
          'message.status',
          buildCloudWebhookEnvelope('statuses', phoneCfg, {
            id: msg.id,
            status,
            timestamp: String(Math.floor(Date.now() / 1000)),
            chat_id: chatId,
            conversation: {
              id: `conv_${chatId}`,
              origin: { type: category.toLowerCase() },
            },
            pricing: {
              billable: rate > 0,
              pricing_model: 'CBP',
              category: category.toLowerCase(),
            },
            ...(msg.error
              ? {
                  errors: [
                    {
                      code: msg.error.code,
                      title: msg.error.title,
                      message: msg.error.message,
                      error_data: msg.error.errorData,
                    },
                  ],
                }
              : {}),
          }),
          phoneCfg.id
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
      const phoneCfg = this.getPhoneConfig(chat.phoneNumberId);
      this.persist();
      this.emit({ type: 'chat:updated', payload: chat });
      for (const m of updated) {
        this.emit({ type: 'message:updated', payload: { chatId, message: m } });
      }
      if (updated.length > 0) {
        this.recordWebhook(
          'message.status',
          buildCloudWebhookEnvelope('statuses', phoneCfg, {
            id: updated[updated.length - 1].id,
            status: 'read',
            timestamp: String(Math.floor(Date.now() / 1000)),
            chat_id: chatId,
          }),
          phoneCfg.id
        );
      }
    }
    return chat;
  }

  setTyping(
    chatId: string,
    contactId: string | null,
    mode: 'typing' | 'recording' | null
  ): Chat | null {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;

    chat.typingContactId = contactId;
    chat.typingMode = contactId ? mode || 'typing' : null;

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

    const phoneCfg = this.getPhoneConfig(chat.phoneNumberId);
    this.recordWebhook(
      'presence.typing',
      buildCloudWebhookEnvelope('typing', phoneCfg, {
        chat_id: chatId,
        contact_id: contactId,
        state: chat.typingMode || 'idle',
      }),
      phoneCfg.id
    );

    return chat;
  }

  // --- Templates ---
  upsertTemplate(
    input: Partial<MessageTemplate> & { name: string; bodyText: string; category: MessageTemplate['category'] }
  ): MessageTemplate {
    const cleanName = input.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const now = new Date().toISOString();

    const target = input.id
      ? this.state.templates.find((t) => t.id === input.id)
      : this.state.templates.find((t) => t.name === cleanName);

    if (target) {
      const prevStatus = target.status;
      Object.assign(target, {
        name: cleanName,
        language: input.language || target.language,
        category: input.category || target.category,
        status: input.status || target.status,
        headerText: input.headerText ?? target.headerText,
        headerImageUrl: input.headerImageUrl ?? target.headerImageUrl,
        bodyText: input.bodyText ?? target.bodyText,
        footerText: input.footerText ?? target.footerText,
        buttons: input.buttons || target.buttons,
        sampleValues: input.sampleValues || target.sampleValues,
        rejectionReason: input.rejectionReason,
        updatedAt: now,
      });
      this.emitBusinessUpdate();
      if (input.status && input.status !== prevStatus) {
        this.emitTemplateStatusWebhook(target);
      }
      return target;
    }

    const created: MessageTemplate = {
      id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName,
      language: input.language || 'en_US',
      category: input.category,
      status: input.status || 'PENDING',
      headerText: input.headerText?.trim() || undefined,
      headerImageUrl: input.headerImageUrl?.trim() || undefined,
      bodyText: input.bodyText.trim(),
      footerText: input.footerText?.trim() || undefined,
      buttons: input.buttons || [],
      sampleValues: input.sampleValues || [],
      createdAt: now,
      updatedAt: now,
    };
    this.state.templates.unshift(created);
    this.emitBusinessUpdate();
    this.emitTemplateStatusWebhook(created);
    return created;
  }

  setTemplateStatus(
    id: string,
    status: TemplateApprovalStatus,
    rejectionReason?: string
  ): MessageTemplate | null {
    const tpl = this.state.templates.find((t) => t.id === id);
    if (!tpl) return null;
    tpl.status = status;
    tpl.rejectionReason = status === 'REJECTED' ? rejectionReason || 'POLICY_VIOLATION' : undefined;
    tpl.updatedAt = new Date().toISOString();
    this.emitBusinessUpdate();
    this.emitTemplateStatusWebhook(tpl);
    return tpl;
  }

  deleteTemplate(id: string): boolean {
    const idx = this.state.templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.state.templates.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }

  private emitTemplateStatusWebhook(tpl: MessageTemplate): void {
    const phoneCfg = this.getPhoneConfig();
    this.recordWebhook(
      'template.status',
      buildCloudWebhookEnvelope('message_template_status_update', phoneCfg, {
        event: tpl.status,
        message_template_id: tpl.id,
        message_template_name: tpl.name,
        message_template_language: tpl.language,
        category: tpl.category,
        reason: tpl.rejectionReason || 'NONE',
      }),
      phoneCfg.id
    );
  }

  // --- Pricing Summary ---
  getConversationPricingSummary() {
    const byCategory: Record<ConversationCategory, { count: number; totalCostUsd: number }> = {
      MARKETING: { count: 0, totalCostUsd: 0 },
      UTILITY: { count: 0, totalCostUsd: 0 },
      AUTHENTICATION: { count: 0, totalCostUsd: 0 },
      SERVICE: { count: 0, totalCostUsd: 0 },
    };

    let grandTotalUsd = 0;
    for (const c of this.state.conversations) {
      byCategory[c.category].count += 1;
      byCategory[c.category].totalCostUsd = Number(
        (byCategory[c.category].totalCostUsd + c.estimatedCostUsd).toFixed(4)
      );
      grandTotalUsd = Number((grandTotalUsd + c.estimatedCostUsd).toFixed(4));
    }

    return {
      ratesUsd: this.state.settings.pricingRatesUsd,
      totalConversations: this.state.conversations.length,
      grandTotalUsd,
      byCategory,
      records: this.state.conversations,
    };
  }

  // --- Config & Self Profile ---
  private emitConfigUpdate(): void {
    this.emit({
      type: 'config:updated',
      payload: {
        settings: this.state.settings,
        self: this.state.self,
        phoneNumbers: this.state.phoneNumbers,
      },
    });
  }

  updateConfig(patch: {
    variant?: 'personal' | 'business';
    activePhoneNumberId?: string;
    webhookUrl?: string;
    webhookSecret?: string;
    lifecycleDeliveredMs?: number;
    lifecycleReadMs?: number;
    autoMarkReadOnAutoReply?: boolean;
    enforce24hWindow?: boolean;
    enforceOptIn?: boolean;
    self?: Partial<{ name: string; phone: string; about: string }>;
  }): { settings: EmulatorSettings; self: EmulatorState['self']; phoneNumbers: PhoneNumberConfig[] } {
    if (patch.variant === 'personal' || patch.variant === 'business') {
      this.state.settings.variant = patch.variant;
    }
    if (
      patch.activePhoneNumberId &&
      this.state.phoneNumbers.some((p) => p.id === patch.activePhoneNumberId)
    ) {
      this.state.settings.activePhoneNumberId = patch.activePhoneNumberId;
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
    if (typeof patch.enforce24hWindow === 'boolean') {
      this.state.settings.enforce24hWindow = patch.enforce24hWindow;
    }
    if (typeof patch.enforceOptIn === 'boolean') {
      this.state.settings.enforceOptIn = patch.enforceOptIn;
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
    this.emitConfigUpdate();
    return {
      settings: this.state.settings,
      self: this.state.self,
      phoneNumbers: this.state.phoneNumbers,
    };
  }

  // --- Business Features ---
  updateBusinessProfile(patch: Partial<BusinessProfile>): BusinessProfile {
    Object.assign(this.state.settings.businessProfile, patch);
    const activeNum = this.getPhoneConfig();
    Object.assign(activeNum.businessProfile, patch);
    this.persist();
    this.emitConfigUpdate();
    return this.state.settings.businessProfile;
  }

  updateBusinessAutomation(patch: Partial<BusinessAutomation>): BusinessAutomation {
    Object.assign(this.state.settings.businessAutomation, patch);
    this.persist();
    this.emitConfigUpdate();
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
        templates: this.state.templates,
        conversations: this.state.conversations,
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

  upsertAutoReplyRule(
    input: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }
  ): AutoReplyRule {
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
          simulateTypingMs:
            typeof input.simulateTypingMs === 'number'
              ? input.simulateTypingMs
              : existing.simulateTypingMs,
          contactId: input.contactId,
          respectOptOut:
            typeof input.respectOptOut === 'boolean' ? input.respectOptOut : existing.respectOptOut,
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
      respectOptOut: input.respectOptOut !== false,
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

  // =========================================================================
  // Phase 3: Seeded Client Numbers, Broadcast Engine, Rate Limits & Faults
  // =========================================================================

  bulkSeedClients(
    request: BulkSeedRequest,
    silent = false
  ): { seededCount: number; contacts: Contact[]; chats: Chat[] } {
    if (request.clearPreviousSeeded) {
      const removedIds = new Set(
        this.state.contacts.filter((c) => c.seeded).map((c) => c.id)
      );
      this.state.contacts = this.state.contacts.filter((c) => !c.seeded);
      const keptChats: Chat[] = [];
      for (const ch of this.state.chats) {
        if (ch.contactId && removedIds.has(ch.contactId)) {
          delete this.state.messages[ch.id];
        } else {
          keptChats.push(ch);
        }
      }
      this.state.chats = keptChats;
    }

    const existingPhones = new Set(this.state.contacts.map((c) => normalizeE164(c.phone)));
    const specs = generateSeededClients(request, existingPhones);
    const createdContacts: Contact[] = [];
    const createdChats: Chat[] = [];
    const now = Date.now();

    specs.forEach((spec, idx) => {
      const contact = buildContactFromClientSeed(
        spec,
        this.state.contacts.length + idx,
        request.clients ? 'seed_file' : 'bulk_seed'
      );
      this.state.contacts.push(contact);
      createdContacts.push(contact);

      const chat: Chat = {
        id: `chat-${contact.id}`,
        type: 'direct',
        phoneNumberId: this.state.settings.activePhoneNumberId,
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
        lastMessageAt: new Date(now - (idx + 60) * 60_000).toISOString(),
        lastInboundAt: spec.windowOpen
          ? new Date(now - Math.min(180, 15 + idx) * 60_000).toISOString()
          : new Date(now - 30 * 3_600_000).toISOString(),
        conversationCategory: 'MARKETING',
      };
      this.state.chats.push(chat);
      this.state.messages[chat.id] = [];
      createdChats.push(chat);
    });

    if (!silent) {
      this.persist();
      if (request.clearPreviousSeeded) {
        this.emit({ type: 'state:sync', payload: this.state });
      } else {
        this.emit({
          type: 'clients:seeded',
          payload: { contacts: createdContacts, chats: createdChats },
        });
      }
    }

    return {
      seededCount: createdContacts.length,
      contacts: createdContacts,
      chats: createdChats,
    };
  }

  listClients(filter?: {
    segment?: string;
    optInStatus?: OptInStatus;
    personality?: ClientPersonality;
    country?: string;
    search?: string;
  }): Contact[] {
    return this.state.contacts.filter((c) => {
      if (c.isBot) return false;
      if (filter?.segment) {
        const seg = filter.segment.trim().toLowerCase();
        if (!(c.tags || []).some((t) => t.toLowerCase() === seg)) return false;
      }
      if (filter?.optInStatus && c.optInStatus !== filter.optInStatus) return false;
      if (filter?.personality && c.personality !== filter.personality) return false;
      if (filter?.country && c.country?.toUpperCase() !== filter.country.toUpperCase()) return false;
      if (filter?.search) {
        const q = filter.search.trim().toLowerCase();
        const hay = `${c.name} ${c.phone} ${(c.tags || []).join(' ')} ${c.country || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  simulateClientResponse(req: ClientResponseSimulationRequest): {
    ok: boolean;
    affected: number;
    results: Array<{ contactId: string; phone: string; action: string; ok: boolean; note?: string }>;
  } {
    const targets: Contact[] = [];
    const seen = new Set<string>();

    if (Array.isArray(req.contactIds)) {
      for (const id of req.contactIds) {
        const c = this.state.contacts.find((x) => x.id === id);
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          targets.push(c);
        }
      }
    }
    if (Array.isArray(req.phones)) {
      for (const raw of req.phones) {
        const norm = normalizeE164(raw);
        const c = this.state.contacts.find((x) => normalizeE164(x.phone) === norm);
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          targets.push(c);
        }
      }
    }

    const delayMs = typeof req.delayMs === 'number' && req.delayMs >= 0 ? req.delayMs : 0;
    const results: Array<{ contactId: string; phone: string; action: string; ok: boolean; note?: string }> = [];

    for (const contact of targets) {
      if (req.action === 'silence') {
        this.updateContact(contact.id, { personality: 'silent' });
        results.push({
          contactId: contact.id,
          phone: contact.phone,
          action: 'silence',
          ok: true,
          note: 'Personality set to silent',
        });
        continue;
      }

      const execute = () => {
        if (req.action === 'opt_out') {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || 'STOP',
            type: 'text',
            metadata: { simulatedClientResponse: 'opt_out' },
          });
        } else if (req.action === 'opt_in') {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || 'START',
            type: 'text',
            metadata: { simulatedClientResponse: 'opt_in' },
          });
        } else if (req.action === 'button_click') {
          const title = req.buttonTitle?.trim() || req.text?.trim() || 'Confirm Delivery';
          const id = req.buttonId?.trim() || 'sim_btn_1';
          this.receiveMessage({
            fromPhone: contact.phone,
            body: title,
            type: 'interactive',
            interactive: {
              kind: 'button_reply',
              bodyText: title,
              selectedId: id,
              selectedTitle: title,
            },
            metadata: { simulatedClientResponse: 'button_click' },
          });
        } else if (req.action === 'catalog_view') {
          this.receiveMessage({
            fromPhone: contact.phone,
            body:
              req.text?.trim() ||
              'Viewed catalog — interested in Matte Pour-Over Brew Kit.',
            type: 'text',
            metadata: { simulatedClientResponse: 'catalog_view' },
          });
        } else {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || 'Thanks! Got your message.',
            type: 'text',
            metadata: { simulatedClientResponse: 'reply' },
          });
        }
      };

      if (delayMs > 0) {
        this.scheduleTimer(execute, delayMs);
      } else {
        execute();
      }

      results.push({
        contactId: contact.id,
        phone: contact.phone,
        action: req.action,
        ok: true,
        note: delayMs > 0 ? `Scheduled in ${delayMs}ms` : 'Dispatched immediately',
      });
    }

    return { ok: true, affected: results.length, results };
  }

  private triggerSeededClientResponse(
    chat: Chat,
    contact: Contact,
    outboundMessage: Message,
    broadcastId?: string
  ): void {
    const computed = computeClientAutoResponse(contact, outboundMessage);
    if (!computed) return;

    this.scheduleTimer(() => {
      // Skip if contact became blocked/disabled or turned silent before timer fired
      const fresh = this.state.contacts.find((c) => c.id === contact.id);
      if (!fresh || fresh.blocked || fresh.disabled || fresh.personality === 'silent') return;

      const res = this.receiveMessage({
        chatId: chat.id,
        senderId: fresh.id,
        body: computed.body,
        type: computed.type,
        interactive: computed.interactive,
        metadata: {
          seededClientPersonality: fresh.personality,
          triggeredByMessageId: outboundMessage.id,
          broadcastId,
          reason: computed.reason,
        },
      });

      if (res.ok && broadcastId) {
        this.recordBroadcastRecipientReply(broadcastId, fresh.id, computed.body);
      }
    }, computed.delayMs);
  }

  private recordBroadcastRecipientReply(
    broadcastId: string,
    contactId: string,
    replyPreview: string
  ): void {
    const job = this.state.broadcasts.find((b) => b.id === broadcastId);
    if (!job) return;
    const rec = job.recipients.find((r) => r.contactId === contactId);
    if (!rec) return;
    if (!rec.repliedAt) {
      job.counts.replied += 1;
    }
    rec.repliedAt = new Date().toISOString();
    rec.replyPreview = replyPreview.slice(0, 120);
    this.emitBroadcastUpdateThrottled(job);
  }

  private recomputeBroadcastCounts(job: BroadcastJob): void {
    let queued = 0;
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    let replied = 0;
    for (const r of job.recipients) {
      if (r.status === 'queued') queued++;
      else if (r.status === 'sent') sent++;
      else if (r.status === 'delivered') delivered++;
      else if (r.status === 'read') read++;
      else if (r.status === 'failed') failed++;
      if (r.repliedAt) replied++;
    }
    job.counts = { queued, sent, delivered, read, failed, replied };
  }

  private emitBroadcastUpdateThrottled(job: BroadcastJob, immediate = false): void {
    const existing = this.broadcastEmitTimers.get(job.id);
    if (immediate) {
      if (existing) {
        clearTimeout(existing);
        this.broadcastEmitTimers.delete(job.id);
      }
      this.emit({ type: 'broadcast:updated', payload: job });
      this.persistDeferred();
      return;
    }
    if (existing) return;
    const t = setTimeout(() => {
      this.broadcastEmitTimers.delete(job.id);
      this.emit({ type: 'broadcast:updated', payload: job });
      this.persistDeferred();
    }, 90);
    this.broadcastEmitTimers.set(job.id, t);
    this.pendingTimers.add(t);
  }

  private syncBroadcastRecipientStatus(
    messageId: string,
    status: MessageStatus,
    error?: MessageError
  ): void {
    const link = this.broadcastMessageIndex.get(messageId);
    if (!link) return;
    const job = this.state.broadcasts.find((b) => b.id === link.broadcastId);
    if (!job) return;
    const rec = job.recipients.find((r) => r.contactId === link.contactId);
    if (!rec) return;

    const now = new Date().toISOString();
    rec.status = status;
    if (status === 'sent' && !rec.sentAt) rec.sentAt = now;
    if (status === 'delivered' && !rec.deliveredAt) rec.deliveredAt = now;
    if (status === 'read' && !rec.readAt) rec.readAt = now;
    if (status === 'failed') {
      rec.failedAt = now;
      if (error) {
        rec.errorCode = error.code;
        rec.errorTitle = error.title;
        rec.errorDetails = error.errorData?.details || error.message;
      }
    }
    this.recomputeBroadcastCounts(job);
    this.emitBroadcastUpdateThrottled(job);
  }

  listBroadcasts(): BroadcastJob[] {
    return this.state.broadcasts;
  }

  getBroadcast(id: string): BroadcastJob | null {
    return this.state.broadcasts.find((b) => b.id === id) || null;
  }

  createBroadcast(request: BroadcastCreateRequest): {
    ok: boolean;
    broadcast?: BroadcastJob;
    error?: MessageError;
    httpStatus?: number;
  } {
    const phoneCfg = this.getPhoneConfig(request.phoneNumberId);
    const payloadType =
      request.type ||
      (request.templateId || request.templateName
        ? 'template'
        : request.interactive
          ? 'interactive'
          : 'text');

    let tpl: MessageTemplate | undefined;
    if (payloadType === 'template') {
      tpl = this.state.templates.find(
        (t) =>
          (request.templateId && t.id === request.templateId) ||
          (request.templateName && t.name === request.templateName)
      );
      if (!tpl || tpl.status !== 'APPROVED') {
        return {
          ok: false,
          httpStatus: 400,
          error: META_ERRORS.TEMPLATE_NOT_APPROVED(
            tpl
              ? `Template "${tpl.name}" is ${tpl.status} (must be APPROVED for broadcast).`
              : `Template "${request.templateName || request.templateId || 'unknown'}" not found.`
          ),
        };
      }
    }

    const recipients = selectBroadcastRecipients(this.state.contacts, request.selector);
    if (recipients.length === 0) {
      return {
        ok: false,
        httpStatus: 400,
        error: {
          code: 100,
          title: 'No matching recipients',
          message: 'Recipient selector matched 0 client numbers. Seed clients or adjust selector.',
        },
      };
    }

    const nowMs = Date.now();
    let scheduledMs: number | null = null;
    if (typeof request.delaySeconds === 'number' && request.delaySeconds > 0) {
      scheduledMs = nowMs + request.delaySeconds * 1000;
    } else if (request.scheduledFor) {
      const parsed = new Date(request.scheduledFor).getTime();
      if (!Number.isNaN(parsed) && parsed > nowMs + 250) {
        scheduledMs = parsed;
      }
    }

    const throughputPerSec = Math.max(
      1,
      Math.min(
        500,
        request.throughputPerSec ?? this.env.broadcastThroughputPerSec ?? 25
      )
    );
    const concurrency = Math.max(
      1,
      Math.min(50, request.concurrency ?? this.env.broadcastConcurrency ?? 8)
    );

    const bodyPreview =
      payloadType === 'template' && tpl
        ? renderTemplateBody(
            tpl.bodyText,
            request.templateVariables && request.templateVariables.length > 0
              ? request.templateVariables
              : tpl.sampleValues
          )
        : request.interactive?.bodyText || request.body || '[Broadcast message]';

    const recipientRecords: BroadcastRecipientRecord[] = recipients.map((c) => ({
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      tags: c.tags || [],
      status: 'queued',
    }));

    const job: BroadcastJob = {
      id: `bcast-${crypto.randomUUID().slice(0, 8)}`,
      name:
        request.name?.trim() ||
        (tpl ? `Broadcast · ${tpl.name}` : `Broadcast · ${request.selector.mode}`),
      phoneNumberId: phoneCfg.id,
      status: scheduledMs ? 'scheduled' : 'running',
      createdAt: new Date(nowMs).toISOString(),
      scheduledFor: scheduledMs ? new Date(scheduledMs).toISOString() : null,
      startedAt: scheduledMs ? null : new Date(nowMs).toISOString(),
      completedAt: null,
      selector: request.selector,
      payloadType,
      templateId: tpl?.id,
      templateName: tpl?.name,
      templateCategory: tpl?.category,
      templateVariables: request.templateVariables || tpl?.sampleValues || [],
      bodyPreview,
      throughputPerSec,
      concurrency,
      totalRecipients: recipientRecords.length,
      counts: {
        queued: recipientRecords.length,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0,
      },
      recipients: recipientRecords,
    };

    this.state.broadcasts = [job, ...this.state.broadcasts].slice(0, 40);
    this.broadcastPayloads.set(job.id, request);
    this.persist();
    this.emit({ type: 'broadcast:updated', payload: job });

    if (scheduledMs) {
      const waitMs = Math.max(50, scheduledMs - nowMs);
      this.scheduleTimer(() => {
        if (job.status === 'scheduled') {
          this.executeBroadcastJob(job);
        }
      }, waitMs);
    } else {
      this.executeBroadcastJob(job);
    }

    return { ok: true, broadcast: job, httpStatus: scheduledMs ? 202 : 201 };
  }

  dispatchBroadcastNow(broadcastId: string): { ok: boolean; broadcast?: BroadcastJob; error?: string } {
    const job = this.state.broadcasts.find((b) => b.id === broadcastId);
    if (!job) return { ok: false, error: 'Broadcast job not found' };
    if (job.status !== 'scheduled') {
      return { ok: true, broadcast: job };
    }
    this.executeBroadcastJob(job);
    return { ok: true, broadcast: job };
  }

  private executeBroadcastJob(job: BroadcastJob): void {
    const request = this.broadcastPayloads.get(job.id);
    if (!request) return;

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.emitBroadcastUpdateThrottled(job, true);

    const nextRoll = createBroadcastRollGenerator(this.state.failureInjection.seed);
    const intervalMs = Math.max(5, Math.floor((1000 / job.throughputPerSec) * job.concurrency));
    let cursor = 0;

    const processBatch = () => {
      if (job.status !== 'running') return;
      const batchEnd = Math.min(cursor + job.concurrency, job.recipients.length);

      for (let i = cursor; i < batchEnd; i++) {
        const rec = job.recipients[i];
        const contact = this.state.contacts.find((c) => c.id === rec.contactId);
        if (!contact) {
          rec.status = 'failed';
          rec.failedAt = new Date().toISOString();
          rec.errorCode = 131030;
          rec.errorTitle = 'Recipient missing';
          rec.errorDetails = 'Contact was removed before broadcast send.';
          continue;
        }

        const overrideVars =
          request.perRecipientVariables?.[contact.phone] ||
          request.perRecipientVariables?.[contact.id];
        const baseVars =
          job.templateVariables && job.templateVariables.length > 0
            ? job.templateVariables
            : ['{{name}}'];
        const resolvedVars = resolveRecipientTemplateVariables(
          baseVars,
          contact,
          overrideVars
        );
        const resolvedBody = request.body
          ? request.body
              .replace(/\{\{name\}\}/gi, contact.name)
              .replace(/\{\{1\}\}/gi, contact.name)
              .replace(/\{\{first_name\}\}/gi, (contact.profileName || contact.name).split(/\s+/)[0] || contact.name)
          : undefined;

        const sendRes = this.sendMessage({
          toPhone: contact.phone,
          phoneNumberId: job.phoneNumberId,
          type: job.payloadType,
          templateId: job.templateId,
          templateName: job.templateName,
          templateVariables: resolvedVars,
          body: resolvedBody,
          interactive: request.interactive,
          broadcastId: job.id,
          failureRollPercent: nextRoll(),
          deferPersist: true,
          metadata: { broadcastId: job.id, broadcastName: job.name },
        });

        rec.chatId = sendRes.chat?.id;
        rec.messageId = sendRes.message?.id;

        if (!sendRes.ok) {
          rec.status = 'failed';
          rec.failedAt = new Date().toISOString();
          rec.errorCode = sendRes.error?.code;
          rec.errorTitle = sendRes.error?.title;
          rec.errorDetails = sendRes.error?.errorData?.details || sendRes.error?.message;
        } else {
          rec.status = 'sent';
          rec.sentAt = new Date().toISOString();
        }
      }

      cursor = batchEnd;
      this.recomputeBroadcastCounts(job);
      this.emitBroadcastUpdateThrottled(job);

      if (cursor < job.recipients.length) {
        this.scheduleTimer(processBatch, intervalMs);
      } else {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        this.recomputeBroadcastCounts(job);
        this.emitBroadcastUpdateThrottled(job, true);
        this.emitTestingUpdate();

        const phoneCfg = this.getPhoneConfig(job.phoneNumberId);
        this.recordWebhook(
          'broadcast.completed',
          buildCloudWebhookEnvelope('broadcast_status', phoneCfg, {
            broadcast_id: job.id,
            name: job.name,
            total_recipients: job.totalRecipients,
            counts: job.counts,
            completed_at: job.completedAt,
          }),
          phoneCfg.id
        );
      }
    };

    processBatch();
  }

  private emitTestingUpdate(): void {
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    this.emit({
      type: 'testing:updated',
      payload: {
        failureInjection: this.state.failureInjection,
        rateLimits: this.state.rateLimits,
        rateLimitUsage: this.state.rateLimitUsage,
      },
    });
  }

  updateFailureInjection(patch: Partial<FailureInjectionConfig>): FailureInjectionConfig {
    const clampPct = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback;

    this.state.failureInjection = {
      enabled:
        typeof patch.enabled === 'boolean' ? patch.enabled : this.state.failureInjection.enabled,
      invalidNumberPct: clampPct(
        patch.invalidNumberPct,
        this.state.failureInjection.invalidNumberPct
      ),
      optOutPct: clampPct(patch.optOutPct, this.state.failureInjection.optOutPct),
      outOfWindowPct: clampPct(patch.outOfWindowPct, this.state.failureInjection.outOfWindowPct),
      disabledPct: clampPct(patch.disabledPct, this.state.failureInjection.disabledPct),
      seed: typeof patch.seed === 'number' ? patch.seed : this.state.failureInjection.seed,
    };
    this.persist();
    this.emitTestingUpdate();
    return this.state.failureInjection;
  }

  updateRateLimits(patch: Partial<RateLimitConfig>): RateLimitConfig {
    const clampNum = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;

    this.state.rateLimits = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : this.state.rateLimits.enabled,
      messagesPerSecond: clampNum(
        patch.messagesPerSecond,
        this.state.rateLimits.messagesPerSecond
      ),
      messagesPerMinute: clampNum(
        patch.messagesPerMinute,
        this.state.rateLimits.messagesPerMinute
      ),
      pairMessagesPerMinute: clampNum(
        patch.pairMessagesPerMinute,
        this.state.rateLimits.pairMessagesPerMinute
      ),
      dailyTemplateLimit: clampNum(
        patch.dailyTemplateLimit,
        this.state.rateLimits.dailyTemplateLimit
      ),
    };
    this.persist();
    this.emitTestingUpdate();
    return this.state.rateLimits;
  }

  resetRateLimitCounters(): EmulatorState['rateLimitUsage'] {
    this.rateLimiter.reset();
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    this.emitTestingUpdate();
    return this.state.rateLimitUsage;
  }
}
