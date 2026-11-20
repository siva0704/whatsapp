import dotenv from 'dotenv';
import path from 'path';
import type {
  AutoReplyRule,
  Contact,
  ConversationCategory,
  EmulatorVariant,
} from '../shared/types';

dotenv.config();

export interface EnvContactSeed {
  name: string;
  phone: string;
  about?: string;
  isBot?: boolean;
  isBusiness?: boolean;
  optInStatus?: 'opted_in' | 'opted_out' | 'unknown';
}

export interface EnvAutoReplySeed {
  name: string;
  pattern: string;
  matchType?: 'contains' | 'regex' | 'exact';
  reply: string;
  delayMs?: number;
  simulateTypingMs?: number;
  contactId?: string;
  respectOptOut?: boolean;
}

export interface EnvPhoneNumberSeed {
  id: string;
  wabaId?: string;
  phoneNumber: string;
  displayName: string;
  verifiedName?: string;
  webhookUrl?: string;
}

export interface EmulatorEnvConfig {
  port: number;
  variant: EmulatorVariant;
  apiKey: string;
  webhookUrl: string;
  webhookSecret: string;
  dataFile: string;
  mediaDir: string;
  selfName: string;
  selfPhone: string;
  lifecycleDeliveredMs: number;
  lifecycleReadMs: number;
  enforce24hWindow: boolean;
  enforceOptIn: boolean;
  pricingRatesUsd: Record<ConversationCategory, number>;
  preloadedContacts: EnvContactSeed[];
  autoReplyRules: EnvAutoReplySeed[];
  phoneNumbers: EnvPhoneNumberSeed[];
}

function parseJsonArray<T>(raw: string | undefined): T[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T extends Record<string, number>>(
  raw: string | undefined,
  fallback: T
): T {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
}

const DEFAULT_PRICING_RATES: Record<ConversationCategory, number> = {
  MARKETING: 0.025,
  UTILITY: 0.015,
  AUTHENTICATION: 0.0135,
  SERVICE: 0.0,
};

export function loadEnvConfig(): EmulatorEnvConfig {
  const rawVariant = (process.env.EMULATOR_VARIANT || 'personal').toLowerCase();
  const variant: EmulatorVariant = rawVariant === 'business' ? 'business' : 'personal';

  const dataFile = path.resolve(
    process.cwd(),
    process.env.EMULATOR_DATA_FILE || './data/emulator-state.json'
  );
  const mediaDir = path.resolve(path.dirname(dataFile), 'media');

  return {
    port: parseNumber(process.env.PORT, 3000),
    variant,
    apiKey: (process.env.EMULATOR_API_KEY || '').trim(),
    webhookUrl: (process.env.EMULATOR_WEBHOOK_URL || '').trim(),
    webhookSecret: (process.env.EMULATOR_WEBHOOK_SECRET || 'wa-sim-webhook-secret').trim(),
    dataFile,
    mediaDir,
    selfName: (process.env.EMULATOR_SELF_NAME || 'QA Sandbox Account').trim(),
    selfPhone: (process.env.EMULATOR_SELF_PHONE || '+14155550100').trim(),
    lifecycleDeliveredMs: parseNumber(process.env.EMULATOR_LIFECYCLE_DELIVERED_MS, 450),
    lifecycleReadMs: parseNumber(process.env.EMULATOR_LIFECYCLE_READ_MS, 1400),
    enforce24hWindow: parseBool(process.env.EMULATOR_ENFORCE_24H_WINDOW, true),
    enforceOptIn: parseBool(process.env.EMULATOR_ENFORCE_OPT_IN, true),
    pricingRatesUsd: parseJsonObject(process.env.EMULATOR_PRICING_RATES, DEFAULT_PRICING_RATES),
    preloadedContacts: parseJsonArray<EnvContactSeed>(process.env.EMULATOR_PRELOADED_CONTACTS),
    autoReplyRules: parseJsonArray<EnvAutoReplySeed>(process.env.EMULATOR_AUTO_REPLY_RULES),
    phoneNumbers: parseJsonArray<EnvPhoneNumberSeed>(process.env.EMULATOR_PHONE_NUMBERS),
  };
}

export function toContactFromSeed(seed: EnvContactSeed, index: number): Contact {
  const colors = ['#00a884', '#53bdeb', '#7f66ff', '#e542a3', '#ff7b29', '#009de2'];
  const now = new Date().toISOString();
  const status = seed.optInStatus || 'opted_in';
  return {
    id: `contact-env-${index + 1}`,
    name: seed.name,
    profileName: seed.name,
    phone: seed.phone,
    avatarColor: colors[index % colors.length],
    about: seed.about || 'Preloaded via .env',
    isBot: Boolean(seed.isBot),
    isBusiness: Boolean(seed.isBusiness),
    blocked: false,
    optInStatus: status,
    optInUpdatedAt: now,
    optInSource: 'env_seed',
    optInHistory: [
      {
        id: `opt-env-${index + 1}`,
        status,
        timestamp: now,
        source: 'env_seed',
        note: 'Seeded from EMULATOR_PRELOADED_CONTACTS',
      },
    ],
    presence: 'online',
    lastSeen: now,
  };
}

export function toRuleFromSeed(seed: EnvAutoReplySeed, index: number): AutoReplyRule {
  return {
    id: `rule-env-${index + 1}`,
    name: seed.name || `Env Rule ${index + 1}`,
    enabled: true,
    matchType: seed.matchType || 'contains',
    pattern: seed.pattern,
    reply: seed.reply,
    contactId: seed.contactId,
    delayMs: typeof seed.delayMs === 'number' ? seed.delayMs : 700,
    simulateTypingMs: typeof seed.simulateTypingMs === 'number' ? seed.simulateTypingMs : 550,
    respectOptOut: seed.respectOptOut !== false,
  };
}
