import fs from 'fs';
import type {
  BulkSeedRequest,
  ClientPersonality,
  ClientReceiptTiming,
  ClientSeedInput,
  Contact,
  InteractivePayload,
  Message,
  OptInStatus,
} from '../shared/types';
import { isValidE164, normalizeE164 } from './compliance';

/** Deterministic PRNG (Mulberry32) so QA pipelines can reproduce exact cohorts. */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

interface CountrySpec {
  code: string;
  dial: string;
  timezone: string;
  defaultSegment: string;
  firstNames: string[];
  lastNames: string[];
}

const COUNTRY_CATALOG: CountrySpec[] = [
  {
    code: 'IN',
    dial: '+91',
    timezone: 'Asia/Kolkata',
    defaultSegment: 'chennai',
    firstNames: ['Aarav', 'Ananya', 'Karthik', 'Divya', 'Vikram', 'Meera', 'Rohan', 'Lakshmi', 'Arjun', 'Kavya', 'Siddharth', 'Nithya'],
    lastNames: ['Subramanian', 'Krishnan', 'Nair', 'Iyer', 'Reddy', 'Sharma', 'Patel', 'Menon', 'Rajan', 'Venkatesh'],
  },
  {
    code: 'US',
    dial: '+1',
    timezone: 'America/Los_Angeles',
    defaultSegment: 'premium',
    firstNames: ['Maya', 'Jordan', 'Taylor', 'Ethan', 'Hannah', 'Liam', 'Chloe', 'Noah', 'Zoe', 'Caleb'],
    lastNames: ['Brooks', 'Hayes', 'Kim', 'Morales', 'Bennett', 'Foster', 'Reed', 'Sullivan', 'Price', 'Ward'],
  },
  {
    code: 'SG',
    dial: '+65',
    timezone: 'Asia/Singapore',
    defaultSegment: 'enterprise',
    firstNames: ['Wei', 'Mei', 'Jian', 'Siti', 'Daniel', 'Rachel', 'Hui', 'Darren'],
    lastNames: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Goh', 'Chua', 'Ong'],
  },
  {
    code: 'GB',
    dial: '+44',
    timezone: 'Europe/London',
    defaultSegment: 'leads',
    firstNames: ['Oliver', 'Amelia', 'Harry', 'Isla', 'Jack', 'Freya', 'George', 'Sophie'],
    lastNames: ['Clarke', 'Davies', 'Evans', 'Hughes', 'Morgan', 'Turner', 'Wright', 'Baker'],
  },
  {
    code: 'AE',
    dial: '+971',
    timezone: 'Asia/Dubai',
    defaultSegment: 'vip',
    firstNames: ['Omar', 'Layla', 'Zaid', 'Nadia', 'Tariq', 'Farah', 'Rashid', 'Amira'],
    lastNames: ['Al-Mansoor', 'Haddad', 'Khoury', 'Nasser', 'Saleh', 'Farooq', 'Qureshi', 'Zaman'],
  },
];

const DEFAULT_SEGMENTS = ['premium', 'chennai', 'leads', 'festival', 'vip', 'enterprise'];
const PERSONALITIES: ClientPersonality[] = [
  'engaged',
  'button_clicker',
  'silent',
  'catalog_browser',
  'quick_opt_out',
  'custom_keyword',
];
const AVATAR_COLORS = ['#00a884', '#53bdeb', '#7f66ff', '#e542a3', '#ff7b29', '#009de2', '#25d366'];

export function defaultReceiptTimingForPersonality(
  personality: ClientPersonality
): ClientReceiptTiming {
  switch (personality) {
    case 'engaged':
      return { deliveredMinMs: 60, deliveredMaxMs: 180, readMinMs: 180, readMaxMs: 420, readProbability: 0.95 };
    case 'button_clicker':
      return { deliveredMinMs: 50, deliveredMaxMs: 160, readMinMs: 150, readMaxMs: 360, readProbability: 0.92 };
    case 'catalog_browser':
      return { deliveredMinMs: 70, deliveredMaxMs: 210, readMinMs: 200, readMaxMs: 480, readProbability: 0.88 };
    case 'quick_opt_out':
      return { deliveredMinMs: 50, deliveredMaxMs: 150, readMinMs: 140, readMaxMs: 320, readProbability: 0.98 };
    case 'custom_keyword':
      return { deliveredMinMs: 70, deliveredMaxMs: 200, readMinMs: 190, readMaxMs: 450, readProbability: 0.9 };
    case 'silent':
    default:
      return { deliveredMinMs: 90, deliveredMaxMs: 280, readMinMs: 350, readMaxMs: 900, readProbability: 0.45 };
  }
}

export function generateSeededClients(
  request: BulkSeedRequest,
  existingPhones: Set<string>
): ClientSeedInput[] {
  const results: ClientSeedInput[] = [];
  const usedPhones = new Set(existingPhones);

  // Explicit clients array takes precedence when provided
  if (Array.isArray(request.clients) && request.clients.length > 0) {
    for (const raw of request.clients) {
      const phone = normalizeE164(raw.phone);
      if (!isValidE164(phone) || usedPhones.has(phone)) continue;
      usedPhones.add(phone);
      results.push({
        ...raw,
        phone,
        name: raw.name?.trim() || phone,
        profileName: raw.profileName?.trim() || raw.name?.trim() || phone,
        country: raw.country || 'IN',
        tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : ['leads'],
        timezone: raw.timezone || 'Asia/Kolkata',
        optInStatus: raw.optInStatus || 'opted_in',
        personality: raw.personality || 'engaged',
      });
    }
    return results;
  }

  const count = Math.max(0, Math.min(1000, Math.floor(request.count ?? 25)));
  const seed = typeof request.seed === 'number' && Number.isFinite(request.seed) ? request.seed : 202604;
  const rng = createSeededRng(seed);

  const allowedCountries =
    request.countries && request.countries.length > 0
      ? COUNTRY_CATALOG.filter((c) => request.countries!.includes(c.code))
      : COUNTRY_CATALOG;
  const countryPool = allowedCountries.length > 0 ? allowedCountries : COUNTRY_CATALOG;

  const customSegments =
    request.segments && request.segments.length > 0
      ? request.segments.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [];

  const invalidPct = Math.max(0, Math.min(100, request.invalidPct ?? 0));
  const optOutPct = Math.max(0, Math.min(100, request.optOutPct ?? 6));
  const disabledPct = Math.max(0, Math.min(100, request.disabledPct ?? 0));

  for (let i = 0; i < count; i++) {
    const spec = countryPool[Math.floor(rng() * countryPool.length)];
    const first = spec.firstNames[Math.floor(rng() * spec.firstNames.length)];
    const last = spec.lastNames[Math.floor(rng() * spec.lastNames.length)];

    let phone = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const tail =
        spec.code === 'IN'
          ? `98${Math.floor(10000000 + rng() * 89999999)}`
          : spec.code === 'US'
            ? `415555${String(Math.floor(1000 + rng() * 8999))}`
            : spec.code === 'SG'
              ? `9${Math.floor(1000000 + rng() * 8999999)}`
              : spec.code === 'GB'
                ? `77009${String(Math.floor(10000 + rng() * 89999))}`
                : `50${Math.floor(1000000 + rng() * 8999999)}`;
      const candidate = `${spec.dial}${tail}`;
      if (!usedPhones.has(candidate) && isValidE164(candidate)) {
        phone = candidate;
        usedPhones.add(candidate);
        break;
      }
    }
    if (!phone) continue;

    // Personality distribution weighted realistically: engaged 32%, button_clicker 22%, silent 26%, catalog_browser 10%, custom_keyword 5%, quick_opt_out 5%
    const pRoll = rng();
    let personality: ClientPersonality = 'silent';
    if (pRoll < 0.32) personality = 'engaged';
    else if (pRoll < 0.54) personality = 'button_clicker';
    else if (pRoll < 0.80) personality = 'silent';
    else if (pRoll < 0.90) personality = 'catalog_browser';
    else if (pRoll < 0.95) personality = 'custom_keyword';
    else personality = 'quick_opt_out';

    const invalidNumber = rng() * 100 < invalidPct;
    const disabled = !invalidNumber && rng() * 100 < disabledPct;
    const optedOut = rng() * 100 < optOutPct;
    const optInStatus: OptInStatus = optedOut ? 'opted_out' : 'opted_in';

    const tags = new Set<string>();
    if (customSegments.length > 0) {
      tags.add(customSegments[i % customSegments.length]);
    } else {
      tags.add(spec.defaultSegment);
      const extraTag = DEFAULT_SEGMENTS[Math.floor(rng() * DEFAULT_SEGMENTS.length)];
      tags.add(extraTag);
    }

    const customReplies = ['Interested! Send details.', 'Can you share pricing?', 'Thanks for the update!', 'Yes please!'];

    results.push({
      name: `${first} ${last}`,
      profileName: first,
      phone,
      country: spec.code,
      tags: Array.from(tags),
      timezone: spec.timezone,
      optInStatus,
      personality,
      customReplyText:
        personality === 'custom_keyword'
          ? customReplies[Math.floor(rng() * customReplies.length)]
          : undefined,
      invalidNumber,
      disabled,
      windowOpen: rng() < 0.35, // ~35% have active 24h window, ~65% require approved templates!
      receiptTiming: defaultReceiptTimingForPersonality(personality),
    });
  }

  return results;
}

export function buildContactFromClientSeed(
  input: ClientSeedInput,
  indexOffset: number,
  source = 'bulk_seed'
): Contact {
  const now = new Date().toISOString();
  const personality = input.personality || 'engaged';
  const baseTiming = defaultReceiptTimingForPersonality(personality);
  const receiptTiming: ClientReceiptTiming = {
    deliveredMinMs: input.receiptTiming?.deliveredMinMs ?? baseTiming.deliveredMinMs,
    deliveredMaxMs: input.receiptTiming?.deliveredMaxMs ?? baseTiming.deliveredMaxMs,
    readMinMs: input.receiptTiming?.readMinMs ?? baseTiming.readMinMs,
    readMaxMs: input.receiptTiming?.readMaxMs ?? baseTiming.readMaxMs,
    readProbability: input.receiptTiming?.readProbability ?? baseTiming.readProbability,
  };
  const optInStatus: OptInStatus = input.optInStatus || 'opted_in';

  return {
    id: `client-${input.phone.replace(/[^\d]/g, '')}`,
    name: input.name.trim() || input.phone,
    profileName: input.profileName?.trim() || input.name.trim() || input.phone,
    phone: normalizeE164(input.phone),
    avatarColor: AVATAR_COLORS[indexOffset % AVATAR_COLORS.length],
    about: `${input.country || 'IN'} · ${(input.tags || ['leads']).join(', ')} · ${personality.replace(/_/g, ' ')}`,
    isBot: false,
    isBusiness: false,
    blocked: false,
    disabled: Boolean(input.disabled),
    invalidNumber: Boolean(input.invalidNumber),
    country: input.country || 'IN',
    tags: Array.isArray(input.tags) && input.tags.length > 0 ? input.tags : ['leads'],
    timezone: input.timezone || 'Asia/Kolkata',
    personality,
    customReplyText: input.customReplyText,
    receiptTiming,
    seeded: true,
    optInStatus,
    optInUpdatedAt: now,
    optInSource: source,
    optInHistory: [
      {
        id: `opt-seed-${indexOffset}-${Date.now()}`,
        status: optInStatus,
        timestamp: now,
        source,
        note:
          optInStatus === 'opted_out'
            ? 'Seeded as opted-out client'
            : 'Seeded client with valid opt-in',
      },
    ],
    presence: 'online',
    lastSeen: now,
  };
}

export function loadClientSeedFile(filePath: string): ClientSeedInput[] {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ClientSeedInput[];
    if (parsed && Array.isArray(parsed.clients)) return parsed.clients as ClientSeedInput[];
    return [];
  } catch {
    return [];
  }
}

export interface ComputedClientResponse {
  delayMs: number;
  type: 'text' | 'interactive';
  body: string;
  interactive?: InteractivePayload;
  reason: string;
}

/**
 * Determines how a seeded personal WhatsApp client reacts to an outbound business message
 * (template broadcast, promotional offer, interactive buttons, or festival wish).
 */
export function computeClientAutoResponse(
  contact: Contact,
  outboundMessage: Message,
  rngValue: number = Math.random()
): ComputedClientResponse | null {
  if (!contact.seeded || contact.blocked || contact.disabled || contact.invalidNumber) {
    return null;
  }

  const personality = contact.personality || 'silent';
  if (personality === 'silent') return null;

  const baseDelay = 260 + Math.floor(rngValue * 420);

  if (personality === 'quick_opt_out') {
    return {
      delayMs: baseDelay,
      type: 'text',
      body: 'STOP',
      reason: 'quick_opt_out personality replied STOP',
    };
  }

  if (personality === 'button_clicker') {
    const quickReplyBtn = outboundMessage.template?.buttons.find(
      (b) => b.type === 'QUICK_REPLY' || b.type === 'URL' || b.type === 'COPY_CODE'
    );
    const interBtn = outboundMessage.interactive?.buttons?.[0];
    if (interBtn) {
      return {
        delayMs: baseDelay,
        type: 'interactive',
        body: interBtn.title,
        interactive: {
          kind: 'button_reply',
          bodyText: interBtn.title,
          selectedId: interBtn.id,
          selectedTitle: interBtn.title,
        },
        reason: `Clicked interactive button "${interBtn.title}"`,
      };
    }
    if (quickReplyBtn) {
      return {
        delayMs: baseDelay,
        type: 'interactive',
        body: quickReplyBtn.text,
        interactive: {
          kind: 'button_reply',
          bodyText: quickReplyBtn.text,
          selectedId: `tpl_btn_${quickReplyBtn.type.toLowerCase()}`,
          selectedTitle: quickReplyBtn.text,
        },
        reason: `Clicked template button "${quickReplyBtn.text}"`,
      };
    }
    return {
      delayMs: baseDelay,
      type: 'text',
      body: 'Confirmed, thanks!',
      reason: 'button_clicker fallback acknowledgement',
    };
  }

  if (personality === 'catalog_browser') {
    return {
      delayMs: baseDelay + 120,
      type: 'text',
      body: 'Viewed catalog — can you share availability and delivery ETA for the Pour-Over Brew Kit?',
      reason: 'catalog_browser viewed product catalog',
    };
  }

  if (personality === 'custom_keyword') {
    return {
      delayMs: baseDelay,
      type: 'text',
      body: contact.customReplyText?.trim() || 'Thanks! Please share more details.',
      reason: 'custom_keyword personality response',
    };
  }

  // 'engaged' personality replies thoughtfully depending on message category/content
  if (personality === 'engaged') {
    const lower = outboundMessage.body.toLowerCase();
    if (lower.includes('code') || lower.includes('verification') || outboundMessage.template?.category === 'AUTHENTICATION') {
      return {
        delayMs: baseDelay,
        type: 'text',
        body: 'Got the verification code, logged in!',
        reason: 'engaged OTP confirmation',
      };
    }
    if (lower.includes('order') || lower.includes('shipment') || lower.includes('delivery')) {
      return {
        delayMs: baseDelay,
        type: 'text',
        body: 'Awesome, looking forward to the delivery!',
        reason: 'engaged order acknowledgement',
      };
    }
    return {
      delayMs: baseDelay,
      type: 'text',
      body: `Thanks! Interested in this offer (${contact.tags?.[0] || 'customer'}).`,
      reason: 'engaged promotional reply',
    };
  }

  return null;
}

export function getAllPersonalities(): ClientPersonality[] {
  return [...PERSONALITIES];
}
