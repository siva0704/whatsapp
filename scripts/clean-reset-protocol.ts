import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const statePath = path.resolve(__dirname, '../data/emulator-state.json');

const MLAS = [
  {
    id: 'cnt-919845011223',
    name: 'Hon. Rajesh Kumar',
    profileName: 'Rajesh Kumar MLA',
    phone: '+919845011223',
    country: 'IN',
    tags: ['mla', 'tier-1', 'vip'],
    optInStatus: 'opted_in',
    windowOpen: true,
  },
  {
    id: 'cnt-919845022334',
    name: 'Dr. Ananya Hegde',
    profileName: 'Dr. Ananya Hegde MLA',
    phone: '+919845022334',
    country: 'IN',
    tags: ['mla', 'tier-2', 'vip'],
    optInStatus: 'opted_in',
    windowOpen: true,
  },
  {
    id: 'cnt-919845033445',
    name: 'Sri B. S. Patil',
    profileName: 'B. S. Patil MLA',
    phone: '+919845033445',
    country: 'IN',
    tags: ['mla', 'tier-3', 'vip'],
    optInStatus: 'opted_in',
    windowOpen: true,
  },
];

const now = new Date().toISOString();

const cleanState = {
  self: {
    id: 'me',
    name: 'Karnataka State Protocol Vehicle Desk',
    phone: '+918022033500',
    about: 'Official Vehicle Allotment Desk for Hon\'ble MLAs | DPAR, Government of Karnataka',
    avatarUrl: '/assets/vehicle-desk-emblem.svg',
  },
  settings: {
    variant: 'business',
    activePhoneNumberId: 'wa-sim-phone-001',
    webhookUrl: 'http://localhost:4000/api/whatsapp/webhook',
    webhookSecret: 'wa-sim-webhook-secret',
    apiKeyConfigured: true,
    lifecycleDeliveredMs: 200,
    lifecycleReadMs: 400,
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
      wabaId: 'waba-karnataka-protocol',
      phoneNumber: '+918022033500',
      displayName: 'Karnataka State Protocol Vehicle Desk',
      verifiedName: 'Karnataka State Protocol Vehicle Desk',
      qualityRating: 'GREEN',
      webhookUrl: 'http://localhost:4000/api/whatsapp/webhook',
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
  contacts: MLAS.map((m) => ({
    id: m.id,
    name: m.name,
    profileName: m.profileName,
    phone: m.phone,
    country: m.country,
    optInStatus: m.optInStatus,
    windowOpen: true,
    tags: m.tags,
    createdAt: now,
    updatedAt: now,
  })),
  chats: MLAS.map((m, idx) => ({
    id: `chat-${m.phone.replace(/[^\d]/g, '').slice(-8)}`,
    type: 'direct',
    phoneNumberId: 'wa-sim-phone-001',
    name: m.name,
    avatarColor: '#00a884',
    contactId: m.id,
    participantIds: [m.id],
    unreadCount: 0,
    archived: false,
    pinned: false,
    muted: false,
    labelIds: [],
    lastMessageId: `wamid.welcome.${idx}`,
    lastMessageAt: now,
    lastInboundAt: null,
    conversationCategory: 'SERVICE',
  })),
  messages: {},
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
    invalidNumberPct: 0,
    disabledNumberPct: 0,
    optOutPct: 0,
    windowClosedPct: 0,
    error500Pct: 0,
  },
  rateLimits: {
    enabled: true,
    messagesPerSecond: 100,
    messagesPerMinute: 6000,
    pairMessagesPerMinute: 1000,
    dailyTemplateLimit: 10000,
  },
  rateLimitUsage: {
    windowSecondCounts: {},
    windowMinuteCounts: {},
    dailyTemplatesSent: 0,
    dailyResetAt: new Date(Date.now() + 86400000).toISOString(),
    totalThrottled: 0,
  },
};

// Seed initial welcome message in each chat
MLAS.forEach((m, idx) => {
  const chatId = `chat-${m.phone.replace(/[^\d]/g, '').slice(-8)}`;
  const msgId = `wamid.welcome.${idx}`;
  cleanState.messages[chatId] = [
    {
      id: msgId,
      chatId,
      phoneNumberId: 'wa-sim-phone-001',
      senderId: 'me',
      senderName: 'Karnataka State Protocol Vehicle Desk',
      direction: 'outbound',
      type: 'text',
      body: `🏛 *Karnataka State Protocol Fleet Desk*\n\nNamaskara ${m.name}.\nWelcome to the official WhatsApp vehicle allotment desk for Hon'ble MLAs.\n\nReply with your travel requirements (e.g., *"Need car tomorrow at 10 AM from Vidhana Soudha to Airport"*) to request an official vehicle.`,
      timestamp: now,
      status: 'read',
      conversationCategory: 'SERVICE',
      metadata: {
        cloudApiVersion: 'v19.0',
        phoneNumberId: 'wa-sim-phone-001',
      },
    },
  ];
});

fs.writeFileSync(statePath, JSON.stringify(cleanState, null, 2), 'utf-8');
console.log('Clean reset successfully applied! All dummy finance contacts purged. Only MLAs present.');
