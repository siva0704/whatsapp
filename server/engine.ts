import crypto from 'crypto';
import type {
  AutoReplyRule,
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CallLogItem,
  CatalogItemRef,
  Chat,
  Contact,
  ContactCardPayload,
  ConversationBillingRecord,
  ConversationCategory,
  EmulatorSettings,
  EmulatorState,
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
  ServerWsEvent,
  StatusUpdateItem,
  TemplateApprovalStatus,
  WebhookLogEntry,
} from '../shared/types';
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
  catalogItemId?: string;
  carouselItemIds?: string[];
  order?: OrderPayload;
  replyToMessageId?: string;
  skipLifecycleTimers?: boolean;
  simulateErrorCode?: number;
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
    for (const comp of components) {
      const params = Array.isArray(comp.parameters)
        ? (comp.parameters as Array<Record<string, unknown>>)
        : [];
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
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

  const defaultBusinessProfile: BusinessProfile = {
    name: 'Wealth Transformers India Pvt Ltd',
    category: 'SEBI Registered Stock-Broking & Wealth Advisory',
    description:
      'Enterprise WhatsApp Platform for Wealth Transformers. SEBI Reg: INZ000123456 | AMFI: ARN-98765. Automated client alerts, portfolio briefs, and consent management.',
    address: 'Nariman Point, Marine Drive, Mumbai, Maharashtra 400021, India',
    hours: 'Mon–Fri · 09:00 – 18:00 IST',
    email: 'compliance@wealthtrade.in',
    website: 'https://wealthtrade.in',
    verified: true,
    avatarUrl: '/src/assets/images/avatar_store_logo_1795189141688.jpg',
  };

  const phoneNumbers: PhoneNumberConfig[] = [
    {
      id: 'wa-sim-phone-001',
      wabaId: 'wa-sim-waba-001',
      phoneNumber: env.selfPhone || '+919820000001',
      displayName: 'Wealth Transformers (Primary)',
      verifiedName: 'Wealth Transformers India Pvt Ltd',
      qualityRating: 'GREEN',
      webhookUrl: '',
      businessProfile: { ...defaultBusinessProfile },
    },
    {
      id: 'phone-sit-1001',
      wabaId: 'waba-sit-1001',
      phoneNumber: '+919820000001',
      displayName: 'Wealth Transformers SIT WABA',
      verifiedName: 'Wealth Transformers India Pvt Ltd',
      qualityRating: 'GREEN',
      webhookUrl: '',
      businessProfile: { ...defaultBusinessProfile },
    },
    {
      id: 'wa-sim-phone-002',
      wabaId: 'wa-sim-waba-001',
      phoneNumber: '+14155550109',
      displayName: 'Wealth Advisory Desk',
      verifiedName: 'Wealth Transformers Support',
      qualityRating: 'GREEN',
      webhookUrl: '',
      businessProfile: {
        ...defaultBusinessProfile,
        name: 'Wealth Transformers Advisory Desk',
        category: 'Customer Support & Portfolio Advisory',
        description: 'Dedicated support desk for portfolio queries, trade executions, and market updates.',
      },
    },
  ];

  env.phoneNumbers.forEach((seed) => {
    if (!phoneNumbers.some((p) => p.id === seed.id)) {
      phoneNumbers.push({
        id: seed.id,
        wabaId: seed.wabaId || 'wa-sim-waba-001',
        phoneNumber: normalizeE164(seed.phoneNumber),
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

  const contacts: Contact[] = [
    {
      id: 'contact-wt-rajesh',
      name: 'Rajesh Sharma',
      profileName: 'Rajesh S.',
      phone: '+919876543210',
      avatarColor: '#00a884',
      about: 'HNI Client · Equity & Portfolio Advisory',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(24),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'online',
      lastSeen: minsAgo(1),
    },
    {
      id: 'contact-wt-priya',
      name: 'Priya Patel',
      profileName: 'Priya P.',
      phone: '+919876543211',
      avatarColor: '#53bdeb',
      about: 'Active Trader · Derivatives & F&O',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(12),
      optInSource: 'inbound_keyword',
      optInHistory: [],
      presence: 'online',
      lastSeen: minsAgo(3),
    },
    {
      id: 'contact-wt-vikram',
      name: 'Vikram Malhotra',
      profileName: 'Vikram M.',
      phone: '+919876543299',
      avatarColor: '#7f66ff',
      about: 'SIP Investor · Long-Term Wealth Accumulation',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(48),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'offline',
      lastSeen: hoursAgo(2),
    },
    {
      id: 'contact-wt-neha',
      name: 'Neha Gupta',
      profileName: 'Neha G.',
      phone: '+919876543288',
      avatarColor: '#e542a3',
      about: 'Options Trader · Weekly Expiries',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(6),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'online',
      lastSeen: minsAgo(10),
    },
    {
      id: 'contact-wt-nandini',
      name: 'Nandini Swaminathan',
      profileName: 'Nandini S.',
      phone: '+919884012345',
      avatarColor: '#ff7b29',
      about: 'Institutional Portfolio · Advisory Tier 1',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(72),
      optInSource: 'crm_import',
      optInHistory: [],
      presence: 'offline',
      lastSeen: hoursAgo(5),
    },
    {
      id: 'contact-wt-harish',
      name: 'Harish Chandra Verma',
      profileName: 'Harish V.',
      phone: '+919450123987',
      avatarColor: '#009de2',
      about: 'Commodities & Currencies · Multi-Asset',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(30),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'online',
      lastSeen: minsAgo(15),
    },
    {
      id: 'contact-wt-deepak',
      name: 'Deepak Mehta',
      profileName: 'Deepak M.',
      phone: '+919825099887',
      avatarColor: '#25d366',
      about: 'Wealth Advisory · Retirement Solutions',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(10),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'online',
      lastSeen: minsAgo(5),
    },
    {
      id: 'contact-wt-kavita',
      name: 'Kavita Reddy',
      profileName: 'Kavita R.',
      phone: '+919848011223',
      avatarColor: '#ec4899',
      about: 'Direct Equity & Bluechip Growth',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(50),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'online',
      lastSeen: minsAgo(20),
    },
    {
      id: 'contact-wt-sunil',
      name: 'Sunil Bharti Mittal',
      profileName: 'Sunil M.',
      phone: '+919811122233',
      avatarColor: '#f59e0b',
      about: 'HNI Strategic Investor',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(18),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'offline',
      lastSeen: hoursAgo(1),
    },
    {
      id: 'contact-wt-vikramaditya',
      name: 'Vikramaditya Singhania',
      profileName: 'Vikramaditya S.',
      phone: '+919820123456',
      avatarColor: '#8b5cf6',
      about: 'Apex Ventures · Institutional',
      blocked: false,
      optInStatus: 'opted_out',
      optInUpdatedAt: hoursAgo(100),
      optInSource: 'web_portal',
      optInHistory: [],
      presence: 'offline',
      lastSeen: hoursAgo(12),
    },
    {
      id: 'contact-alex',
      name: 'Alex Rivera',
      profileName: 'Alex R.',
      phone: '+14155550142',
      avatarUrl: '/src/assets/images/avatar_alex_dev_1795189142888.jpg',
      avatarColor: '#00a884',
      about: 'Staff QA Engineer · Webhook Pipeline',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(4),
      optInSource: 'web_checkout',
      optInHistory: [
        {
          id: 'opt-alex-1',
          status: 'opted_in',
          timestamp: hoursAgo(4),
          source: 'web_checkout',
          note: 'Opted in to order updates at checkout',
        },
      ],
      presence: 'online',
      lastSeen: minsAgo(0),
    },
    {
      id: 'contact-priya',
      name: 'Priya Patel',
      profileName: 'Priya P.',
      phone: '+14155550188',
      avatarUrl: '/src/assets/images/avatar_priya_ops_1795189209154.jpg',
      avatarColor: '#53bdeb',
      about: 'Operations Lead · Order Verification',
      isBusiness: true,
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(12),
      optInSource: 'inbound_keyword',
      optInHistory: [
        {
          id: 'opt-priya-1',
          status: 'opted_in',
          timestamp: hoursAgo(12),
          source: 'inbound_keyword',
          keyword: 'START',
          note: 'Replied START to onboarding message',
        },
      ],
      presence: 'online',
      lastSeen: minsAgo(2),
    },
    {
      id: 'contact-orderbot',
      name: 'Fulfillment Test Bot',
      profileName: 'Fulfillment Bot',
      phone: '+14155550199',
      avatarColor: '#7f66ff',
      about: 'Automated responder for order, status, refund, and ping flows',
      isBot: true,
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(6),
      optInSource: 'api',
      optInHistory: [
        {
          id: 'opt-bot-1',
          status: 'opted_in',
          timestamp: hoursAgo(6),
          source: 'api',
          note: 'Pre-authorized QA test bot',
        },
      ],
      presence: 'online',
      lastSeen: minsAgo(0),
    },
    {
      id: 'contact-elena',
      name: 'Elena Rostova',
      profileName: 'Elena',
      phone: '+14155550164',
      avatarColor: '#e542a3',
      about: '24h window expired test peer · Template re-engagement',
      blocked: false,
      optInStatus: 'opted_in',
      optInUpdatedAt: hoursAgo(40),
      optInSource: 'web_form',
      optInHistory: [
        {
          id: 'opt-elena-1',
          status: 'opted_in',
          timestamp: hoursAgo(40),
          source: 'web_form',
          note: 'Subscribed via support portal',
        },
      ],
      presence: 'offline',
      lastSeen: hoursAgo(27),
    },
    {
      id: 'contact-marcus',
      name: 'Marcus Chen',
      profileName: 'Marcus C.',
      phone: '+14155550127',
      avatarColor: '#ff7b29',
      about: 'Archived Staging Client',
      blocked: false,
      optInStatus: 'opted_out',
      optInUpdatedAt: hoursAgo(8),
      optInSource: 'inbound_keyword',
      optInHistory: [
        {
          id: 'opt-marcus-1',
          status: 'opted_in',
          timestamp: hoursAgo(72),
          source: 'web_checkout',
        },
        {
          id: 'opt-marcus-2',
          status: 'opted_out',
          timestamp: hoursAgo(8),
          source: 'inbound_keyword',
          keyword: 'STOP',
          note: 'User replied STOP',
        },
      ],
      presence: 'offline',
      lastSeen: hoursAgo(8),
    },
  ];

  env.preloadedContacts.forEach((seed, idx) => {
    const norm = normalizeE164(seed.phone);
    if (norm && !contacts.some((c) => c.phone === norm)) {
      contacts.push(toContactFromSeed({ ...seed, phone: norm }, idx));
    }
  });

  const templates: MessageTemplate[] = [
    {
      id: 'tpl-diwali-special',
      name: 'diwali_special_greeting_v1',
      language: 'hi',
      category: 'MARKETING',
      status: 'APPROVED',
      headerText: 'दीपावली की हार्दिक शुभकामनाएं · वेल्थ ट्रांसफॉर्मर्स',
      bodyText: 'प्रिय {{1}}, वेल्थ ट्रांसफॉर्मर्स की ओर से आपको और आपके परिवार को दीपावली की हार्दिक शुभकामनाएं! इस पावन अवसर पर आपके जीवन में सुख, समृद्धि और वित्तीय विकास की कामना करते हैं।',
      footerText: 'Wealth Transformers India Pvt Ltd | SEBI Reg: INZ000123456',
      sampleValues: ['राजेश जी'],
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'tpl-bday-vip',
      name: 'birthday_vip_wishes_v1',
      language: 'en',
      category: 'UTILITY',
      status: 'APPROVED',
      headerText: 'Happy Birthday from Wealth Transformers!',
      bodyText: 'Dear {{1}}, Wealth Transformers wishes you a very Happy Birthday! May this year bring you immense success, good health, and compounding portfolio returns.',
      footerText: 'Wealth Transformers India Pvt Ltd | SEBI Reg: INZ000123456',
      sampleValues: ['Rajesh Sharma'],
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'tpl-anniv-wishes',
      name: 'wedding_anniversary_wishes_v1',
      language: 'en',
      category: 'UTILITY',
      status: 'APPROVED',
      headerText: 'Happy Wedding Anniversary!',
      bodyText: 'Warmest congratulations on your Wedding Anniversary, {{1}}! Wealth Transformers wishes you both a lifetime of happiness, shared prosperity, and financial security.',
      footerText: 'Wealth Transformers India Pvt Ltd | SEBI Reg: INZ000123456',
      sampleValues: ['Priya Patel'],
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'tpl-market-alpha',
      name: 'wealth_market_alpha_v1',
      language: 'en',
      category: 'MARKETING',
      status: 'APPROVED',
      headerText: 'Wealth Transformers Alpha Brief',
      bodyText: 'Dear {{1}}, here is your exclusive Market Alpha Brief: {{2}}. Nifty momentum indicates positive accumulation in {{3}}. Speak with your wealth advisor for tailored rebalancing.',
      footerText: 'Wealth Transformers India Pvt Ltd | SEBI Reg: INZ000123456',
      sampleValues: ['Vikram Malhotra', 'Strong institutional accumulation in large-cap banking', 'Private Banks and Capital Goods'],
      createdAt: hoursAgo(24),
      updatedAt: hoursAgo(24),
    },
    {
      id: 'tpl-diwali-2024',
      name: 'wealth_trade_diwali_2024',
      language: 'en_US',
      category: 'MARKETING',
      status: 'APPROVED',
      headerText: 'Diwali Mahurat Trading Exclusive',
      bodyText: 'Happy Diwali {{1}}! Celebrate with special festive brokerage benefits on {{2}}. Valid until {{3}}.',
      footerText: 'Wealth Transformers India Pvt Ltd | SEBI Reg: INZ000123456',
      sampleValues: ['Rajesh', 'Equity Delivery & MTF', 'Sunday 23:59'],
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'tpl-order-update',
      name: 'order_shipment_update',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      headerText: 'Order Update · Meridian Coffee',
      bodyText: 'Hi {{1}}, your order {{2}} is packed and scheduled for delivery on {{3}}.',
      footerText: 'Reply STOP to opt out of notifications',
      buttons: [
        { type: 'URL', text: 'Track Shipment', url: 'https://meridian-sandbox.example/track/{{2}}' },
        { type: 'QUICK_REPLY', text: 'Confirm Delivery' },
      ],
      sampleValues: ['Alex', '#ORD-4821', 'Tomorrow by 16:00'],
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'tpl-auth-otp',
      name: 'login_verification_code',
      language: 'en_US',
      category: 'AUTHENTICATION',
      status: 'APPROVED',
      bodyText: '{{1}} is your Meridian verification code. For your security, do not share this code. Expires in 10 minutes.',
      footerText: 'One-time security passcode',
      buttons: [{ type: 'OTP', text: 'Copy code', exampleCode: '482910' }],
      sampleValues: ['482910'],
      createdAt: hoursAgo(36),
      updatedAt: hoursAgo(36),
    },
    {
      id: 'tpl-promo-roast',
      name: 'seasonal_roast_launch',
      language: 'en_US',
      category: 'MARKETING',
      status: 'APPROVED',
      headerText: 'Fresh Harvest Drop',
      bodyText: 'Hey {{1}}! Our Ethiopia Yirgacheffe micro-lot is live. Use code {{2}} for 15% off today.',
      footerText: 'Reply STOP to unsubscribe',
      buttons: [
        { type: 'COPY_CODE', text: 'Copy offer code', exampleCode: 'ROAST15' },
        { type: 'URL', text: 'Shop Harvest', url: 'https://meridian-sandbox.example/shop' },
      ],
      sampleValues: ['Priya', 'ROAST15'],
      createdAt: hoursAgo(24),
      updatedAt: hoursAgo(24),
    },
    {
      id: 'tpl-pending-review',
      name: 'vip_early_access',
      language: 'en_US',
      category: 'MARKETING',
      status: 'PENDING',
      headerText: 'VIP Tasting Preview',
      bodyText: 'Hi {{1}}, reserve your seat for Friday cupping at {{2}}.',
      footerText: 'Meridian Roastery Events',
      buttons: [{ type: 'PHONE_NUMBER', text: 'Call Roastery', phoneNumber: '+14155550100' }],
      sampleValues: ['Elena', '17:00 PT'],
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
  ];

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
      respectOptOut: true,
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
      respectOptOut: false,
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
      respectOptOut: true,
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
      respectOptOut: true,
    },
  ];

  const autoReplyRules = [
    ...defaultRules,
    ...env.autoReplyRules.map((seed, idx) => toRuleFromSeed(seed, idx)),
  ];

  const chats: Chat[] = [
    {
      id: 'chat-wt-rajesh',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Rajesh Sharma',
      avatarColor: '#00a884',
      contactId: 'contact-wt-rajesh',
      participantIds: ['contact-wt-rajesh'],
      unreadCount: 0,
      archived: false,
      pinned: true,
      muted: false,
      labelIds: ['lbl-vip'],
      lastMessageId: 'msg-wt-rajesh-1',
      lastMessageAt: minsAgo(4),
      lastInboundAt: minsAgo(12),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-priya',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Priya Patel',
      avatarColor: '#53bdeb',
      contactId: 'contact-wt-priya',
      participantIds: ['contact-wt-priya'],
      unreadCount: 0,
      archived: false,
      pinned: true,
      muted: false,
      labelIds: ['lbl-vip'],
      lastMessageId: 'msg-wt-priya-1',
      lastMessageAt: minsAgo(15),
      lastInboundAt: minsAgo(15),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-vikram',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Vikram Malhotra',
      avatarColor: '#7f66ff',
      contactId: 'contact-wt-vikram',
      participantIds: ['contact-wt-vikram'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: minsAgo(30),
      lastInboundAt: minsAgo(30),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-neha',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Neha Gupta',
      avatarColor: '#e542a3',
      contactId: 'contact-wt-neha',
      participantIds: ['contact-wt-neha'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: minsAgo(45),
      lastInboundAt: minsAgo(45),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-nandini',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Nandini Swaminathan',
      avatarColor: '#ff7b29',
      contactId: 'contact-wt-nandini',
      participantIds: ['contact-wt-nandini'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(2),
      lastInboundAt: hoursAgo(2),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-harish',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Harish Chandra Verma',
      avatarColor: '#009de2',
      contactId: 'contact-wt-harish',
      participantIds: ['contact-wt-harish'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(3),
      lastInboundAt: hoursAgo(3),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-deepak',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Deepak Mehta',
      avatarColor: '#25d366',
      contactId: 'contact-wt-deepak',
      participantIds: ['contact-wt-deepak'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(4),
      lastInboundAt: hoursAgo(4),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-amit',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Amit Shah',
      avatarColor: '#f59e0b',
      contactId: 'contact-wt-amit',
      participantIds: ['contact-wt-amit'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(5),
      lastInboundAt: hoursAgo(5),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-kavita',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Kavita Reddy',
      avatarColor: '#ec4899',
      contactId: 'contact-wt-kavita',
      participantIds: ['contact-wt-kavita'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(6),
      lastInboundAt: hoursAgo(6),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-sunil',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Sunil Bharti Mittal',
      avatarColor: '#f59e0b',
      contactId: 'contact-wt-sunil',
      participantIds: ['contact-wt-sunil'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(7),
      lastInboundAt: hoursAgo(7),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-wt-vikramaditya',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Vikramaditya Singhania',
      avatarColor: '#8b5cf6',
      contactId: 'contact-wt-vikramaditya',
      participantIds: ['contact-wt-vikramaditya'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageAt: hoursAgo(8),
      lastInboundAt: hoursAgo(8),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-alex',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
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
      lastInboundAt: minsAgo(12),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-orderbot',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
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
      lastInboundAt: minsAgo(9),
      conversationCategory: 'UTILITY',
    },
    {
      id: 'chat-priya',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
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
      lastInboundAt: minsAgo(22),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-elena',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-001',
      name: 'Elena Rostova',
      avatarColor: '#e542a3',
      contactId: 'contact-elena',
      participantIds: ['contact-elena'],
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: ['lbl-new'],
      lastMessageId: 'msg-elena-1',
      lastMessageAt: hoursAgo(27),
      lastInboundAt: hoursAgo(27), // Expired >24h customer service window for immediate testing!
      conversationCategory: 'MARKETING',
    },
    {
      id: 'chat-qa-group',
      type: 'group',
      phoneNumberId: 'wa-sim-phone-001',
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
      lastInboundAt: minsAgo(48),
      conversationCategory: 'SERVICE',
    },
    {
      id: 'chat-marcus',
      type: 'direct',
      phoneNumberId: 'wa-sim-phone-002',
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
      lastMessageAt: hoursAgo(8),
      lastInboundAt: hoursAgo(8),
      conversationCategory: 'SERVICE',
    },
  ];

  env.preloadedContacts.forEach((seed, idx) => {
    const contactId = `contact-env-${idx + 1}`;
    if (!chats.some((c) => c.contactId === contactId)) {
      chats.push({
        id: `chat-env-${idx + 1}`,
        type: 'direct',
        phoneNumberId: 'wa-sim-phone-001',
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
        lastInboundAt: minsAgo(120 + idx),
        conversationCategory: 'SERVICE',
      });
    }
  });

  const messages: Record<string, Message[]> = {
    'chat-alex': [
      {
        id: 'msg-alex-1',
        chatId: 'chat-alex',
        phoneNumberId: 'wa-sim-phone-001',
        senderId: 'contact-alex',
        senderName: 'Alex Rivera',
        direction: 'inbound',
        type: 'text',
        body: 'Hey! Pointed the staging webhook runner at https://meridian-sandbox.example/webhooks. Ready to verify outbound delivery ticks.',
        linkPreview: extractLinkPreview('https://meridian-sandbox.example/webhooks'),
        timestamp: minsAgo(28),
        status: 'read',
      },
      {
        id: 'msg-alex-2',
        chatId: 'chat-alex',
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
        senderId: 'contact-priya',
        senderName: 'Priya Patel',
        direction: 'inbound',
        type: 'text',
        body: 'Also checking if interactive buttons and template messages work in Business mode.',
        timestamp: minsAgo(22),
        status: 'delivered',
      },
    ],
    'chat-elena': [
      {
        id: 'msg-elena-1',
        chatId: 'chat-elena',
        phoneNumberId: 'wa-sim-phone-001',
        senderId: 'contact-elena',
        senderName: 'Elena Rostova',
        direction: 'inbound',
        type: 'text',
        body: 'Thanks! Let me know next week when the seasonal harvest ships.',
        timestamp: hoursAgo(27),
        status: 'read',
      },
    ],
    'chat-qa-group': [
      {
        id: 'msg-grp-1',
        chatId: 'chat-qa-group',
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-001',
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
        phoneNumberId: 'wa-sim-phone-002',
        senderId: 'contact-marcus',
        senderName: 'Marcus Chen',
        direction: 'inbound',
        type: 'text',
        body: 'STOP',
        timestamp: hoursAgo(8),
        status: 'read',
      },
    ],
  };

  const conversations: ConversationBillingRecord[] = [
    {
      id: 'conv-seed-1',
      chatId: 'chat-alex',
      phoneNumberId: 'wa-sim-phone-001',
      category: 'SERVICE',
      billable: false,
      estimatedCostUsd: 0,
      startedAt: minsAgo(28),
      expiresAt: new Date(now + 23.5 * 3_600_000).toISOString(),
      messageId: 'msg-alex-1',
    },
    {
      id: 'conv-seed-2',
      chatId: 'chat-orderbot',
      phoneNumberId: 'wa-sim-phone-001',
      category: 'UTILITY',
      billable: true,
      estimatedCostUsd: env.pricingRatesUsd.UTILITY,
      startedAt: minsAgo(10),
      expiresAt: new Date(now + 23.8 * 3_600_000).toISOString(),
      messageId: 'msg-bot-1',
    },
  ];

  const statusUpdates: StatusUpdateItem[] = [
    {
      id: 'upd-1',
      contactId: 'contact-alex',
      contactName: 'Alex Rivera',
      avatarUrl: '/src/assets/images/avatar_alex_dev_1795189142888.jpg',
      avatarColor: '#00a884',
      caption: 'Staging webhook suite green — 100% HMAC-SHA256 verified.',
      mediaUrl: '/src/assets/images/catalog_espresso_kit_1795189175804.jpg',
      timestamp: minsAgo(18),
      viewed: false,
    },
    {
      id: 'upd-2',
      contactId: 'contact-priya',
      contactName: 'Priya Patel',
      avatarUrl: '/src/assets/images/avatar_priya_ops_1795189209154.jpg',
      avatarColor: '#53bdeb',
      caption: 'New Q4 catalog items ready for Business API testing.',
      timestamp: hoursAgo(2),
      viewed: true,
    },
  ];

  const callLogs: CallLogItem[] = [
    {
      id: 'call-1',
      contactId: 'contact-alex',
      contactName: 'Alex Rivera',
      avatarUrl: '/src/assets/images/avatar_alex_dev_1795189142888.jpg',
      avatarColor: '#00a884',
      direction: 'incoming',
      kind: 'voice',
      durationSec: 214,
      timestamp: minsAgo(52),
    },
    {
      id: 'call-2',
      contactId: 'contact-priya',
      contactName: 'Priya Patel',
      avatarUrl: '/src/assets/images/avatar_priya_ops_1795189209154.jpg',
      avatarColor: '#53bdeb',
      direction: 'missed',
      kind: 'video',
      timestamp: hoursAgo(3),
    },
  ];

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
      activePhoneNumberId: 'wa-sim-phone-001',
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
        greetingEnabled: true,
        greetingMessage:
          'Welcome to Meridian Coffee Roasters! Reply with your order ID or browse our catalog.',
        awayEnabled: false,
        awayMessage:
          'We are currently outside business hours (Mon–Fri 08:00–18:00 PT). Leave your order number and we will respond promptly.',
        awaySchedule: 'outside_hours',
      },
    },
    phoneNumbers,
    contacts,
    chats,
    messages,
    templates,
    catalog,
    quickReplies,
    labels,
    autoReplyRules,
    mediaIndex: {},
    conversations,
    webhookLogs: [],
    statusUpdates,
    callLogs,
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
    if (loaded && loaded.phoneNumbers && loaded.templates) {
      this.state = loaded;
      this.state.settings.apiKeyConfigured = Boolean(env.apiKey);
    } else {
      // Upgrade seamlessly if persisted file is from Phase 1 schema
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

  getPhoneConfig(phoneNumberId?: string): PhoneNumberConfig {
    const id = phoneNumberId || this.state.settings.activePhoneNumberId;
    return (
      this.state.phoneNumbers.find((p) => p.id === id) ||
      this.state.phoneNumbers[0]
    );
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
      id: input.id?.trim() || `wa-sim-phone-${crypto.randomUUID().slice(0, 6)}`,
      wabaId: input.wabaId?.trim() || 'wa-sim-waba-001',
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
      Pick<Contact, 'name' | 'profileName' | 'phone' | 'about' | 'presence' | 'isBot' | 'isBusiness' | 'blocked'>
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
    if (!contact.optInHistory) {
      contact.optInHistory = [];
    }
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

    // 1. Blocked contact check (rejects outbound per Meta behavior)
    if (directContact?.blocked) {
      const err = META_ERRORS.CONTACT_BLOCKED(
        `Cannot send to ${directContact.phone}: contact is blocked.`
      );
      return this.recordFailedOutbound(chat, phoneCfg, params.body || '[Blocked send]', params.type || 'text', err, 403);
    }

    // 2. Opt-out enforcement: business-initiated template messages are blocked when contact is opted out.
    //    Inbound-triggered session replies within an active 24h window remain allowed.
    if (isBusiness && this.state.settings.enforceOptIn && directContact && directContact.optInStatus === 'opted_out') {
      if (isTemplate) {
        const err = META_ERRORS.RECIPIENT_OPTED_OUT(
          `Contact ${directContact.phone} opted out (${directContact.optInSource}). Business-initiated templates are blocked until re-opt-in (e.g. START).`
        );
        return this.recordFailedOutbound(chat, phoneCfg, params.body || `[Template: ${params.templateName || params.templateId}]`, 'template', err, 403);
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
        return this.recordFailedOutbound(chat, phoneCfg, params.body || '[Session message blocked]', params.type || 'text', err, 400);
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
          (params.templateName && t.name === params.templateName)
      );
      if (!tpl && params.templateName) {
        tpl = {
          id: `tpl-${params.templateName}`,
          name: params.templateName,
          language: 'en_US',
          category: 'MARKETING',
          status: 'APPROVED',
          headerText: 'Wealth Transformers Notice',
          bodyText: `Dear {{1}}, notice regarding {{2}} {{3}}.`,
          footerText: 'Wealth Transformers India Pvt Ltd | SEBI Reg: INZ000123456',
          sampleValues: ['Valued Investor', 'Portfolio', 'Update'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.state.templates.push(tpl);
      }
      if (!tpl || tpl.status !== 'APPROVED') {
        const err = META_ERRORS.TEMPLATE_NOT_APPROVED(
          tpl
            ? `Template "${tpl.name}" has status ${tpl.status} (must be APPROVED).`
            : `Template "${params.templateName || params.templateId}" was not found.`
        );
        return { ok: false, httpStatus: 400, error: err };
      }

      const vars =
        params.templateVariables && params.templateVariables.length > 0
          ? params.templateVariables
          : tpl.sampleValues;
      const renderedBody = renderTemplateBody(tpl.bodyText, vars);
      templatePayload = {
        templateId: tpl.id,
        templateName: tpl.name,
        language: tpl.language,
        category: tpl.category,
        headerText: tpl.headerText,
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

      if (!params.metadata?.businessAutomation) {
        this.triggerAutoReplyIfMatched(chat, message);
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
    httpStatus: number
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
    this.persist();
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
    errorCode?: number
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
                : META_ERRORS.MESSAGE_UNDELIVERABLE(
                    `Failed receipt set with Meta error code ${errorCode || 131026}`
                  );
        } else {
          msg.error = undefined;
        }

        const phoneCfg = this.getPhoneConfig(msg.phoneNumberId);
        const category = msg.conversationCategory || 'SERVICE';
        const rate = this.state.settings.pricingRatesUsd[category] ?? 0;

        this.persist();
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

    if (input.id) {
      const existing = this.state.templates.find((t) => t.id === input.id);
      if (existing) {
        const prevStatus = existing.status;
        Object.assign(existing, {
          name: cleanName,
          language: input.language || existing.language,
          category: input.category || existing.category,
          status: input.status || existing.status,
          headerText: input.headerText,
          bodyText: input.bodyText,
          footerText: input.footerText,
          buttons: input.buttons || existing.buttons,
          sampleValues: input.sampleValues || existing.sampleValues,
          rejectionReason: input.rejectionReason,
          updatedAt: now,
        });
        this.emitBusinessUpdate();
        if (input.status && input.status !== prevStatus) {
          this.emitTemplateStatusWebhook(existing);
        }
        return existing;
      }
    }

    const created: MessageTemplate = {
      id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName,
      language: input.language || 'en_US',
      category: input.category,
      status: input.status || 'PENDING',
      headerText: input.headerText?.trim() || undefined,
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
}
