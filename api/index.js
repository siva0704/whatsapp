// server/app.ts
import express2 from "express";

// server/config.ts
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config();
function parseJsonArray(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function parseJsonObject(raw, fallback) {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}
function parseNumber(raw, fallback) {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function parseBool(raw, fallback) {
  if (raw === void 0 || raw === "") return fallback;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}
var DEFAULT_PRICING_RATES = {
  MARKETING: 0.025,
  UTILITY: 0.015,
  AUTHENTICATION: 0.0135,
  SERVICE: 0
};
function loadEnvConfig() {
  const rawVariant = (process.env.EMULATOR_VARIANT || "business").toLowerCase();
  const variant = rawVariant === "personal" ? "personal" : "business";
  const isServerless = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION || process.env.LAMBDA_TASK_ROOT
  );
  let dataFile = isServerless ? path.resolve("/tmp", "emulator-state.json") : path.resolve(process.cwd(), process.env.EMULATOR_DATA_FILE || "./data/emulator-state.json");
  if (isServerless && !fs.existsSync(dataFile)) {
    try {
      const seedFile = path.resolve(process.cwd(), "data", "emulator-state.json");
      if (fs.existsSync(seedFile)) {
        fs.copyFileSync(seedFile, dataFile);
      }
    } catch (err) {
    }
  }
  const mediaDir = isServerless ? path.resolve("/tmp", "media") : path.resolve(path.dirname(dataFile), "media");
  const seedFileRaw = (process.env.EMULATOR_CLIENT_SEED_FILE || "").trim();
  return {
    port: parseNumber(process.env.PORT, 4020),
    variant,
    apiKey: (process.env.EMULATOR_API_KEY || "").trim(),
    webhookUrl: (process.env.EMULATOR_WEBHOOK_URL || "").trim(),
    webhookSecret: (process.env.EMULATOR_WEBHOOK_SECRET || "wa-sim-webhook-secret").trim(),
    dataFile,
    mediaDir,
    selfName: (process.env.EMULATOR_SELF_NAME || "WhatsApp Business").trim(),
    selfPhone: (process.env.EMULATOR_SELF_PHONE || "").trim(),
    lifecycleDeliveredMs: parseNumber(process.env.EMULATOR_LIFECYCLE_DELIVERED_MS, 450),
    lifecycleReadMs: parseNumber(process.env.EMULATOR_LIFECYCLE_READ_MS, 1400),
    enforce24hWindow: parseBool(process.env.EMULATOR_ENFORCE_24H_WINDOW, true),
    enforceOptIn: parseBool(process.env.EMULATOR_ENFORCE_OPT_IN, true),
    pricingRatesUsd: parseJsonObject(process.env.EMULATOR_PRICING_RATES, DEFAULT_PRICING_RATES),
    preloadedContacts: parseJsonArray(process.env.EMULATOR_PRELOADED_CONTACTS),
    autoReplyRules: parseJsonArray(process.env.EMULATOR_AUTO_REPLY_RULES),
    phoneNumbers: parseJsonArray(process.env.EMULATOR_PHONE_NUMBERS),
    clientSeedFile: seedFileRaw ? path.resolve(process.cwd(), seedFileRaw) : "",
    clientSeedCount: parseNumber(process.env.EMULATOR_CLIENT_SEED_COUNT, 0),
    broadcastThroughputPerSec: parseNumber(process.env.EMULATOR_BROADCAST_THROUGHPUT, 25),
    broadcastConcurrency: parseNumber(process.env.EMULATOR_BROADCAST_CONCURRENCY, 8),
    rateLimitPerSecond: parseNumber(process.env.EMULATOR_RATE_LIMIT_PER_SEC, 80),
    rateLimitPerMinute: parseNumber(process.env.EMULATOR_RATE_LIMIT_PER_MIN, 1200),
    pairRateLimitPerMinute: parseNumber(process.env.EMULATOR_PAIR_RATE_LIMIT_PER_MIN, 15),
    dailyTemplateLimit: parseNumber(process.env.EMULATOR_DAILY_TEMPLATE_LIMIT, 1e3)
  };
}
function toContactFromSeed(seed, index) {
  const colors = ["#00a884", "#53bdeb", "#7f66ff", "#e542a3", "#ff7b29", "#009de2"];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const status = seed.optInStatus || "opted_in";
  return {
    id: `contact-env-${index + 1}`,
    name: seed.name,
    profileName: seed.name,
    phone: seed.phone,
    avatarColor: colors[index % colors.length],
    about: seed.about || "Preloaded via .env",
    isBot: Boolean(seed.isBot),
    isBusiness: Boolean(seed.isBusiness),
    blocked: false,
    optInStatus: status,
    optInUpdatedAt: now,
    optInSource: "env_seed",
    optInHistory: [
      {
        id: `opt-env-${index + 1}`,
        status,
        timestamp: now,
        source: "env_seed",
        note: "Seeded from EMULATOR_PRELOADED_CONTACTS"
      }
    ],
    presence: "online",
    lastSeen: now
  };
}
function toRuleFromSeed(seed, index) {
  return {
    id: `rule-env-${index + 1}`,
    name: seed.name || `Env Rule ${index + 1}`,
    enabled: true,
    matchType: seed.matchType || "contains",
    pattern: seed.pattern,
    reply: seed.reply,
    contactId: seed.contactId,
    delayMs: typeof seed.delayMs === "number" ? seed.delayMs : 700,
    simulateTypingMs: typeof seed.simulateTypingMs === "number" ? seed.simulateTypingMs : 550,
    respectOptOut: seed.respectOptOut !== false
  };
}

// server/engine.ts
import crypto2 from "crypto";

// server/compliance.ts
var TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1e3;
var META_ERRORS = {
  MESSAGE_UNDELIVERABLE: (details = "Recipient cannot receive messages or has blocked this number.") => ({
    code: 131026,
    title: "Message undeliverable",
    message: "(#131026) Message undeliverable",
    errorData: { details }
  }),
  RE_ENGAGEMENT_REQUIRED: (details = "More than 24 hours have passed since the customer last replied. Send an approved template message to re-engage.") => ({
    code: 131047,
    title: "Re-engagement message",
    message: "(#131047) Re-engagement message required outside 24-hour customer service window",
    errorData: { details }
  }),
  RECIPIENT_OPTED_OUT: (details = "Business-initiated message blocked: recipient has opted out of marketing/template messages.") => ({
    code: 131049,
    title: "Recipient opted out",
    message: "(#131049) Message not delivered to maintain healthy ecosystem engagement (recipient opted out)",
    errorData: { details }
  }),
  TEMPLATE_NOT_APPROVED: (details = "Template does not exist or has not been APPROVED.") => ({
    code: 132001,
    title: "Template does not exist or not approved",
    message: "(#132001) Template name does not exist in translation or is not APPROVED",
    errorData: { details }
  }),
  CONTACT_BLOCKED: (details = "Recipient number is blocked.") => ({
    code: 131026,
    title: "Message undeliverable (blocked)",
    message: "(#131026) Recipient is blocked and cannot exchange messages",
    errorData: { details }
  }),
  DISABLED_NUMBER: (details = "Recipient WhatsApp account is disabled or unreachable.") => ({
    code: 131026,
    title: "Message undeliverable (disabled number)",
    message: "(#131026) Recipient phone number is disabled or not active on WhatsApp",
    errorData: { details }
  }),
  INVALID_RECIPIENT: (details = "Recipient phone number is not registered on WhatsApp or not in allowed list.") => ({
    code: 131030,
    title: "Recipient phone number not in allowed list",
    message: "(#131030) Recipient phone number is invalid or not a valid WhatsApp account",
    errorData: { details }
  }),
  PAIR_RATE_LIMIT: (details = "Too many messages sent to the same recipient from this business number in a short window.") => ({
    code: 131056,
    title: "Pair rate limit hit",
    message: "(#131056) Pair rate limit hit \u2014 wait before sending another message to this recipient",
    errorData: { details }
  }),
  THROUGHPUT_RATE_LIMIT: (details = "Messaging throughput or aggregate daily template limit exceeded. Back off and retry.") => ({
    code: 130429,
    title: "Rate limit hit",
    message: "(#130429) Cloud API throughput or daily messaging limit exceeded (HTTP 429)",
    errorData: { details }
  })
};
var E164_REGEX = /^\+[1-9]\d{6,14}$/;
function isValidE164(phone) {
  return E164_REGEX.test(phone.trim());
}
function normalizeE164(phone) {
  const cleaned = phone.trim().replace(/[\s\-().]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
var OPT_OUT_PATTERNS = [
  { keyword: "STOPALL", regex: /(?<![\p{L}\p{N}_])STOPALL(?![\p{L}\p{N}_])/iu },
  { keyword: "UNSUBSCRIBE", regex: /(?<![\p{L}\p{N}_])UNSUBSCRIBE(?![\p{L}\p{N}_])/iu },
  { keyword: "OPT-OUT", regex: /(?<![\p{L}\p{N}_])OPT-OUT(?![\p{L}\p{N}_])/iu },
  { keyword: "STOP", regex: /(?<![\p{L}\p{N}_])STOP(?![\p{L}\p{N}_])/iu }
];
var OPT_IN_PATTERNS = [
  { keyword: "UNSTOP", regex: /(?<![\p{L}\p{N}_])UNSTOP(?![\p{L}\p{N}_])/iu },
  { keyword: "SUBSCRIBE", regex: /(?<![\p{L}\p{N}_])SUBSCRIBE(?![\p{L}\p{N}_])/iu },
  { keyword: "OPT-IN", regex: /(?<![\p{L}\p{N}_])OPT-IN(?![\p{L}\p{N}_])/iu },
  { keyword: "START", regex: /(?<![\p{L}\p{N}_])START(?![\p{L}\p{N}_])/iu }
];
function detectOptInKeyword(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const item of OPT_OUT_PATTERNS) {
    if (item.regex.test(trimmed)) {
      return { action: "opted_out", keyword: item.keyword };
    }
  }
  for (const item of OPT_IN_PATTERNS) {
    if (item.regex.test(trimmed)) {
      return { action: "opted_in", keyword: item.keyword };
    }
  }
  return null;
}
function getCustomerServiceWindowStatus(lastInboundAt, nowMs = Date.now()) {
  if (!lastInboundAt) {
    return { open: false, remainingMs: 0, expiresAt: null };
  }
  const inboundMs = new Date(lastInboundAt).getTime();
  if (Number.isNaN(inboundMs)) {
    return { open: false, remainingMs: 0, expiresAt: null };
  }
  const expiresMs = inboundMs + TWENTY_FOUR_HOURS_MS;
  const remainingMs = Math.max(0, expiresMs - nowMs);
  return {
    open: remainingMs > 0,
    remainingMs,
    expiresAt: new Date(expiresMs).toISOString()
  };
}
function renderTemplateBody(bodyText, variables) {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, indexStr) => {
    const idx = Number(indexStr) - 1;
    const val = variables[idx];
    return typeof val === "string" && val.length > 0 ? val : match;
  });
}
function extractLinkPreview(text) {
  const match = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
  if (!match) return void 0;
  try {
    const parsed = new URL(match[0]);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathSegment = parsed.pathname.split("/").filter(Boolean).slice(-1)[0];
    const cleanTitle = pathSegment ? pathSegment.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : host;
    return {
      url: parsed.toString(),
      domain: host,
      title: `${cleanTitle} \u2014 ${host}`,
      description: `Preview for ${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`
    };
  } catch {
    return void 0;
  }
}

// server/seeder.ts
import fs2 from "fs";
function createSeededRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 1831565813;
    let x = Math.imul(t ^ t >>> 15, 1 | t);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
var COUNTRY_CATALOG = [
  {
    code: "IN",
    dial: "+91",
    timezone: "Asia/Kolkata",
    defaultSegment: "chennai",
    firstNames: ["Aarav", "Ananya", "Karthik", "Divya", "Vikram", "Meera", "Rohan", "Lakshmi", "Arjun", "Kavya", "Siddharth", "Nithya"],
    lastNames: ["Subramanian", "Krishnan", "Nair", "Iyer", "Reddy", "Sharma", "Patel", "Menon", "Rajan", "Venkatesh"]
  },
  {
    code: "US",
    dial: "+1",
    timezone: "America/Los_Angeles",
    defaultSegment: "premium",
    firstNames: ["Maya", "Jordan", "Taylor", "Ethan", "Hannah", "Liam", "Chloe", "Noah", "Zoe", "Caleb"],
    lastNames: ["Brooks", "Hayes", "Kim", "Morales", "Bennett", "Foster", "Reed", "Sullivan", "Price", "Ward"]
  },
  {
    code: "SG",
    dial: "+65",
    timezone: "Asia/Singapore",
    defaultSegment: "enterprise",
    firstNames: ["Wei", "Mei", "Jian", "Siti", "Daniel", "Rachel", "Hui", "Darren"],
    lastNames: ["Tan", "Lim", "Lee", "Ng", "Wong", "Goh", "Chua", "Ong"]
  },
  {
    code: "GB",
    dial: "+44",
    timezone: "Europe/London",
    defaultSegment: "leads",
    firstNames: ["Oliver", "Amelia", "Harry", "Isla", "Jack", "Freya", "George", "Sophie"],
    lastNames: ["Clarke", "Davies", "Evans", "Hughes", "Morgan", "Turner", "Wright", "Baker"]
  },
  {
    code: "AE",
    dial: "+971",
    timezone: "Asia/Dubai",
    defaultSegment: "vip",
    firstNames: ["Omar", "Layla", "Zaid", "Nadia", "Tariq", "Farah", "Rashid", "Amira"],
    lastNames: ["Al-Mansoor", "Haddad", "Khoury", "Nasser", "Saleh", "Farooq", "Qureshi", "Zaman"]
  }
];
var DEFAULT_SEGMENTS = ["premium", "chennai", "leads", "festival", "vip", "enterprise"];
var AVATAR_COLORS = ["#00a884", "#53bdeb", "#7f66ff", "#e542a3", "#ff7b29", "#009de2", "#25d366"];
function defaultReceiptTimingForPersonality(personality) {
  switch (personality) {
    case "engaged":
      return { deliveredMinMs: 60, deliveredMaxMs: 180, readMinMs: 180, readMaxMs: 420, readProbability: 0.95 };
    case "button_clicker":
      return { deliveredMinMs: 50, deliveredMaxMs: 160, readMinMs: 150, readMaxMs: 360, readProbability: 0.92 };
    case "catalog_browser":
      return { deliveredMinMs: 70, deliveredMaxMs: 210, readMinMs: 200, readMaxMs: 480, readProbability: 0.88 };
    case "quick_opt_out":
      return { deliveredMinMs: 50, deliveredMaxMs: 150, readMinMs: 140, readMaxMs: 320, readProbability: 0.98 };
    case "custom_keyword":
      return { deliveredMinMs: 70, deliveredMaxMs: 200, readMinMs: 190, readMaxMs: 450, readProbability: 0.9 };
    case "silent":
    default:
      return { deliveredMinMs: 90, deliveredMaxMs: 280, readMinMs: 350, readMaxMs: 900, readProbability: 0.45 };
  }
}
function generateSeededClients(request, existingPhones) {
  const results = [];
  const usedPhones = new Set(existingPhones);
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
        country: raw.country || "IN",
        tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : ["leads"],
        timezone: raw.timezone || "Asia/Kolkata",
        optInStatus: raw.optInStatus || "opted_in",
        personality: raw.personality || "engaged"
      });
    }
    return results;
  }
  const count = Math.max(0, Math.min(1e3, Math.floor(request.count ?? 25)));
  const seed = typeof request.seed === "number" && Number.isFinite(request.seed) ? request.seed : 202604;
  const rng = createSeededRng(seed);
  const allowedCountries = request.countries && request.countries.length > 0 ? COUNTRY_CATALOG.filter((c) => request.countries.includes(c.code)) : COUNTRY_CATALOG;
  const countryPool = allowedCountries.length > 0 ? allowedCountries : COUNTRY_CATALOG;
  const customSegments = request.segments && request.segments.length > 0 ? request.segments.map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const invalidPct = Math.max(0, Math.min(100, request.invalidPct ?? 0));
  const optOutPct = Math.max(0, Math.min(100, request.optOutPct ?? 6));
  const disabledPct = Math.max(0, Math.min(100, request.disabledPct ?? 0));
  for (let i = 0; i < count; i++) {
    const spec = countryPool[Math.floor(rng() * countryPool.length)];
    const first = spec.firstNames[Math.floor(rng() * spec.firstNames.length)];
    const last = spec.lastNames[Math.floor(rng() * spec.lastNames.length)];
    let phone = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const tail = spec.code === "IN" ? `98${Math.floor(1e7 + rng() * 89999999)}` : spec.code === "US" ? `415555${String(Math.floor(1e3 + rng() * 8999))}` : spec.code === "SG" ? `9${Math.floor(1e6 + rng() * 8999999)}` : spec.code === "GB" ? `77009${String(Math.floor(1e4 + rng() * 89999))}` : `50${Math.floor(1e6 + rng() * 8999999)}`;
      const candidate = `${spec.dial}${tail}`;
      if (!usedPhones.has(candidate) && isValidE164(candidate)) {
        phone = candidate;
        usedPhones.add(candidate);
        break;
      }
    }
    if (!phone) continue;
    const pRoll = rng();
    let personality = "silent";
    if (pRoll < 0.32) personality = "engaged";
    else if (pRoll < 0.54) personality = "button_clicker";
    else if (pRoll < 0.8) personality = "silent";
    else if (pRoll < 0.9) personality = "catalog_browser";
    else if (pRoll < 0.95) personality = "custom_keyword";
    else personality = "quick_opt_out";
    const invalidNumber = rng() * 100 < invalidPct;
    const disabled = !invalidNumber && rng() * 100 < disabledPct;
    const optedOut = rng() * 100 < optOutPct;
    const optInStatus = optedOut ? "opted_out" : "opted_in";
    const tags = /* @__PURE__ */ new Set();
    if (customSegments.length > 0) {
      tags.add(customSegments[i % customSegments.length]);
    } else {
      tags.add(spec.defaultSegment);
      const extraTag = DEFAULT_SEGMENTS[Math.floor(rng() * DEFAULT_SEGMENTS.length)];
      tags.add(extraTag);
    }
    const customReplies = ["Interested! Send details.", "Can you share pricing?", "Thanks for the update!", "Yes please!"];
    results.push({
      name: `${first} ${last}`,
      profileName: first,
      phone,
      country: spec.code,
      tags: Array.from(tags),
      timezone: spec.timezone,
      optInStatus,
      personality,
      customReplyText: personality === "custom_keyword" ? customReplies[Math.floor(rng() * customReplies.length)] : void 0,
      invalidNumber,
      disabled,
      windowOpen: rng() < 0.35,
      // ~35% have active 24h window, ~65% require approved templates!
      receiptTiming: defaultReceiptTimingForPersonality(personality)
    });
  }
  return results;
}
function buildContactFromClientSeed(input, indexOffset, source = "bulk_seed") {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const personality = input.personality || "engaged";
  const baseTiming = defaultReceiptTimingForPersonality(personality);
  const receiptTiming = {
    deliveredMinMs: input.receiptTiming?.deliveredMinMs ?? baseTiming.deliveredMinMs,
    deliveredMaxMs: input.receiptTiming?.deliveredMaxMs ?? baseTiming.deliveredMaxMs,
    readMinMs: input.receiptTiming?.readMinMs ?? baseTiming.readMinMs,
    readMaxMs: input.receiptTiming?.readMaxMs ?? baseTiming.readMaxMs,
    readProbability: input.receiptTiming?.readProbability ?? baseTiming.readProbability
  };
  const optInStatus = input.optInStatus || "opted_in";
  return {
    id: `client-${input.phone.replace(/[^\d]/g, "")}`,
    name: input.name.trim() || input.phone,
    profileName: input.profileName?.trim() || input.name.trim() || input.phone,
    phone: normalizeE164(input.phone),
    avatarColor: AVATAR_COLORS[indexOffset % AVATAR_COLORS.length],
    about: `${input.country || "IN"} \xB7 ${(input.tags || ["leads"]).join(", ")} \xB7 ${personality.replace(/_/g, " ")}`,
    isBot: false,
    isBusiness: false,
    blocked: false,
    disabled: Boolean(input.disabled),
    invalidNumber: Boolean(input.invalidNumber),
    country: input.country || "IN",
    tags: Array.isArray(input.tags) && input.tags.length > 0 ? input.tags : ["leads"],
    timezone: input.timezone || "Asia/Kolkata",
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
        note: optInStatus === "opted_out" ? "Seeded as opted-out client" : "Seeded client with valid opt-in"
      }
    ],
    presence: "online",
    lastSeen: now
  };
}
function loadClientSeedFile(filePath) {
  if (!filePath || !fs2.existsSync(filePath)) return [];
  try {
    const raw = fs2.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.clients)) return parsed.clients;
    return [];
  } catch {
    return [];
  }
}
function computeClientAutoResponse(contact, outboundMessage, rngValue = Math.random()) {
  if (!contact.seeded || contact.blocked || contact.disabled || contact.invalidNumber) {
    return null;
  }
  const personality = contact.personality || "silent";
  if (personality === "silent") return null;
  const baseDelay = 260 + Math.floor(rngValue * 420);
  if (personality === "quick_opt_out") {
    return {
      delayMs: baseDelay,
      type: "text",
      body: "STOP",
      reason: "quick_opt_out personality replied STOP"
    };
  }
  if (personality === "button_clicker") {
    const quickReplyBtn = outboundMessage.template?.buttons.find(
      (b) => b.type === "QUICK_REPLY" || b.type === "URL" || b.type === "COPY_CODE"
    );
    const interBtn = outboundMessage.interactive?.buttons?.[0];
    if (interBtn) {
      return {
        delayMs: baseDelay,
        type: "interactive",
        body: interBtn.title,
        interactive: {
          kind: "button_reply",
          bodyText: interBtn.title,
          selectedId: interBtn.id,
          selectedTitle: interBtn.title
        },
        reason: `Clicked interactive button "${interBtn.title}"`
      };
    }
    if (quickReplyBtn) {
      return {
        delayMs: baseDelay,
        type: "interactive",
        body: quickReplyBtn.text,
        interactive: {
          kind: "button_reply",
          bodyText: quickReplyBtn.text,
          selectedId: `tpl_btn_${quickReplyBtn.type.toLowerCase()}`,
          selectedTitle: quickReplyBtn.text
        },
        reason: `Clicked template button "${quickReplyBtn.text}"`
      };
    }
    return {
      delayMs: baseDelay,
      type: "text",
      body: "Confirmed, thanks!",
      reason: "button_clicker fallback acknowledgement"
    };
  }
  if (personality === "catalog_browser") {
    return {
      delayMs: baseDelay + 120,
      type: "text",
      body: "Viewed catalog \u2014 can you share availability and delivery ETA for the Pour-Over Brew Kit?",
      reason: "catalog_browser viewed product catalog"
    };
  }
  if (personality === "custom_keyword") {
    return {
      delayMs: baseDelay,
      type: "text",
      body: contact.customReplyText?.trim() || "Thanks! Please share more details.",
      reason: "custom_keyword personality response"
    };
  }
  if (personality === "engaged") {
    const lower = outboundMessage.body.toLowerCase();
    if (lower.includes("code") || lower.includes("verification") || outboundMessage.template?.category === "AUTHENTICATION") {
      return {
        delayMs: baseDelay,
        type: "text",
        body: "Got the verification code, logged in!",
        reason: "engaged OTP confirmation"
      };
    }
    if (lower.includes("order") || lower.includes("shipment") || lower.includes("delivery")) {
      return {
        delayMs: baseDelay,
        type: "text",
        body: "Awesome, looking forward to the delivery!",
        reason: "engaged order acknowledgement"
      };
    }
    return {
      delayMs: baseDelay,
      type: "text",
      body: `Thanks! Interested in this offer (${contact.tags?.[0] || "customer"}).`,
      reason: "engaged promotional reply"
    };
  }
  return null;
}

// server/broadcast.ts
var DEFAULT_FAILURE_INJECTION = {
  enabled: false,
  invalidNumberPct: 0,
  optOutPct: 0,
  outOfWindowPct: 0,
  disabledPct: 0
};
var DEFAULT_RATE_LIMITS = {
  enabled: true,
  messagesPerSecond: 80,
  messagesPerMinute: 1200,
  pairMessagesPerMinute: 15,
  dailyTemplateLimit: 1e3
};
function resolveRecipientTemplateVariables(baseVariables, contact, perRecipientOverride) {
  const source = perRecipientOverride && perRecipientOverride.length > 0 ? perRecipientOverride : baseVariables;
  const firstName = (contact.profileName || contact.name).split(/\s+/)[0] || contact.name;
  const primarySegment = contact.tags?.[0] || "customer";
  return source.map(
    (raw) => raw.replace(/\{\{name\}\}/gi, contact.name).replace(/\{\{1\}\}/gi, contact.name).replace(/\{\{first_name\}\}/gi, firstName).replace(/\{\{phone\}\}/gi, contact.phone).replace(/\{\{country\}\}/gi, contact.country || "US").replace(/\{\{segment\}\}/gi, primarySegment).replace(/\{\{timezone\}\}/gi, contact.timezone || "UTC")
  );
}
function selectBroadcastRecipients(contacts, selector) {
  if (selector.mode === "all") {
    return contacts.filter((c) => !c.isBot);
  }
  if (selector.mode === "segments") {
    const wanted = new Set(
      (selector.segments || []).map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    if (wanted.size === 0) return [];
    return contacts.filter(
      (c) => (c.tags || []).some((t) => wanted.has(t.trim().toLowerCase()))
    );
  }
  if (selector.mode === "phones") {
    const wanted = new Set(
      (selector.phones || []).map((p) => normalizeE164(p)).filter(Boolean)
    );
    return contacts.filter((c) => wanted.has(normalizeE164(c.phone)));
  }
  if (selector.mode === "contactIds") {
    const wanted = new Set(selector.contactIds || []);
    return contacts.filter((c) => wanted.has(c.id));
  }
  return [];
}
function evaluateFailureInjection(config, rollPercent, recipientPhone) {
  if (!config.enabled) return null;
  let cursor = 0;
  if (config.invalidNumberPct > 0) {
    cursor += config.invalidNumberPct;
    if (rollPercent < cursor) {
      return {
        httpStatus: 400,
        error: META_ERRORS.INVALID_RECIPIENT(
          `Failure injection (${config.invalidNumberPct}%): ${recipientPhone} rejected as invalid WhatsApp number.`
        )
      };
    }
  }
  if (config.optOutPct > 0) {
    cursor += config.optOutPct;
    if (rollPercent < cursor) {
      return {
        httpStatus: 403,
        error: META_ERRORS.RECIPIENT_OPTED_OUT(
          `Failure injection (${config.optOutPct}%): ${recipientPhone} treated as opted out.`
        )
      };
    }
  }
  if (config.outOfWindowPct > 0) {
    cursor += config.outOfWindowPct;
    if (rollPercent < cursor) {
      return {
        httpStatus: 400,
        error: META_ERRORS.RE_ENGAGEMENT_REQUIRED(
          `Failure injection (${config.outOfWindowPct}%): ${recipientPhone} treated as outside 24h customer service window.`
        )
      };
    }
  }
  if (config.disabledPct > 0) {
    cursor += config.disabledPct;
    if (rollPercent < cursor) {
      return {
        httpStatus: 400,
        error: META_ERRORS.DISABLED_NUMBER(
          `Failure injection (${config.disabledPct}%): ${recipientPhone} simulated as disabled/unreachable.`
        )
      };
    }
  }
  return null;
}
var RateLimiter = class {
  constructor(nowMs = Date.now()) {
    this.perNumberEvents = /* @__PURE__ */ new Map();
    this.perPairEvents = /* @__PURE__ */ new Map();
    this.dailyTemplatesSent = 0;
    this.totalThrottled = 0;
    this.dailyResetAtMs = this.nextUtcMidnight(nowMs);
  }
  nextUtcMidnight(nowMs) {
    const d = new Date(nowMs);
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }
  prune(arr, cutoffMs) {
    let i = 0;
    while (i < arr.length && arr[i] < cutoffMs) i++;
    return i > 0 ? arr.slice(i) : arr;
  }
  reset(nowMs = Date.now()) {
    this.perNumberEvents.clear();
    this.perPairEvents.clear();
    this.dailyTemplatesSent = 0;
    this.totalThrottled = 0;
    this.dailyResetAtMs = this.nextUtcMidnight(nowMs);
  }
  checkAndConsume(config, phoneNumberId, recipientPhone, isTemplate, nowMs = Date.now()) {
    if (nowMs >= this.dailyResetAtMs) {
      this.dailyTemplatesSent = 0;
      this.dailyResetAtMs = this.nextUtcMidnight(nowMs);
    }
    if (!config.enabled) {
      return { ok: true };
    }
    if (isTemplate && config.dailyTemplateLimit > 0 && this.dailyTemplatesSent >= config.dailyTemplateLimit) {
      this.totalThrottled += 1;
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.THROUGHPUT_RATE_LIMIT(
          `Aggregate daily template limit reached (${this.dailyTemplatesSent}/${config.dailyTemplateLimit}).`
        )
      };
    }
    const numEvents = this.prune(this.perNumberEvents.get(phoneNumberId) || [], nowMs - 6e4);
    const lastSecCount = numEvents.filter((ts) => ts >= nowMs - 1e3).length;
    if (config.messagesPerSecond > 0 && lastSecCount >= config.messagesPerSecond) {
      this.totalThrottled += 1;
      this.perNumberEvents.set(phoneNumberId, numEvents);
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.THROUGHPUT_RATE_LIMIT(
          `Per-second throughput limit reached for ${phoneNumberId} (${lastSecCount}/${config.messagesPerSecond} msg/s).`
        )
      };
    }
    if (config.messagesPerMinute > 0 && numEvents.length >= config.messagesPerMinute) {
      this.totalThrottled += 1;
      this.perNumberEvents.set(phoneNumberId, numEvents);
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.THROUGHPUT_RATE_LIMIT(
          `Per-minute messaging limit reached for ${phoneNumberId} (${numEvents.length}/${config.messagesPerMinute} msg/min).`
        )
      };
    }
    const pairKey = `${phoneNumberId}::${normalizeE164(recipientPhone)}`;
    const pairEvents = this.prune(this.perPairEvents.get(pairKey) || [], nowMs - 6e4);
    if (config.pairMessagesPerMinute > 0 && pairEvents.length >= config.pairMessagesPerMinute) {
      this.totalThrottled += 1;
      this.perPairEvents.set(pairKey, pairEvents);
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.PAIR_RATE_LIMIT(
          `Pair rate limit exceeded for ${phoneNumberId} -> ${recipientPhone} (${pairEvents.length}/${config.pairMessagesPerMinute} msg/min).`
        )
      };
    }
    numEvents.push(nowMs);
    this.perNumberEvents.set(phoneNumberId, numEvents);
    pairEvents.push(nowMs);
    this.perPairEvents.set(pairKey, pairEvents);
    if (isTemplate) {
      this.dailyTemplatesSent += 1;
    }
    return { ok: true };
  }
  getSnapshot(nowMs = Date.now()) {
    const windowSecondCounts = {};
    const windowMinuteCounts = {};
    for (const [numId, events] of this.perNumberEvents.entries()) {
      const pruned = this.prune(events, nowMs - 6e4);
      this.perNumberEvents.set(numId, pruned);
      windowMinuteCounts[numId] = pruned.length;
      windowSecondCounts[numId] = pruned.filter((ts) => ts >= nowMs - 1e3).length;
    }
    return {
      windowSecondCounts,
      windowMinuteCounts,
      dailyTemplatesSent: this.dailyTemplatesSent,
      dailyResetAt: new Date(this.dailyResetAtMs).toISOString(),
      totalThrottled: this.totalThrottled
    };
  }
};
function createBroadcastRollGenerator(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    const rng = createSeededRng(seed);
    return () => rng() * 100;
  }
  return () => Math.random() * 100;
}

// server/webhooks.ts
import crypto from "crypto";
function signWebhookPayload(body, secret) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}
function verifyHubSignature256(rawBody, signatureHeader, secret) {
  if (!secret) return true;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signWebhookPayload(rawBody, secret);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signatureHeader, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
async function dispatchWebhook(input) {
  const id = `wh_${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const startedAt = Date.now();
  const body = JSON.stringify(input.payload);
  const signature = input.secret ? signWebhookPayload(body, input.secret) : void 0;
  if (!input.targetUrl) {
    return {
      id,
      event: input.event,
      phoneNumberId: input.phoneNumberId,
      targetUrl: "(not configured \u2014 logged locally)",
      timestamp,
      statusCode: null,
      ok: true,
      durationMs: 0,
      signatureHeader: signature,
      payload: input.payload
    };
  }
  const headers = {
    "Content-Type": "application/json",
    "X-WA-Event": input.event,
    "X-WA-Delivery": id
  };
  if (signature) {
    headers["X-WA-Signature"] = signature;
    headers["X-Hub-Signature-256"] = signature;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(input.targetUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    return {
      id,
      event: input.event,
      phoneNumberId: input.phoneNumberId,
      targetUrl: input.targetUrl,
      timestamp,
      statusCode: res.status,
      ok: res.ok,
      durationMs,
      signatureHeader: signature,
      error: res.ok ? void 0 : `HTTP ${res.status} ${res.statusText}`,
      payload: input.payload
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Network error";
    return {
      id,
      event: input.event,
      phoneNumberId: input.phoneNumberId,
      targetUrl: input.targetUrl,
      timestamp,
      statusCode: null,
      ok: false,
      durationMs,
      signatureHeader: signature,
      error: message,
      payload: input.payload
    };
  } finally {
    clearTimeout(timeout);
  }
}
function buildCloudWebhookEnvelope(field, phoneConfig, data, extraContacts) {
  if (field === "message_template_status_update" || field === "account_update" || field === "broadcast_status") {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: phoneConfig.wabaId,
          time: Math.floor(Date.now() / 1e3),
          changes: [
            {
              field,
              value: data
            }
          ]
        }
      ],
      emulator_event: field,
      data
    };
  }
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: phoneConfig.wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: phoneConfig.phoneNumber,
                phone_number_id: phoneConfig.id
              },
              ...extraContacts ? { contacts: extraContacts } : {},
              ...field === "messages" ? { messages: [data] } : {},
              ...field === "statuses" ? { statuses: [data] } : {},
              ...field === "typing" ? { typing: data } : {}
            }
          }
        ]
      }
    ],
    emulator_event: field,
    data
  };
}

// server/engine.ts
function normalizeCloudApiSendPayload(payload) {
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  if (!to) return null;
  const rawType = typeof payload.type === "string" ? payload.type : "text";
  if (rawType === "text") {
    const textObj = payload.text;
    const body = typeof textObj?.body === "string" ? textObj.body : "";
    if (!body) return null;
    return { toPhone: to, type: "text", body };
  }
  if (rawType === "image" || rawType === "video" || rawType === "audio" || rawType === "document" || rawType === "sticker") {
    const mediaObj = payload[rawType];
    const mediaId = typeof mediaObj?.id === "string" ? mediaObj.id : void 0;
    const link = typeof mediaObj?.link === "string" ? mediaObj.link : "";
    const caption = typeof mediaObj?.caption === "string" ? mediaObj.caption : "";
    const filename = typeof mediaObj?.filename === "string" ? mediaObj.filename : void 0;
    const defaultMime = {
      image: "image/jpeg",
      video: "video/mp4",
      audio: "audio/ogg",
      document: "application/pdf",
      sticker: "image/webp"
    };
    return {
      toPhone: to,
      type: rawType === "audio" ? "voice" : rawType,
      body: caption || filename || (rawType === "sticker" ? "Sticker" : rawType),
      mediaId,
      media: mediaId ? void 0 : {
        id: `ext_${crypto2.randomUUID().slice(0, 8)}`,
        url: link,
        mimeType: defaultMime[rawType],
        filename,
        caption: caption || void 0,
        durationSec: rawType === "audio" ? 8 : void 0
      }
    };
  }
  if (rawType === "location") {
    const loc = payload.location;
    if (typeof loc?.latitude !== "number" || typeof loc?.longitude !== "number") return null;
    return {
      toPhone: to,
      type: "location",
      body: typeof loc.name === "string" ? loc.name : `${loc.latitude}, ${loc.longitude}`,
      location: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: typeof loc.name === "string" ? loc.name : void 0,
        address: typeof loc.address === "string" ? loc.address : void 0
      }
    };
  }
  if (rawType === "contacts") {
    const arr = Array.isArray(payload.contacts) ? payload.contacts : [];
    const cards = arr.map((c) => {
      const nameObj = c.name;
      const phones = Array.isArray(c.phones) ? c.phones : [];
      const orgObj = c.org;
      return {
        name: String(nameObj?.formatted_name || c.name || "Contact"),
        phone: String(phones[0]?.phone || c.phone || ""),
        org: typeof orgObj?.company === "string" ? orgObj.company : void 0
      };
    });
    if (cards.length === 0) return null;
    return {
      toPhone: to,
      type: "contacts",
      body: cards.map((c) => c.name).join(", "),
      contacts: cards
    };
  }
  if (rawType === "interactive") {
    const inter = payload.interactive;
    if (!inter) return null;
    const interType = String(inter.type || "button");
    const bodyObj = inter.body;
    const headerObj = inter.header;
    const footerObj = inter.footer;
    const actionObj = inter.action;
    const bodyText = typeof bodyObj?.text === "string" ? bodyObj.text : "Interactive message";
    if (interType === "list") {
      const sectionsRaw = Array.isArray(actionObj?.sections) ? actionObj.sections : [];
      const sections = sectionsRaw.map((s) => ({
        title: String(s.title || "Options"),
        rows: Array.isArray(s.rows) ? s.rows.map((r) => ({
          id: String(r.id || crypto2.randomUUID().slice(0, 6)),
          title: String(r.title || "Option"),
          description: typeof r.description === "string" ? r.description : void 0
        })) : []
      }));
      return {
        toPhone: to,
        type: "interactive",
        body: bodyText,
        interactive: {
          kind: "list",
          headerText: typeof headerObj?.text === "string" ? headerObj.text : void 0,
          bodyText,
          footerText: typeof footerObj?.text === "string" ? footerObj.text : void 0,
          listButtonText: typeof actionObj?.button === "string" ? actionObj.button : "Select option",
          sections
        }
      };
    }
    if (interType === "cta_url") {
      const params = actionObj?.parameters;
      return {
        toPhone: to,
        type: "interactive",
        body: bodyText,
        interactive: {
          kind: "cta_url",
          headerText: typeof headerObj?.text === "string" ? headerObj.text : void 0,
          bodyText,
          footerText: typeof footerObj?.text === "string" ? footerObj.text : void 0,
          ctaDisplayText: String(params?.display_text || "Open Link"),
          ctaUrl: String(params?.url || "https://example.com")
        }
      };
    }
    const buttonsRaw = Array.isArray(actionObj?.buttons) ? actionObj.buttons : [];
    const buttons = buttonsRaw.map((b) => {
      const reply = b.reply;
      return {
        id: String(reply?.id || b.id || crypto2.randomUUID().slice(0, 6)),
        title: String(reply?.title || b.title || "Reply")
      };
    });
    return {
      toPhone: to,
      type: "interactive",
      body: bodyText,
      interactive: {
        kind: "button",
        headerText: typeof headerObj?.text === "string" ? headerObj.text : void 0,
        bodyText,
        footerText: typeof footerObj?.text === "string" ? footerObj.text : void 0,
        buttons
      }
    };
  }
  if (rawType === "template") {
    const tpl = payload.template;
    const name = typeof tpl?.name === "string" ? tpl.name : "";
    if (!name) return null;
    const components = Array.isArray(tpl?.components) ? tpl.components : [];
    const variables = [];
    let otpCode;
    let headerImageUrl;
    for (const comp of components) {
      const params = Array.isArray(comp.parameters) ? comp.parameters : [];
      if (comp.type === "header") {
        for (const p of params) {
          if (p.type === "image" && p.image) {
            const imgObj = p.image;
            if (typeof imgObj.link === "string") headerImageUrl = imgObj.link;
            else if (typeof imgObj.id === "string") headerImageUrl = imgObj.id;
          }
        }
      }
      if (comp.type === "body") {
        for (const p of params) {
          if (typeof p.text === "string") variables.push(p.text);
        }
      } else if (comp.type === "button" && comp.sub_type === "url") {
        const first = params[0];
        if (typeof first?.text === "string") otpCode = first.text;
      }
    }
    return {
      toPhone: to,
      type: "template",
      body: `[Template: ${name}]`,
      templateName: name,
      templateVariables: variables,
      templateOtpCode: otpCode,
      templateHeaderImageUrl: headerImageUrl
    };
  }
  return null;
}
function matchAutoReplyRule(rules, messageBody, contactId) {
  const normalized = messageBody.trim();
  if (!normalized) return null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.contactId && contactId && rule.contactId !== contactId) continue;
    if (rule.matchType === "exact") {
      if (normalized.toLowerCase() === rule.pattern.trim().toLowerCase()) {
        return rule;
      }
    } else if (rule.matchType === "contains") {
      if (normalized.toLowerCase().includes(rule.pattern.trim().toLowerCase())) {
        return rule;
      }
    } else if (rule.matchType === "regex") {
      try {
        const re = new RegExp(rule.pattern, "i");
        if (re.test(normalized)) {
          return rule;
        }
      } catch {
      }
    }
  }
  return null;
}
function createSeedState(env) {
  const now = Date.now();
  const minsAgo = (m) => new Date(now - m * 6e4).toISOString();
  const defaultBusinessProfile = {
    name: env.selfName || "Karnataka State Protocol Vehicle Desk",
    avatarUrl: "/assets/vehicle-desk-emblem.svg",
    category: "Government & Public Services",
    description: "Official VIP & MLA Vehicle Allotment Desk, DPAR, Government of Karnataka.",
    address: "Vidhana Soudha, Bengaluru, Karnataka 560001",
    hours: "24/7 Protocol Dispatch",
    email: "protocol@karnataka.gov.in",
    website: "https://dpar.karnataka.gov.in",
    verified: true
  };
  const phoneNumbers = [];
  if (env.selfPhone && isValidE164(normalizeE164(env.selfPhone))) {
    phoneNumbers.push({
      id: "phone-primary",
      wabaId: "waba-primary",
      phoneNumber: normalizeE164(env.selfPhone),
      displayName: env.selfName || "Primary Number",
      verifiedName: env.selfName || "WhatsApp Business",
      qualityRating: "GREEN",
      webhookUrl: "",
      businessProfile: { ...defaultBusinessProfile }
    });
  }
  env.phoneNumbers.forEach((seed) => {
    const normalized = normalizeE164(seed.phoneNumber);
    if (normalized && isValidE164(normalized) && !phoneNumbers.some((p) => p.id === seed.id)) {
      phoneNumbers.push({
        id: seed.id,
        wabaId: seed.wabaId || "waba-primary",
        phoneNumber: normalized,
        displayName: seed.displayName,
        verifiedName: seed.verifiedName || seed.displayName,
        qualityRating: "GREEN",
        webhookUrl: seed.webhookUrl || "",
        businessProfile: {
          ...defaultBusinessProfile,
          name: seed.displayName
        }
      });
    }
  });
  const activePhoneNumberId = phoneNumbers[0]?.id || "";
  const contacts = [];
  env.preloadedContacts.forEach((seed, idx) => {
    const norm = normalizeE164(seed.phone);
    if (norm && !contacts.some((c) => c.phone === norm)) {
      contacts.push(toContactFromSeed({ ...seed, phone: norm }, idx));
    }
  });
  const chats = [];
  env.preloadedContacts.forEach((seed, idx) => {
    const contactId = `contact-env-${idx + 1}`;
    if (contacts.some((c) => c.id === contactId) && !chats.some((c) => c.contactId === contactId)) {
      chats.push({
        id: `chat-env-${idx + 1}`,
        type: "direct",
        phoneNumberId: activePhoneNumberId,
        name: seed.name,
        avatarColor: "#00a884",
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
        conversationCategory: "SERVICE"
      });
    }
  });
  const autoReplyRules = env.autoReplyRules.map(
    (seed, idx) => toRuleFromSeed(seed, idx)
  );
  return {
    self: {
      id: "me",
      name: env.selfName || "Karnataka State Protocol Vehicle Desk",
      phone: env.selfPhone ? normalizeE164(env.selfPhone) : "",
      about: "Official Vehicle Allotment Desk for Hon'ble MLAs | DPAR, Government of Karnataka",
      avatarUrl: "/assets/vehicle-desk-emblem.svg"
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
        greetingMessage: "",
        awayEnabled: false,
        awayMessage: "",
        awaySchedule: "outside_hours"
      }
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
      pairMessagesPerMinute: env.pairRateLimitPerMinute ?? DEFAULT_RATE_LIMITS.pairMessagesPerMinute,
      dailyTemplateLimit: env.dailyTemplateLimit ?? DEFAULT_RATE_LIMITS.dailyTemplateLimit
    },
    rateLimitUsage: {
      windowSecondCounts: {},
      windowMinuteCounts: {},
      dailyTemplatesSent: 0,
      dailyResetAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString(),
      totalThrottled: 0
    }
  };
}
var EmulatorEngine = class {
  constructor(store, env) {
    this.listeners = /* @__PURE__ */ new Set();
    this.pendingTimers = /* @__PURE__ */ new Set();
    this.greetedChatIds = /* @__PURE__ */ new Set();
    this.rateLimiter = new RateLimiter();
    this.broadcastMessageIndex = /* @__PURE__ */ new Map();
    this.broadcastPayloads = /* @__PURE__ */ new Map();
    this.persistTimer = null;
    this.broadcastEmitTimers = /* @__PURE__ */ new Map();
    this.store = store;
    this.env = env;
    const loaded = store.load();
    if (loaded && loaded.phoneNumbers && loaded.templates) {
      this.state = loaded;
      this.state.settings.apiKeyConfigured = Boolean(env.apiKey);
      if (!Array.isArray(this.state.broadcasts)) this.state.broadcasts = [];
      if (!this.state.failureInjection) {
        this.state.failureInjection = { ...DEFAULT_FAILURE_INJECTION };
      }
      if (!this.state.rateLimits) {
        this.state.rateLimits = {
          ...DEFAULT_RATE_LIMITS,
          messagesPerSecond: env.rateLimitPerSecond ?? DEFAULT_RATE_LIMITS.messagesPerSecond,
          messagesPerMinute: env.rateLimitPerMinute ?? DEFAULT_RATE_LIMITS.messagesPerMinute,
          pairMessagesPerMinute: env.pairRateLimitPerMinute ?? DEFAULT_RATE_LIMITS.pairMessagesPerMinute,
          dailyTemplateLimit: env.dailyTemplateLimit ?? DEFAULT_RATE_LIMITS.dailyTemplateLimit
        };
      }
      this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    } else {
      this.state = createSeedState(env);
      this.applyEnvClientSeeds();
      this.persist();
    }
  }
  applyEnvClientSeeds() {
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
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.store.save(this.state);
  }
  persistDeferred() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.store.save(this.state);
    }, 180);
    this.pendingTimers.add(this.persistTimer);
  }
  scheduleTimer(fn, ms) {
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
  clearTimers() {
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
  getState() {
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    return this.state;
  }
  getPhoneConfig(phoneNumberId) {
    const id = phoneNumberId || this.state.settings.activePhoneNumberId;
    return this.state.phoneNumbers.find((p) => p.id === id) || this.state.phoneNumbers[0] || {
      id: id || "default",
      wabaId: "waba-primary",
      phoneNumber: this.state.self.phone || "",
      displayName: this.state.self.name || "WhatsApp Business",
      verifiedName: this.state.self.name || "WhatsApp Business",
      qualityRating: "GREEN",
      webhookUrl: this.state.settings.webhookUrl || "",
      businessProfile: this.state.settings.businessProfile
    };
  }
  reset(variantOverride) {
    this.clearTimers();
    this.greetedChatIds.clear();
    this.rateLimiter.reset();
    this.broadcastMessageIndex.clear();
    this.broadcastPayloads.clear();
    const effectiveEnv = variantOverride ? { ...this.env, variant: variantOverride } : this.env;
    this.state = createSeedState(effectiveEnv);
    this.applyEnvClientSeeds();
    this.persist();
    this.emit({ type: "state:sync", payload: this.state });
    return this.state;
  }
  recordWebhook(event, payload, phoneNumberId) {
    const phoneCfg = this.getPhoneConfig(phoneNumberId);
    const targetUrl = phoneCfg.webhookUrl || this.state.settings.webhookUrl;
    const { webhookSecret } = this.state.settings;
    void dispatchWebhook({
      event,
      phoneNumberId: phoneCfg.id,
      targetUrl,
      secret: webhookSecret,
      payload
    }).then((entry) => {
      this.state.webhookLogs = [entry, ...this.state.webhookLogs].slice(0, 80);
      this.persist();
      this.emit({ type: "webhook:logged", payload: entry });
    });
  }
  trackConversationBilling(chat, category, messageId) {
    const now = Date.now();
    const activeExisting = this.state.conversations.find(
      (c) => c.chatId === chat.id && c.category === category && new Date(c.expiresAt).getTime() > now
    );
    chat.conversationCategory = category;
    if (activeExisting) return;
    const rate = this.state.settings.pricingRatesUsd[category] ?? 0;
    const record = {
      id: `conv_${crypto2.randomUUID().slice(0, 10)}`,
      chatId: chat.id,
      phoneNumberId: chat.phoneNumberId,
      category,
      billable: rate > 0,
      estimatedCostUsd: rate,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TWENTY_FOUR_HOURS_MS).toISOString(),
      messageId
    };
    this.state.conversations = [record, ...this.state.conversations].slice(0, 200);
    this.emitBusinessUpdate();
  }
  // --- Media Index ---
  registerMedia(record) {
    this.state.mediaIndex[record.id] = record;
    this.persist();
    return record;
  }
  getMediaRecord(id) {
    return this.state.mediaIndex[id] || null;
  }
  // --- Phone Numbers / WABA ---
  upsertPhoneNumber(input) {
    const normalized = normalizeE164(input.phoneNumber);
    if (!isValidE164(normalized)) {
      return { ok: false, error: "Phone number must be valid E.164 format (e.g. +14155550199)." };
    }
    if (input.id) {
      const existing = this.state.phoneNumbers.find((p) => p.id === input.id);
      if (existing) {
        existing.phoneNumber = normalized;
        existing.displayName = input.displayName.trim() || existing.displayName;
        if (input.verifiedName) existing.verifiedName = input.verifiedName.trim();
        if (typeof input.webhookUrl === "string") existing.webhookUrl = input.webhookUrl.trim();
        if (input.qualityRating) existing.qualityRating = input.qualityRating;
        this.persist();
        this.emitConfigUpdate();
        this.recordWebhook(
          "account.update",
          buildCloudWebhookEnvelope("account_update", existing, {
            event: "PHONE_NUMBER_NAME_UPDATE",
            phone_number_id: existing.id,
            display_phone_number: existing.phoneNumber,
            verified_name: existing.verifiedName
          }),
          existing.id
        );
        return { ok: true, phoneNumber: existing };
      }
    }
    const created = {
      id: input.id?.trim() || `phone-${crypto2.randomUUID().slice(0, 8)}`,
      wabaId: input.wabaId?.trim() || "waba-primary",
      phoneNumber: normalized,
      displayName: input.displayName.trim() || normalized,
      verifiedName: input.verifiedName?.trim() || input.displayName.trim() || normalized,
      qualityRating: input.qualityRating || "GREEN",
      webhookUrl: input.webhookUrl?.trim() || "",
      businessProfile: {
        ...this.state.settings.businessProfile,
        name: input.displayName.trim() || normalized
      }
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
  createContact(input) {
    const cleanPhone = normalizeE164(input.phone);
    if (!isValidE164(cleanPhone)) {
      throw new Error("Invalid E.164 phone number (expected + followed by 7-15 digits, e.g. +14155550199)");
    }
    const existing = this.state.contacts.find((c) => c.phone === cleanPhone);
    if (existing) {
      const existingChat = this.ensureDirectChat(existing);
      return { contact: existing, chat: existingChat };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const optStatus = input.optInStatus || "opted_in";
    const optSource = input.optInSource || "manual";
    const palette = ["#00a884", "#53bdeb", "#7f66ff", "#e542a3", "#ff7b29", "#009de2"];
    const contact = {
      id: `contact-${crypto2.randomUUID().slice(0, 8)}`,
      name: input.name.trim() || cleanPhone,
      profileName: input.profileName?.trim() || input.name.trim() || cleanPhone,
      phone: cleanPhone,
      avatarUrl: input.avatarUrl,
      avatarColor: palette[this.state.contacts.length % palette.length],
      about: input.about?.trim() || "Hey there! I am using WhatsApp.",
      isBot: Boolean(input.isBot),
      isBusiness: Boolean(input.isBusiness),
      blocked: false,
      optInStatus: optStatus,
      optInUpdatedAt: now,
      optInSource: optSource,
      optInHistory: [
        {
          id: `opt-${crypto2.randomUUID().slice(0, 8)}`,
          status: optStatus,
          timestamp: now,
          source: optSource,
          note: "Initial contact registration"
        }
      ],
      presence: "online",
      lastSeen: now
    };
    this.state.contacts.push(contact);
    const chat = this.ensureDirectChat(contact);
    this.persist();
    this.emit({ type: "contact:updated", payload: contact });
    this.emit({ type: "chat:updated", payload: chat });
    return { contact, chat };
  }
  updateContact(id, patch) {
    const contact = this.state.contacts.find((c) => c.id === id);
    if (!contact) return null;
    if (patch.phone) {
      const norm = normalizeE164(patch.phone);
      if (!isValidE164(norm)) {
        throw new Error("Invalid E.164 phone number");
      }
      patch.phone = norm;
    }
    Object.assign(contact, patch);
    if (patch.presence === "offline") {
      contact.lastSeen = (/* @__PURE__ */ new Date()).toISOString();
    }
    const directChat = this.state.chats.find((c) => c.type === "direct" && c.contactId === id);
    if (directChat && patch.name) {
      directChat.name = patch.name;
      this.emit({ type: "chat:updated", payload: directChat });
    }
    this.persist();
    this.emit({ type: "contact:updated", payload: contact });
    return contact;
  }
  setContactOptIn(contactIdOrPhone, status, source, keyword, note) {
    const contact = this.state.contacts.find((c) => c.id === contactIdOrPhone) || this.state.contacts.find((c) => c.phone === normalizeE164(contactIdOrPhone));
    if (!contact) return null;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    contact.optInStatus = status;
    contact.optInUpdatedAt = now;
    contact.optInSource = source;
    contact.optInHistory.unshift({
      id: `opt-${crypto2.randomUUID().slice(0, 8)}`,
      status,
      timestamp: now,
      source,
      keyword,
      note
    });
    this.persist();
    this.emit({ type: "contact:updated", payload: contact });
    const phoneCfg = this.getPhoneConfig();
    this.recordWebhook(
      "account.opt_in_updated",
      buildCloudWebhookEnvelope("account_update", phoneCfg, {
        event: status === "opted_out" ? "CONTACT_OPT_OUT" : "CONTACT_OPT_IN",
        contact_id: contact.id,
        wa_id: contact.phone.replace(/[^\d]/g, ""),
        phone: contact.phone,
        opt_in_status: status,
        source,
        keyword,
        timestamp: now
      }),
      phoneCfg.id
    );
    return contact;
  }
  deleteContact(id) {
    const idx = this.state.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.state.contacts.splice(idx, 1);
    this.persist();
    this.emit({ type: "contact:deleted", payload: { contactId: id } });
    return true;
  }
  ensureDirectChat(contact, phoneNumberId) {
    let chat = this.state.chats.find((c) => c.type === "direct" && c.contactId === contact.id);
    if (!chat) {
      chat = {
        id: `chat-${crypto2.randomUUID().slice(0, 8)}`,
        type: "direct",
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
        lastMessageAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastInboundAt: null,
        conversationCategory: "SERVICE"
      };
      this.state.chats.unshift(chat);
      this.state.messages[chat.id] = [];
    }
    return chat;
  }
  // --- Chats ---
  createGroupChat(input) {
    const validIds = input.participantIds.filter(
      (pid) => this.state.contacts.some((c) => c.id === pid)
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const chat = {
      id: `chat-grp-${crypto2.randomUUID().slice(0, 8)}`,
      type: "group",
      phoneNumberId: this.state.settings.activePhoneNumberId,
      name: input.name.trim() || "New QA Group",
      avatarColor: "#008069",
      description: input.description?.trim() || "Group conversation",
      participantIds: validIds,
      unreadCount: 0,
      archived: false,
      pinned: false,
      muted: false,
      labelIds: [],
      lastMessageId: null,
      lastMessageAt: now,
      lastInboundAt: now,
      conversationCategory: "SERVICE"
    };
    const sysMsg = {
      id: `msg-${crypto2.randomUUID().slice(0, 10)}`,
      chatId: chat.id,
      phoneNumberId: chat.phoneNumberId,
      senderId: "system",
      senderName: "System",
      direction: "inbound",
      type: "system",
      body: `You created group "${chat.name}"`,
      timestamp: now,
      status: "read"
    };
    chat.lastMessageId = sysMsg.id;
    this.state.chats.unshift(chat);
    this.state.messages[chat.id] = [sysMsg];
    this.persist();
    this.emit({ type: "chat:updated", payload: chat });
    this.emit({ type: "message:created", payload: { chatId: chat.id, message: sysMsg, chat } });
    return chat;
  }
  updateChat(chatId, patch) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;
    Object.assign(chat, patch);
    this.persist();
    this.emit({ type: "chat:updated", payload: chat });
    return chat;
  }
  clearChatMessages(chatId) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;
    this.state.messages[chatId] = [];
    chat.lastMessageId = null;
    chat.unreadCount = 0;
    this.persist();
    this.emit({ type: "state:sync", payload: this.state });
    return chat;
  }
  deleteChat(chatId) {
    const idx = this.state.chats.findIndex((c) => c.id === chatId);
    if (idx === -1) return false;
    this.state.chats.splice(idx, 1);
    delete this.state.messages[chatId];
    this.persist();
    this.emit({ type: "chat:deleted", payload: { chatId } });
    return true;
  }
  // --- Messaging (with 24h Window, Opt-In/Out, Block, Templates, Rich Types & Error Codes) ---
  findQuotedMessage(chatId, messageId) {
    if (!messageId) return void 0;
    const msg = (this.state.messages[chatId] || []).find((m) => m.id === messageId);
    if (!msg) return void 0;
    return {
      messageId: msg.id,
      senderName: msg.direction === "outbound" ? "You" : msg.senderName,
      body: msg.body || (msg.media?.caption ?? msg.media?.filename ?? msg.type),
      type: msg.type
    };
  }
  resolveMediaAttachment(media, mediaId) {
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
          waveform: media?.waveform
        };
      }
    }
    return media;
  }
  sendMessage(params) {
    let chat;
    let directContact;
    if (params.chatId) {
      chat = this.state.chats.find((c) => c.id === params.chatId);
      if (chat?.contactId) {
        directContact = this.state.contacts.find((c) => c.id === chat.contactId);
      }
    } else if (params.toPhone) {
      const cleanPhone = normalizeE164(params.toPhone);
      if (!isValidE164(cleanPhone)) {
        return {
          ok: false,
          httpStatus: 400,
          error: {
            code: 100,
            title: "Invalid parameter",
            message: "Recipient phone must be valid E.164 format (e.g. +14155550142)."
          }
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
        error: { code: 100, title: "Chat not found", message: "Target chat could not be resolved." }
      };
    }
    const phoneCfg = this.getPhoneConfig(params.phoneNumberId || chat.phoneNumberId);
    const isBusiness = this.state.settings.variant === "business";
    const isTemplate = params.type === "template" || Boolean(params.templateId || params.templateName);
    const recipientPhone = directContact?.phone || params.toPhone || chat.id;
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
        params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : "[Rate limited]"),
        isTemplate ? "template" : params.type || "text",
        rateRes.error,
        rateRes.httpStatus,
        params.deferPersist
      );
    }
    if (this.state.failureInjection.enabled) {
      const roll = typeof params.failureRollPercent === "number" ? params.failureRollPercent : Math.random() * 100;
      const injected = evaluateFailureInjection(this.state.failureInjection, roll, recipientPhone);
      if (injected) {
        return this.recordFailedOutbound(
          chat,
          phoneCfg,
          params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : "[Injected failure]"),
          isTemplate ? "template" : params.type || "text",
          injected.error,
          injected.httpStatus,
          params.deferPersist
        );
      }
    }
    if (directContact?.invalidNumber) {
      const err = META_ERRORS.INVALID_RECIPIENT(
        `Recipient ${directContact.phone} is not a valid WhatsApp account.`
      );
      return this.recordFailedOutbound(
        chat,
        phoneCfg,
        params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : "[Invalid recipient]"),
        isTemplate ? "template" : params.type || "text",
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
        params.body || (isTemplate ? `[Template: ${params.templateName || params.templateId}]` : "[Disabled number]"),
        isTemplate ? "template" : params.type || "text",
        err,
        400,
        params.deferPersist
      );
    }
    if (directContact?.blocked) {
      const err = META_ERRORS.CONTACT_BLOCKED(
        `Cannot send to ${directContact.phone}: contact is blocked.`
      );
      return this.recordFailedOutbound(chat, phoneCfg, params.body || "[Blocked send]", params.type || "text", err, 403, params.deferPersist);
    }
    if (isBusiness && this.state.settings.enforceOptIn && directContact && directContact.optInStatus === "opted_out") {
      if (isTemplate) {
        const err = META_ERRORS.RECIPIENT_OPTED_OUT(
          `Contact ${directContact.phone} opted out (${directContact.optInSource}). Business-initiated templates are blocked until re-opt-in (e.g. START).`
        );
        return this.recordFailedOutbound(chat, phoneCfg, params.body || `[Template: ${params.templateName || params.templateId}]`, "template", err, 403, params.deferPersist);
      }
    }
    if (isBusiness && this.state.settings.enforce24hWindow && chat.type === "direct" && !isTemplate) {
      const windowStatus = getCustomerServiceWindowStatus(chat.lastInboundAt);
      if (!windowStatus.open) {
        const err = META_ERRORS.RE_ENGAGEMENT_REQUIRED(
          `24-hour customer service window closed for ${chat.name}. Send an APPROVED template message or wait for a new inbound customer message.`
        );
        return this.recordFailedOutbound(chat, phoneCfg, params.body || "[Session message blocked]", params.type || "text", err, 400, params.deferPersist);
      }
    }
    let templatePayload;
    let resolvedCategory = "SERVICE";
    let msgType = params.type || "text";
    let body = params.body || "";
    if (isTemplate) {
      let tpl = this.state.templates.find(
        (t) => params.templateId && t.id === params.templateId || params.templateName && t.name.toLowerCase() === params.templateName.toLowerCase()
      );
      if (!tpl) {
        const rawName = (params.templateName || params.templateId || "broadcast_template").trim();
        const cleanName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        const isBday = cleanName.includes("birthday") || cleanName.includes("bday");
        const isFest = cleanName.includes("festival") || cleanName.includes("festive") || cleanName.includes("diwali");
        tpl = this.upsertTemplate({
          name: cleanName,
          category: isBday ? "UTILITY" : "MARKETING",
          status: "APPROVED",
          bodyText: params.body && !params.body.startsWith("[Template:") ? params.body : isBday ? "Dear Hon. {{1}}, Karnataka State Protocol Vehicle Desk extends warm greetings on your birthday! \u{1F382} May this year bring you good health and prosperity." : isFest ? "Dear Hon. {{1}}, festive greetings from Karnataka State Protocol Fleet Desk. 24/7 priority transport services remain active." : "Dear Hon. {{1}}, official dispatch announcement from Karnataka State Protocol Vehicle Desk (DPAR).",
          headerText: isBday ? "Warm Birthday Greetings! \u{1F382}" : isFest ? "Festive Protocol Greetings \u2728" : "Official Protocol Fleet Notice \u{1F4E2}",
          headerImageUrl: isBday ? "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80" : isFest ? "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80" : "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80",
          footerText: void 0,
          buttons: [
            {
              type: "URL",
              text: "View Protocol Portal",
              url: "https://dpar.karnataka.gov.in"
            }
          ],
          sampleValues: ["Valued Client"]
        });
      }
      if (!tpl || tpl.status !== "APPROVED") {
        const err = META_ERRORS.TEMPLATE_NOT_APPROVED(
          tpl ? `Template "${tpl.name}" has status ${tpl.status} (must be APPROVED).` : `Template "${params.templateName || params.templateId}" was not found.`
        );
        return { ok: false, httpStatus: 400, error: err };
      }
      const contactObj = chat.contactId ? this.state.contacts.find((c) => c.id === chat.contactId) : void 0;
      const parsedVars = params.templateVariables && params.templateVariables.length > 0 ? params.templateVariables : [];
      const recipientName = parsedVars[0] || contactObj?.name || (chat.name && !chat.name.startsWith("+") ? chat.name : "Valued Client");
      const vars = parsedVars.length > 0 ? parsedVars : tpl.sampleValues && tpl.sampleValues.length > 0 ? tpl.sampleValues : [recipientName];
      let renderedBody = renderTemplateBody(tpl.bodyText, vars);
      renderedBody = renderedBody.replace(/\{\{1\}\}/g, recipientName).replace(/\{\{name\}\}/gi, recipientName).replace(/\{\{first_name\}\}/gi, recipientName.split(/\s+/)[0] || recipientName);
      if (recipientName && recipientName !== "Valued Client" && chat.name.startsWith("+")) {
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
        otpCode: params.templateOtpCode || (tpl.category === "AUTHENTICATION" ? vars[0] : void 0)
      };
      msgType = "template";
      body = renderedBody;
      resolvedCategory = tpl.category;
    }
    let catalogItem;
    let carouselItems;
    if (params.catalogItemId) {
      catalogItem = this.state.catalog.find((item) => item.id === params.catalogItemId);
      if (catalogItem) {
        msgType = "catalog_item";
        if (!body) body = `${catalogItem.name} \u2014 ${catalogItem.currency} ${catalogItem.price}`;
      }
    } else if (params.carouselItemIds && params.carouselItemIds.length > 0) {
      carouselItems = params.carouselItemIds.map((id) => this.state.catalog.find((item) => item.id === id)).filter((x) => Boolean(x));
      if (carouselItems.length > 0) {
        msgType = "product_carousel";
        if (!body) body = `Product collection (${carouselItems.length} items)`;
      }
    }
    if (params.interactive) {
      msgType = "interactive";
      if (!body) body = params.interactive.bodyText;
    } else if (params.location) {
      msgType = "location";
      if (!body) body = params.location.name || `${params.location.latitude}, ${params.location.longitude}`;
    } else if (params.contacts && params.contacts.length > 0) {
      msgType = "contacts";
      if (!body) body = params.contacts.map((c) => c.name).join(", ");
    } else if (params.order) {
      msgType = "order";
      if (!body) body = `Order ${params.order.orderId} (${params.order.currency} ${params.order.totalAmount})`;
    }
    const resolvedMedia = this.resolveMediaAttachment(params.media, params.mediaId);
    const linkPreview = msgType === "text" ? extractLinkPreview(body) : void 0;
    if (params.simulateErrorCode) {
      const simulatedErr = params.simulateErrorCode === 131047 ? META_ERRORS.RE_ENGAGEMENT_REQUIRED() : params.simulateErrorCode === 131049 ? META_ERRORS.RECIPIENT_OPTED_OUT() : META_ERRORS.MESSAGE_UNDELIVERABLE(
        `Simulated Meta error code ${params.simulateErrorCode}`
      );
      return this.recordFailedOutbound(chat, phoneCfg, body || `[Error ${params.simulateErrorCode}]`, msgType, simulatedErr, 200);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const message = {
      id: `wamid.${crypto2.randomUUID().replace(/-/g, "").slice(0, 18)}`,
      chatId: chat.id,
      phoneNumberId: phoneCfg.id,
      senderId: "me",
      senderName: isBusiness ? phoneCfg.displayName : this.state.self.name,
      direction: "outbound",
      type: msgType,
      body,
      timestamp: now,
      status: "queued",
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
      metadata: params.metadata
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
    this.emit({ type: "message:created", payload: { chatId: chat.id, message, chat } });
    if (params.broadcastId && directContact) {
      this.broadcastMessageIndex.set(message.id, {
        broadcastId: params.broadcastId,
        contactId: directContact.id
      });
    }
    this.updateMessageReceipt(message.id, "sent", void 0, params.deferPersist);
    if (!params.skipLifecycleTimers) {
      const timing = directContact?.receiptTiming;
      const deliveredMs = timing ? timing.deliveredMinMs + Math.floor(Math.random() * Math.max(1, timing.deliveredMaxMs - timing.deliveredMinMs)) : this.state.settings.lifecycleDeliveredMs;
      const readMs = timing ? timing.readMinMs + Math.floor(Math.random() * Math.max(1, timing.readMaxMs - timing.readMinMs)) : this.state.settings.lifecycleReadMs;
      const shouldRead = timing ? Math.random() <= timing.readProbability : true;
      this.scheduleTimer(() => {
        const current = this.findMessage(message.id);
        if (current && current.status === "sent") {
          this.updateMessageReceipt(message.id, "delivered", void 0, params.deferPersist);
        }
      }, deliveredMs);
      if (shouldRead) {
        this.scheduleTimer(() => {
          const current = this.findMessage(message.id);
          if (current && (current.status === "delivered" || current.status === "sent")) {
            this.updateMessageReceipt(message.id, "read", void 0, params.deferPersist);
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
  recordFailedOutbound(chat, phoneCfg, body, type, error, httpStatus, deferPersist = false) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const failedMsg = {
      id: `wamid.${crypto2.randomUUID().replace(/-/g, "").slice(0, 18)}`,
      chatId: chat.id,
      phoneNumberId: phoneCfg.id,
      senderId: "me",
      senderName: this.state.settings.variant === "business" ? phoneCfg.displayName : this.state.self.name,
      direction: "outbound",
      type,
      body,
      timestamp: now,
      status: "failed",
      error
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
    this.emit({ type: "message:created", payload: { chatId: chat.id, message: failedMsg, chat } });
    this.recordWebhook(
      "message.status",
      buildCloudWebhookEnvelope("statuses", phoneCfg, {
        id: failedMsg.id,
        status: "failed",
        timestamp: String(Math.floor(Date.now() / 1e3)),
        recipient_id: chat.contactId ? this.state.contacts.find((c) => c.id === chat.contactId)?.phone.replace(/[^\d]/g, "") : void 0,
        errors: [
          {
            code: error.code,
            title: error.title,
            message: error.message,
            error_data: error.errorData
          }
        ]
      }),
      phoneCfg.id
    );
    return { ok: false, message: failedMsg, chat, error, httpStatus };
  }
  receiveMessage(params) {
    let chat;
    let sender;
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
          error: { code: 100, title: "Invalid phone", message: "fromPhone must be valid E.164 format." }
        };
      }
      sender = this.state.contacts.find((c) => c.phone === cleanPhone);
      if (!sender) {
        const created = this.createContact({
          name: params.fromName?.trim() || cleanPhone,
          phone: cleanPhone
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
        error: { code: 100, title: "Chat not found", message: "Could not resolve target chat or sender." }
      };
    }
    if (!sender) {
      const fallbackId = chat.contactId || chat.participantIds[0];
      sender = this.state.contacts.find((c) => c.id === fallbackId);
    }
    if (sender?.blocked) {
      return {
        ok: false,
        error: META_ERRORS.CONTACT_BLOCKED(
          `Inbound message from ${sender.phone} rejected because contact is blocked.`
        )
      };
    }
    const phoneCfg = this.getPhoneConfig(params.phoneNumberId || chat.phoneNumberId);
    const resolvedMedia = this.resolveMediaAttachment(params.media, params.mediaId);
    const msgType = params.type || (params.interactive ? "interactive" : params.location ? "location" : params.order ? "order" : "text");
    const body = params.body || params.interactive?.selectedTitle || params.interactive?.bodyText || params.location?.name || resolvedMedia?.filename || "";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const message = {
      id: `wamid.${crypto2.randomUUID().replace(/-/g, "").slice(0, 18)}`,
      chatId: chat.id,
      phoneNumberId: phoneCfg.id,
      senderId: sender?.id || "external",
      senderName: sender?.name || params.fromName || "External Contact",
      direction: "inbound",
      type: msgType,
      body,
      timestamp: now,
      status: "delivered",
      media: resolvedMedia,
      location: params.location,
      contacts: params.contacts,
      interactive: params.interactive,
      order: params.order,
      linkPreview: msgType === "text" ? extractLinkPreview(body) : void 0,
      replyTo: this.findQuotedMessage(chat.id, params.replyToMessageId),
      conversationCategory: "SERVICE",
      metadata: params.metadata
    };
    if (!this.state.messages[chat.id]) {
      this.state.messages[chat.id] = [];
    }
    this.state.messages[chat.id].push(message);
    chat.lastMessageId = message.id;
    chat.lastMessageAt = now;
    chat.lastInboundAt = now;
    chat.unreadCount += 1;
    chat.typingContactId = null;
    chat.typingMode = null;
    if (sender) {
      sender.presence = "online";
      sender.lastSeen = now;
    }
    this.trackConversationBilling(chat, "SERVICE", message.id);
    let optInChanged;
    if (sender && msgType === "text") {
      const detected = detectOptInKeyword(body);
      if (detected) {
        this.setContactOptIn(
          sender.id,
          detected.action,
          "inbound_keyword",
          detected.keyword,
          `Triggered by inbound message: "${body.slice(0, 60)}"`
        );
        optInChanged = { status: detected.action, keyword: detected.keyword };
      }
    }
    this.persist();
    this.emit({ type: "message:created", payload: { chatId: chat.id, message, chat } });
    const waFrom = (sender?.phone || params.fromPhone || "unknown").replace(/[^\d]/g, "");
    const cloudMsgData = {
      id: message.id,
      from: waFrom,
      timestamp: String(Math.floor(Date.now() / 1e3)),
      type: message.type === "voice" ? "audio" : message.type,
      chat_id: chat.id
    };
    if (message.type === "text") {
      cloudMsgData.text = { body: message.body };
    } else if (message.interactive) {
      if (message.interactive.kind === "button_reply") {
        cloudMsgData.interactive = {
          type: "button_reply",
          button_reply: {
            id: message.interactive.selectedId || "btn_1",
            title: message.interactive.selectedTitle || message.body
          }
        };
      } else if (message.interactive.kind === "list_reply") {
        cloudMsgData.interactive = {
          type: "list_reply",
          list_reply: {
            id: message.interactive.selectedId || "row_1",
            title: message.interactive.selectedTitle || message.body
          }
        };
      } else {
        cloudMsgData.interactive = message.interactive;
      }
    } else if (message.location) {
      cloudMsgData.location = message.location;
    } else if (message.order) {
      cloudMsgData.order = message.order;
    } else if (message.media) {
      cloudMsgData[message.type === "voice" ? "audio" : message.type] = {
        id: message.media.mediaId || message.media.id,
        mime_type: message.media.mimeType,
        caption: message.media.caption,
        filename: message.media.filename
      };
    }
    this.recordWebhook(
      "message.received",
      buildCloudWebhookEnvelope(
        "messages",
        phoneCfg,
        cloudMsgData,
        sender ? [{ profile: { name: sender.profileName || sender.name }, wa_id: waFrom }] : void 0
      ),
      phoneCfg.id
    );
    if (!optInChanged || optInChanged.status !== "opted_out") {
      this.triggerBusinessAutomation(chat, sender);
    }
    return { ok: true, message, chat, optInChanged };
  }
  triggerAutoReplyIfMatched(chat, outboundMessage) {
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
    if (matched.respectOptOut !== false && responder.optInStatus === "opted_out") {
      return;
    }
    const typingStart = Math.max(120, matched.delayMs - matched.simulateTypingMs);
    this.scheduleTimer(() => {
      if (this.state.settings.autoMarkReadOnAutoReply) {
        this.updateMessageReceipt(outboundMessage.id, "read");
      }
      this.setTyping(chat.id, responder.id, "typing");
    }, typingStart);
    this.scheduleTimer(() => {
      this.setTyping(chat.id, null, null);
      this.receiveMessage({
        chatId: chat.id,
        senderId: responder.id,
        body: matched.reply,
        type: "text",
        metadata: { autoReplyRuleId: matched.id, triggeredByMessageId: outboundMessage.id }
      });
    }, Math.max(matched.delayMs, typingStart + 200));
  }
  triggerBusinessAutomation(chat, sender) {
    if (this.state.settings.variant !== "business") return;
    if (chat.type !== "direct") return;
    if (sender?.blocked) return;
    const auto = this.state.settings.businessAutomation;
    if (auto.awayEnabled && auto.awayMessage.trim()) {
      this.scheduleTimer(() => {
        this.sendMessage({
          chatId: chat.id,
          body: auto.awayMessage,
          type: "text",
          skipLifecycleTimers: false,
          metadata: { businessAutomation: "away" }
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
          type: "text",
          skipLifecycleTimers: false,
          metadata: { businessAutomation: "greeting" }
        });
      }, 650);
    }
  }
  findMessage(messageId) {
    for (const list of Object.values(this.state.messages)) {
      const found = list.find((m) => m.id === messageId);
      if (found) return found;
    }
    return null;
  }
  updateMessageReceipt(messageId, status, errorCode, deferPersist = false) {
    for (const [chatId, list] of Object.entries(this.state.messages)) {
      const msg = list.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        if (status === "failed") {
          msg.error = errorCode === 131047 ? META_ERRORS.RE_ENGAGEMENT_REQUIRED() : errorCode === 131049 ? META_ERRORS.RECIPIENT_OPTED_OUT() : errorCode === 131030 ? META_ERRORS.INVALID_RECIPIENT() : errorCode === 131056 ? META_ERRORS.PAIR_RATE_LIMIT() : errorCode === 130429 ? META_ERRORS.THROUGHPUT_RATE_LIMIT() : META_ERRORS.MESSAGE_UNDELIVERABLE(
            `Failed receipt set with Meta error code ${errorCode || 131026}`
          );
        } else {
          msg.error = void 0;
        }
        const phoneCfg = this.getPhoneConfig(msg.phoneNumberId);
        const category = msg.conversationCategory || "SERVICE";
        const rate = this.state.settings.pricingRatesUsd[category] ?? 0;
        this.syncBroadcastRecipientStatus(msg.id, status, msg.error);
        if (deferPersist) {
          this.persistDeferred();
        } else {
          this.persist();
        }
        this.emit({ type: "message:updated", payload: { chatId, message: msg } });
        this.recordWebhook(
          "message.status",
          buildCloudWebhookEnvelope("statuses", phoneCfg, {
            id: msg.id,
            status,
            timestamp: String(Math.floor(Date.now() / 1e3)),
            chat_id: chatId,
            conversation: {
              id: `conv_${chatId}`,
              origin: { type: category.toLowerCase() }
            },
            pricing: {
              billable: rate > 0,
              pricing_model: "CBP",
              category: category.toLowerCase()
            },
            ...msg.error ? {
              errors: [
                {
                  code: msg.error.code,
                  title: msg.error.title,
                  message: msg.error.message,
                  error_data: msg.error.errorData
                }
              ]
            } : {}
          }),
          phoneCfg.id
        );
        return msg;
      }
    }
    return null;
  }
  markChatRead(chatId) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;
    const msgs = this.state.messages[chatId] || [];
    const updated = [];
    for (const msg of msgs) {
      if (msg.direction === "inbound" && msg.status !== "read") {
        msg.status = "read";
        updated.push(msg);
      }
    }
    const hadUnread = chat.unreadCount > 0;
    chat.unreadCount = 0;
    if (hadUnread || updated.length > 0) {
      const phoneCfg = this.getPhoneConfig(chat.phoneNumberId);
      this.persist();
      this.emit({ type: "chat:updated", payload: chat });
      for (const m of updated) {
        this.emit({ type: "message:updated", payload: { chatId, message: m } });
      }
      if (updated.length > 0) {
        this.recordWebhook(
          "message.status",
          buildCloudWebhookEnvelope("statuses", phoneCfg, {
            id: updated[updated.length - 1].id,
            status: "read",
            timestamp: String(Math.floor(Date.now() / 1e3)),
            chat_id: chatId
          }),
          phoneCfg.id
        );
      }
    }
    return chat;
  }
  setTyping(chatId, contactId, mode) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return null;
    chat.typingContactId = contactId;
    chat.typingMode = contactId ? mode || "typing" : null;
    if (contactId) {
      const contact = this.state.contacts.find((c) => c.id === contactId);
      if (contact) {
        contact.presence = mode === "recording" ? "recording" : "typing";
      }
    } else if (chat.contactId) {
      const contact = this.state.contacts.find((c) => c.id === chat.contactId);
      if (contact && (contact.presence === "typing" || contact.presence === "recording")) {
        contact.presence = "online";
      }
    }
    this.emit({
      type: "typing:updated",
      payload: { chatId, contactId: chat.typingContactId, mode: chat.typingMode }
    });
    const phoneCfg = this.getPhoneConfig(chat.phoneNumberId);
    this.recordWebhook(
      "presence.typing",
      buildCloudWebhookEnvelope("typing", phoneCfg, {
        chat_id: chatId,
        contact_id: contactId,
        state: chat.typingMode || "idle"
      }),
      phoneCfg.id
    );
    return chat;
  }
  // --- Templates ---
  upsertTemplate(input) {
    const cleanName = input.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const target = input.id ? this.state.templates.find((t) => t.id === input.id) : this.state.templates.find((t) => t.name === cleanName);
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
        updatedAt: now
      });
      this.emitBusinessUpdate();
      if (input.status && input.status !== prevStatus) {
        this.emitTemplateStatusWebhook(target);
      }
      return target;
    }
    const created = {
      id: `tpl-${crypto2.randomUUID().slice(0, 8)}`,
      name: cleanName,
      language: input.language || "en_US",
      category: input.category,
      status: input.status || "PENDING",
      headerText: input.headerText?.trim() || void 0,
      headerImageUrl: input.headerImageUrl?.trim() || void 0,
      bodyText: input.bodyText.trim(),
      footerText: input.footerText?.trim() || void 0,
      buttons: input.buttons || [],
      sampleValues: input.sampleValues || [],
      createdAt: now,
      updatedAt: now
    };
    this.state.templates.unshift(created);
    this.emitBusinessUpdate();
    this.emitTemplateStatusWebhook(created);
    return created;
  }
  setTemplateStatus(id, status, rejectionReason) {
    const tpl = this.state.templates.find((t) => t.id === id);
    if (!tpl) return null;
    tpl.status = status;
    tpl.rejectionReason = status === "REJECTED" ? rejectionReason || "POLICY_VIOLATION" : void 0;
    tpl.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.emitBusinessUpdate();
    this.emitTemplateStatusWebhook(tpl);
    return tpl;
  }
  deleteTemplate(id) {
    const idx = this.state.templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.state.templates.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }
  emitTemplateStatusWebhook(tpl) {
    const phoneCfg = this.getPhoneConfig();
    this.recordWebhook(
      "template.status",
      buildCloudWebhookEnvelope("message_template_status_update", phoneCfg, {
        event: tpl.status,
        message_template_id: tpl.id,
        message_template_name: tpl.name,
        message_template_language: tpl.language,
        category: tpl.category,
        reason: tpl.rejectionReason || "NONE"
      }),
      phoneCfg.id
    );
  }
  // --- Pricing Summary ---
  getConversationPricingSummary() {
    const byCategory = {
      MARKETING: { count: 0, totalCostUsd: 0 },
      UTILITY: { count: 0, totalCostUsd: 0 },
      AUTHENTICATION: { count: 0, totalCostUsd: 0 },
      SERVICE: { count: 0, totalCostUsd: 0 }
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
      records: this.state.conversations
    };
  }
  // --- Config & Self Profile ---
  emitConfigUpdate() {
    this.emit({
      type: "config:updated",
      payload: {
        settings: this.state.settings,
        self: this.state.self,
        phoneNumbers: this.state.phoneNumbers
      }
    });
  }
  updateConfig(patch) {
    if (patch.variant === "personal" || patch.variant === "business") {
      this.state.settings.variant = patch.variant;
    }
    if (patch.activePhoneNumberId && this.state.phoneNumbers.some((p) => p.id === patch.activePhoneNumberId)) {
      this.state.settings.activePhoneNumberId = patch.activePhoneNumberId;
    }
    if (typeof patch.webhookUrl === "string") {
      this.state.settings.webhookUrl = patch.webhookUrl.trim();
    }
    if (typeof patch.webhookSecret === "string") {
      this.state.settings.webhookSecret = patch.webhookSecret.trim();
    }
    if (typeof patch.lifecycleDeliveredMs === "number" && patch.lifecycleDeliveredMs >= 0) {
      this.state.settings.lifecycleDeliveredMs = patch.lifecycleDeliveredMs;
    }
    if (typeof patch.lifecycleReadMs === "number" && patch.lifecycleReadMs >= 0) {
      this.state.settings.lifecycleReadMs = patch.lifecycleReadMs;
    }
    if (typeof patch.autoMarkReadOnAutoReply === "boolean") {
      this.state.settings.autoMarkReadOnAutoReply = patch.autoMarkReadOnAutoReply;
    }
    if (typeof patch.enforce24hWindow === "boolean") {
      this.state.settings.enforce24hWindow = patch.enforce24hWindow;
    }
    if (typeof patch.enforceOptIn === "boolean") {
      this.state.settings.enforceOptIn = patch.enforceOptIn;
    }
    if (patch.self) {
      if (typeof patch.self.name === "string" && patch.self.name.trim()) {
        this.state.self.name = patch.self.name.trim();
      }
      if (typeof patch.self.phone === "string" && patch.self.phone.trim()) {
        this.state.self.phone = patch.self.phone.trim();
      }
      if (typeof patch.self.about === "string") {
        this.state.self.about = patch.self.about.trim();
      }
    }
    this.persist();
    this.emitConfigUpdate();
    return {
      settings: this.state.settings,
      self: this.state.self,
      phoneNumbers: this.state.phoneNumbers
    };
  }
  // --- Business Features ---
  updateBusinessProfile(patch) {
    Object.assign(this.state.settings.businessProfile, patch);
    const activeNum = this.getPhoneConfig();
    Object.assign(activeNum.businessProfile, patch);
    this.persist();
    this.emitConfigUpdate();
    return this.state.settings.businessProfile;
  }
  updateBusinessAutomation(patch) {
    Object.assign(this.state.settings.businessAutomation, patch);
    this.persist();
    this.emitConfigUpdate();
    return this.state.settings.businessAutomation;
  }
  emitBusinessUpdate() {
    this.persist();
    this.emit({
      type: "business:updated",
      payload: {
        catalog: this.state.catalog,
        quickReplies: this.state.quickReplies,
        labels: this.state.labels,
        autoReplyRules: this.state.autoReplyRules,
        templates: this.state.templates,
        conversations: this.state.conversations
      }
    });
  }
  upsertCatalogItem(item) {
    if (item.id) {
      const existing = this.state.catalog.find((c) => c.id === item.id);
      if (existing) {
        Object.assign(existing, item);
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created = {
      id: `cat-${crypto2.randomUUID().slice(0, 8)}`,
      name: item.name.trim(),
      price: item.price.trim(),
      currency: item.currency?.trim() || "USD",
      description: item.description?.trim() || "",
      sku: item.sku?.trim() || `SKU-${Math.floor(1e3 + Math.random() * 9e3)}`,
      imageUrl: item.imageUrl,
      inStock: item.inStock !== false
    };
    this.state.catalog.unshift(created);
    this.emitBusinessUpdate();
    return created;
  }
  deleteCatalogItem(id) {
    const idx = this.state.catalog.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.state.catalog.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }
  upsertQuickReply(input) {
    const cleanShortcut = input.shortcut.replace(/^\/+/, "").trim().toLowerCase();
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
    const created = {
      id: `qr-${crypto2.randomUUID().slice(0, 8)}`,
      shortcut: cleanShortcut,
      message: input.message.trim(),
      keywords: input.keywords || []
    };
    this.state.quickReplies.unshift(created);
    this.emitBusinessUpdate();
    return created;
  }
  deleteQuickReply(id) {
    const idx = this.state.quickReplies.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    this.state.quickReplies.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }
  upsertLabel(input) {
    if (input.id) {
      const existing = this.state.labels.find((l) => l.id === input.id);
      if (existing) {
        existing.name = input.name.trim();
        existing.color = input.color;
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created = {
      id: `lbl-${crypto2.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      color: input.color
    };
    this.state.labels.push(created);
    this.emitBusinessUpdate();
    return created;
  }
  deleteLabel(id) {
    const idx = this.state.labels.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    this.state.labels.splice(idx, 1);
    for (const chat of this.state.chats) {
      if (chat.labelIds.includes(id)) {
        chat.labelIds = chat.labelIds.filter((lid) => lid !== id);
        this.emit({ type: "chat:updated", payload: chat });
      }
    }
    this.emitBusinessUpdate();
    return true;
  }
  upsertAutoReplyRule(input) {
    if (input.id) {
      const existing = this.state.autoReplyRules.find((r) => r.id === input.id);
      if (existing) {
        Object.assign(existing, {
          name: input.name.trim(),
          pattern: input.pattern,
          reply: input.reply,
          matchType: input.matchType || existing.matchType,
          enabled: typeof input.enabled === "boolean" ? input.enabled : existing.enabled,
          delayMs: typeof input.delayMs === "number" ? input.delayMs : existing.delayMs,
          simulateTypingMs: typeof input.simulateTypingMs === "number" ? input.simulateTypingMs : existing.simulateTypingMs,
          contactId: input.contactId,
          respectOptOut: typeof input.respectOptOut === "boolean" ? input.respectOptOut : existing.respectOptOut
        });
        this.emitBusinessUpdate();
        return existing;
      }
    }
    const created = {
      id: `rule-${crypto2.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      enabled: input.enabled !== false,
      matchType: input.matchType || "contains",
      pattern: input.pattern,
      reply: input.reply,
      contactId: input.contactId,
      delayMs: typeof input.delayMs === "number" ? input.delayMs : 700,
      simulateTypingMs: typeof input.simulateTypingMs === "number" ? input.simulateTypingMs : 500,
      respectOptOut: input.respectOptOut !== false
    };
    this.state.autoReplyRules.unshift(created);
    this.emitBusinessUpdate();
    return created;
  }
  deleteAutoReplyRule(id) {
    const idx = this.state.autoReplyRules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.state.autoReplyRules.splice(idx, 1);
    this.emitBusinessUpdate();
    return true;
  }
  clearWebhookLogs() {
    this.state.webhookLogs = [];
    this.persist();
    this.emit({ type: "state:sync", payload: this.state });
  }
  // =========================================================================
  // Phase 3: Seeded Client Numbers, Broadcast Engine, Rate Limits & Faults
  // =========================================================================
  bulkSeedClients(request, silent = false) {
    if (request.clearPreviousSeeded) {
      const removedIds = new Set(
        this.state.contacts.filter((c) => c.seeded).map((c) => c.id)
      );
      this.state.contacts = this.state.contacts.filter((c) => !c.seeded);
      const keptChats = [];
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
    const createdContacts = [];
    const createdChats = [];
    const now = Date.now();
    specs.forEach((spec, idx) => {
      const contact = buildContactFromClientSeed(
        spec,
        this.state.contacts.length + idx,
        request.clients ? "seed_file" : "bulk_seed"
      );
      this.state.contacts.push(contact);
      createdContacts.push(contact);
      const chat = {
        id: `chat-${contact.id}`,
        type: "direct",
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
        lastMessageAt: new Date(now - (idx + 60) * 6e4).toISOString(),
        lastInboundAt: spec.windowOpen ? new Date(now - Math.min(180, 15 + idx) * 6e4).toISOString() : new Date(now - 30 * 36e5).toISOString(),
        conversationCategory: "MARKETING"
      };
      this.state.chats.push(chat);
      this.state.messages[chat.id] = [];
      createdChats.push(chat);
    });
    if (!silent) {
      this.persist();
      if (request.clearPreviousSeeded) {
        this.emit({ type: "state:sync", payload: this.state });
      } else {
        this.emit({
          type: "clients:seeded",
          payload: { contacts: createdContacts, chats: createdChats }
        });
      }
    }
    return {
      seededCount: createdContacts.length,
      contacts: createdContacts,
      chats: createdChats
    };
  }
  listClients(filter) {
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
        const hay = `${c.name} ${c.phone} ${(c.tags || []).join(" ")} ${c.country || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  simulateClientResponse(req) {
    const targets = [];
    const seen = /* @__PURE__ */ new Set();
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
    const delayMs = typeof req.delayMs === "number" && req.delayMs >= 0 ? req.delayMs : 0;
    const results = [];
    for (const contact of targets) {
      if (req.action === "silence") {
        this.updateContact(contact.id, { personality: "silent" });
        results.push({
          contactId: contact.id,
          phone: contact.phone,
          action: "silence",
          ok: true,
          note: "Personality set to silent"
        });
        continue;
      }
      const execute = () => {
        if (req.action === "opt_out") {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || "STOP",
            type: "text",
            metadata: { simulatedClientResponse: "opt_out" }
          });
        } else if (req.action === "opt_in") {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || "START",
            type: "text",
            metadata: { simulatedClientResponse: "opt_in" }
          });
        } else if (req.action === "button_click") {
          const title = req.buttonTitle?.trim() || req.text?.trim() || "Confirm Delivery";
          const id = req.buttonId?.trim() || "sim_btn_1";
          this.receiveMessage({
            fromPhone: contact.phone,
            body: title,
            type: "interactive",
            interactive: {
              kind: "button_reply",
              bodyText: title,
              selectedId: id,
              selectedTitle: title
            },
            metadata: { simulatedClientResponse: "button_click" }
          });
        } else if (req.action === "catalog_view") {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || "Viewed catalog \u2014 interested in Matte Pour-Over Brew Kit.",
            type: "text",
            metadata: { simulatedClientResponse: "catalog_view" }
          });
        } else {
          this.receiveMessage({
            fromPhone: contact.phone,
            body: req.text?.trim() || "Thanks! Got your message.",
            type: "text",
            metadata: { simulatedClientResponse: "reply" }
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
        note: delayMs > 0 ? `Scheduled in ${delayMs}ms` : "Dispatched immediately"
      });
    }
    return { ok: true, affected: results.length, results };
  }
  triggerSeededClientResponse(chat, contact, outboundMessage, broadcastId) {
    const computed = computeClientAutoResponse(contact, outboundMessage);
    if (!computed) return;
    this.scheduleTimer(() => {
      const fresh = this.state.contacts.find((c) => c.id === contact.id);
      if (!fresh || fresh.blocked || fresh.disabled || fresh.personality === "silent") return;
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
          reason: computed.reason
        }
      });
      if (res.ok && broadcastId) {
        this.recordBroadcastRecipientReply(broadcastId, fresh.id, computed.body);
      }
    }, computed.delayMs);
  }
  recordBroadcastRecipientReply(broadcastId, contactId, replyPreview) {
    const job = this.state.broadcasts.find((b) => b.id === broadcastId);
    if (!job) return;
    const rec = job.recipients.find((r) => r.contactId === contactId);
    if (!rec) return;
    if (!rec.repliedAt) {
      job.counts.replied += 1;
    }
    rec.repliedAt = (/* @__PURE__ */ new Date()).toISOString();
    rec.replyPreview = replyPreview.slice(0, 120);
    this.emitBroadcastUpdateThrottled(job);
  }
  recomputeBroadcastCounts(job) {
    let queued = 0;
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    let replied = 0;
    for (const r of job.recipients) {
      if (r.status === "queued") queued++;
      else if (r.status === "sent") sent++;
      else if (r.status === "delivered") delivered++;
      else if (r.status === "read") read++;
      else if (r.status === "failed") failed++;
      if (r.repliedAt) replied++;
    }
    job.counts = { queued, sent, delivered, read, failed, replied };
  }
  emitBroadcastUpdateThrottled(job, immediate = false) {
    const existing = this.broadcastEmitTimers.get(job.id);
    if (immediate) {
      if (existing) {
        clearTimeout(existing);
        this.broadcastEmitTimers.delete(job.id);
      }
      this.emit({ type: "broadcast:updated", payload: job });
      this.persistDeferred();
      return;
    }
    if (existing) return;
    const t = setTimeout(() => {
      this.broadcastEmitTimers.delete(job.id);
      this.emit({ type: "broadcast:updated", payload: job });
      this.persistDeferred();
    }, 90);
    this.broadcastEmitTimers.set(job.id, t);
    this.pendingTimers.add(t);
  }
  syncBroadcastRecipientStatus(messageId, status, error) {
    const link = this.broadcastMessageIndex.get(messageId);
    if (!link) return;
    const job = this.state.broadcasts.find((b) => b.id === link.broadcastId);
    if (!job) return;
    const rec = job.recipients.find((r) => r.contactId === link.contactId);
    if (!rec) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    rec.status = status;
    if (status === "sent" && !rec.sentAt) rec.sentAt = now;
    if (status === "delivered" && !rec.deliveredAt) rec.deliveredAt = now;
    if (status === "read" && !rec.readAt) rec.readAt = now;
    if (status === "failed") {
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
  listBroadcasts() {
    return this.state.broadcasts;
  }
  getBroadcast(id) {
    return this.state.broadcasts.find((b) => b.id === id) || null;
  }
  createBroadcast(request) {
    const phoneCfg = this.getPhoneConfig(request.phoneNumberId);
    const payloadType = request.type || (request.templateId || request.templateName ? "template" : request.interactive ? "interactive" : "text");
    let tpl;
    if (payloadType === "template") {
      tpl = this.state.templates.find(
        (t) => request.templateId && t.id === request.templateId || request.templateName && t.name === request.templateName
      );
      if (!tpl || tpl.status !== "APPROVED") {
        return {
          ok: false,
          httpStatus: 400,
          error: META_ERRORS.TEMPLATE_NOT_APPROVED(
            tpl ? `Template "${tpl.name}" is ${tpl.status} (must be APPROVED for broadcast).` : `Template "${request.templateName || request.templateId || "unknown"}" not found.`
          )
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
          title: "No matching recipients",
          message: "Recipient selector matched 0 client numbers. Seed clients or adjust selector."
        }
      };
    }
    const nowMs = Date.now();
    let scheduledMs = null;
    if (typeof request.delaySeconds === "number" && request.delaySeconds > 0) {
      scheduledMs = nowMs + request.delaySeconds * 1e3;
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
    const bodyPreview = payloadType === "template" && tpl ? renderTemplateBody(
      tpl.bodyText,
      request.templateVariables && request.templateVariables.length > 0 ? request.templateVariables : tpl.sampleValues
    ) : request.interactive?.bodyText || request.body || "[Broadcast message]";
    const recipientRecords = recipients.map((c) => ({
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      tags: c.tags || [],
      status: "queued"
    }));
    const job = {
      id: `bcast-${crypto2.randomUUID().slice(0, 8)}`,
      name: request.name?.trim() || (tpl ? `Broadcast \xB7 ${tpl.name}` : `Broadcast \xB7 ${request.selector.mode}`),
      phoneNumberId: phoneCfg.id,
      status: scheduledMs ? "scheduled" : "running",
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
        replied: 0
      },
      recipients: recipientRecords
    };
    this.state.broadcasts = [job, ...this.state.broadcasts].slice(0, 40);
    this.broadcastPayloads.set(job.id, request);
    this.persist();
    this.emit({ type: "broadcast:updated", payload: job });
    if (scheduledMs) {
      const waitMs = Math.max(50, scheduledMs - nowMs);
      this.scheduleTimer(() => {
        if (job.status === "scheduled") {
          this.executeBroadcastJob(job);
        }
      }, waitMs);
    } else {
      this.executeBroadcastJob(job);
    }
    return { ok: true, broadcast: job, httpStatus: scheduledMs ? 202 : 201 };
  }
  dispatchBroadcastNow(broadcastId) {
    const job = this.state.broadcasts.find((b) => b.id === broadcastId);
    if (!job) return { ok: false, error: "Broadcast job not found" };
    if (job.status !== "scheduled") {
      return { ok: true, broadcast: job };
    }
    this.executeBroadcastJob(job);
    return { ok: true, broadcast: job };
  }
  executeBroadcastJob(job) {
    const request = this.broadcastPayloads.get(job.id);
    if (!request) return;
    job.status = "running";
    job.startedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.emitBroadcastUpdateThrottled(job, true);
    const nextRoll = createBroadcastRollGenerator(this.state.failureInjection.seed);
    const intervalMs = Math.max(5, Math.floor(1e3 / job.throughputPerSec * job.concurrency));
    let cursor = 0;
    const processBatch = () => {
      if (job.status !== "running") return;
      const batchEnd = Math.min(cursor + job.concurrency, job.recipients.length);
      for (let i = cursor; i < batchEnd; i++) {
        const rec = job.recipients[i];
        const contact = this.state.contacts.find((c) => c.id === rec.contactId);
        if (!contact) {
          rec.status = "failed";
          rec.failedAt = (/* @__PURE__ */ new Date()).toISOString();
          rec.errorCode = 131030;
          rec.errorTitle = "Recipient missing";
          rec.errorDetails = "Contact was removed before broadcast send.";
          continue;
        }
        const overrideVars = request.perRecipientVariables?.[contact.phone] || request.perRecipientVariables?.[contact.id];
        const baseVars = job.templateVariables && job.templateVariables.length > 0 ? job.templateVariables : ["{{name}}"];
        const resolvedVars = resolveRecipientTemplateVariables(
          baseVars,
          contact,
          overrideVars
        );
        const resolvedBody = request.body ? request.body.replace(/\{\{name\}\}/gi, contact.name).replace(/\{\{1\}\}/gi, contact.name).replace(/\{\{first_name\}\}/gi, (contact.profileName || contact.name).split(/\s+/)[0] || contact.name) : void 0;
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
          metadata: { broadcastId: job.id, broadcastName: job.name }
        });
        rec.chatId = sendRes.chat?.id;
        rec.messageId = sendRes.message?.id;
        if (!sendRes.ok) {
          rec.status = "failed";
          rec.failedAt = (/* @__PURE__ */ new Date()).toISOString();
          rec.errorCode = sendRes.error?.code;
          rec.errorTitle = sendRes.error?.title;
          rec.errorDetails = sendRes.error?.errorData?.details || sendRes.error?.message;
        } else {
          rec.status = "sent";
          rec.sentAt = (/* @__PURE__ */ new Date()).toISOString();
        }
      }
      cursor = batchEnd;
      this.recomputeBroadcastCounts(job);
      this.emitBroadcastUpdateThrottled(job);
      if (cursor < job.recipients.length) {
        this.scheduleTimer(processBatch, intervalMs);
      } else {
        job.status = "completed";
        job.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.recomputeBroadcastCounts(job);
        this.emitBroadcastUpdateThrottled(job, true);
        this.emitTestingUpdate();
        const phoneCfg = this.getPhoneConfig(job.phoneNumberId);
        this.recordWebhook(
          "broadcast.completed",
          buildCloudWebhookEnvelope("broadcast_status", phoneCfg, {
            broadcast_id: job.id,
            name: job.name,
            total_recipients: job.totalRecipients,
            counts: job.counts,
            completed_at: job.completedAt
          }),
          phoneCfg.id
        );
      }
    };
    processBatch();
  }
  emitTestingUpdate() {
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    this.emit({
      type: "testing:updated",
      payload: {
        failureInjection: this.state.failureInjection,
        rateLimits: this.state.rateLimits,
        rateLimitUsage: this.state.rateLimitUsage
      }
    });
  }
  updateFailureInjection(patch) {
    const clampPct = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback;
    this.state.failureInjection = {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : this.state.failureInjection.enabled,
      invalidNumberPct: clampPct(
        patch.invalidNumberPct,
        this.state.failureInjection.invalidNumberPct
      ),
      optOutPct: clampPct(patch.optOutPct, this.state.failureInjection.optOutPct),
      outOfWindowPct: clampPct(patch.outOfWindowPct, this.state.failureInjection.outOfWindowPct),
      disabledPct: clampPct(patch.disabledPct, this.state.failureInjection.disabledPct),
      seed: typeof patch.seed === "number" ? patch.seed : this.state.failureInjection.seed
    };
    this.persist();
    this.emitTestingUpdate();
    return this.state.failureInjection;
  }
  updateRateLimits(patch) {
    const clampNum = (v, fallback) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
    this.state.rateLimits = {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : this.state.rateLimits.enabled,
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
      )
    };
    this.persist();
    this.emitTestingUpdate();
    return this.state.rateLimits;
  }
  resetRateLimitCounters() {
    this.rateLimiter.reset();
    this.state.rateLimitUsage = this.rateLimiter.getSnapshot();
    this.emitTestingUpdate();
    return this.state.rateLimitUsage;
  }
};

// server/routes.ts
import express from "express";
import path2 from "path";
var VALID_STATUSES = ["queued", "sent", "delivered", "read", "failed"];
function createApiRouter(engine, store, env) {
  const router = express.Router();
  const requireAuth = (req, res, next) => {
    if (!env.apiKey) {
      next();
      return;
    }
    if (req.headers["x-wa-sim-ui"] === "1") {
      next();
      return;
    }
    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const apiKeyHeader = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"].trim() : "";
    if (bearer === env.apiKey || apiKeyHeader === env.apiKey) {
      next();
      return;
    }
    res.status(401).json({
      error: {
        message: "Unauthorized. Provide Authorization: Bearer <EMULATOR_API_KEY> or X-API-Key header.",
        type: "OAuthException",
        code: 190
      }
    });
  };
  router.get("/api/health", (_req, res) => {
    const state = engine.getState();
    res.json({
      status: "ok",
      variant: state.settings.variant,
      activePhoneNumberId: state.settings.activePhoneNumberId,
      phoneNumbers: state.phoneNumbers.length,
      chats: state.chats.length,
      contacts: state.contacts.length,
      templates: state.templates.length,
      enforce24hWindow: state.settings.enforce24hWindow,
      enforceOptIn: state.settings.enforceOptIn,
      webhookConfigured: Boolean(state.settings.webhookUrl)
    });
  });
  router.get("/api/state", requireAuth, (_req, res) => {
    res.json(engine.getState());
  });
  router.post("/api/reset", requireAuth, (req, res) => {
    const variant = req.body?.variant === "business" || req.body?.variant === "personal" ? req.body.variant : void 0;
    const state = engine.reset(variant);
    res.json({ ok: true, state });
  });
  router.get("/config", (_req, res) => {
    res.json({
      port: env.port || 4020,
      mockServerUrl: "http://localhost:4010",
      sutBackendUrl: "http://localhost:3000",
      variant: env.variant || "business"
    });
  });
  router.get("/api/config", requireAuth, (_req, res) => {
    const { settings, self, phoneNumbers } = engine.getState();
    res.json({ settings, self, phoneNumbers });
  });
  router.patch("/api/config", requireAuth, (req, res) => {
    const result = engine.updateConfig(req.body || {});
    res.json(result);
  });
  router.get("/api/phone-numbers", requireAuth, (_req, res) => {
    res.json({
      activePhoneNumberId: engine.getState().settings.activePhoneNumberId,
      phoneNumbers: engine.getState().phoneNumbers
    });
  });
  router.post("/api/phone-numbers", requireAuth, (req, res) => {
    const { phoneNumber, displayName } = req.body || {};
    if (!phoneNumber || !displayName) {
      res.status(400).json({ error: "phoneNumber and displayName are required" });
      return;
    }
    const result = engine.upsertPhoneNumber(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ phoneNumber: result.phoneNumber });
  });
  router.get("/api/contacts", requireAuth, (_req, res) => {
    res.json({ contacts: engine.getState().contacts });
  });
  router.post("/api/contacts", requireAuth, (req, res) => {
    const { name, profileName, phone, about, isBot, isBusiness, avatarUrl, optInStatus, optInSource } = req.body || {};
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: "phone is required (E.164 format)" });
      return;
    }
    try {
      const created = engine.createContact({
        name: typeof name === "string" && name.trim() ? name : phone,
        profileName,
        phone,
        about,
        isBot,
        isBusiness,
        avatarUrl,
        optInStatus,
        optInSource
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid contact" });
    }
  });
  router.patch("/api/contacts/:id", requireAuth, (req, res) => {
    try {
      const updated = engine.updateContact(req.params.id, req.body || {});
      if (!updated) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
      res.json({ contact: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid contact patch" });
    }
  });
  router.post("/api/contacts/:id/block", requireAuth, (req, res) => {
    const blocked = req.body?.blocked !== false;
    const updated = engine.updateContact(req.params.id, { blocked });
    if (!updated) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json({ contact: updated });
  });
  router.get("/api/contacts/:id/opt-in", requireAuth, (req, res) => {
    const contact = engine.getState().contacts.find((c) => c.id === req.params.id);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json({
      contactId: contact.id,
      phone: contact.phone,
      optInStatus: contact.optInStatus,
      optInUpdatedAt: contact.optInUpdatedAt,
      optInSource: contact.optInSource,
      history: contact.optInHistory
    });
  });
  router.post("/api/contacts/:id/opt-in", requireAuth, (req, res) => {
    const status = req.body?.status;
    if (!["opted_in", "opted_out", "unknown"].includes(status)) {
      res.status(400).json({ error: "status must be opted_in, opted_out, or unknown" });
      return;
    }
    const updated = engine.setContactOptIn(
      req.params.id,
      status,
      typeof req.body?.source === "string" ? req.body.source : "api",
      typeof req.body?.keyword === "string" ? req.body.keyword : void 0,
      typeof req.body?.note === "string" ? req.body.note : void 0
    );
    if (!updated) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json({ contact: updated });
  });
  router.delete("/api/contacts/:id", requireAuth, (req, res) => {
    const deleted = engine.deleteContact(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.get("/api/chats", requireAuth, (req, res) => {
    const phoneFilter = typeof req.query.phoneNumberId === "string" ? req.query.phoneNumberId : "";
    const chats = engine.getState().chats.filter(
      (c) => phoneFilter ? c.phoneNumberId === phoneFilter : true
    );
    res.json({ chats });
  });
  router.get("/api/chats/:chatId/window", requireAuth, (req, res) => {
    const chat = engine.getState().chats.find((c) => c.id === req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({
      chatId: chat.id,
      lastInboundAt: chat.lastInboundAt,
      ...getCustomerServiceWindowStatus(chat.lastInboundAt)
    });
  });
  router.post("/api/chats", requireAuth, (req, res) => {
    const { type, name, description, participantIds, phone } = req.body || {};
    if (type === "group") {
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Group name is required" });
        return;
      }
      const chat = engine.createGroupChat({
        name,
        description,
        participantIds: Array.isArray(participantIds) ? participantIds : []
      });
      res.status(201).json({ chat });
      return;
    }
    if (!phone || typeof phone !== "string") {
      res.status(400).json({ error: "phone is required for direct chat" });
      return;
    }
    try {
      const created = engine.createContact({ name: name || phone, phone });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid phone" });
    }
  });
  router.patch("/api/chats/:id", requireAuth, (req, res) => {
    const updated = engine.updateChat(req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({ chat: updated });
  });
  router.post("/api/chats/:id/clear", requireAuth, (req, res) => {
    const chat = engine.clearChatMessages(req.params.id);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({ ok: true, chat });
  });
  router.delete("/api/chats/:id", requireAuth, (req, res) => {
    const deleted = engine.deleteChat(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.get("/api/chats/:chatId/messages", requireAuth, (req, res) => {
    const messages = engine.getState().messages[req.params.chatId];
    if (!messages) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({ messages });
  });
  router.post("/api/chats/:chatId/read", requireAuth, (req, res) => {
    const chat = engine.markChatRead(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({ ok: true, chat });
  });
  router.post("/api/chats/:chatId/typing", requireAuth, (req, res) => {
    const { isTyping, contactId, mode } = req.body || {};
    const state = engine.getState();
    const targetChat = state.chats.find((c) => c.id === req.params.chatId);
    if (!targetChat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    const resolvedContactId = isTyping === false ? null : typeof contactId === "string" && contactId ? contactId : targetChat.contactId || targetChat.participantIds[0] || null;
    const resolvedMode = resolvedContactId ? mode === "recording" ? "recording" : "typing" : null;
    const chat = engine.setTyping(req.params.chatId, resolvedContactId, resolvedMode);
    res.json({ ok: true, chat });
  });
  router.post("/api/messages/send", requireAuth, (req, res) => {
    const body = req.body || {};
    const resolvedTo = body.toPhone || body.to;
    if (!body.chatId && !resolvedTo) {
      res.status(400).json({ error: "chatId or toPhone is required" });
      return;
    }
    const result = engine.sendMessage({
      chatId: body.chatId,
      toPhone: resolvedTo,
      phoneNumberId: body.phoneNumberId,
      body: typeof body.body === "string" ? body.body : "",
      type: body.type,
      media: body.media,
      mediaId: body.mediaId,
      location: body.location,
      contacts: body.contacts,
      interactive: body.interactive,
      templateId: body.templateId,
      templateName: body.templateName,
      templateVariables: body.templateVariables,
      templateOtpCode: body.templateOtpCode,
      catalogItemId: body.catalogItemId,
      carouselItemIds: body.carouselItemIds,
      order: body.order,
      replyToMessageId: body.replyToMessageId,
      skipLifecycleTimers: Boolean(body.skipLifecycleTimers),
      simulateErrorCode: typeof body.simulateErrorCode === "number" ? body.simulateErrorCode : void 0,
      metadata: body.metadata
    });
    if (!result.ok) {
      res.status(result.httpStatus || 400).json({
        error: result.error,
        message: result.message
      });
      return;
    }
    res.status(201).json({ message: result.message, chat: result.chat });
  });
  router.post("/api/messages/receive", requireAuth, (req, res) => {
    const hubSig = typeof req.headers["x-hub-signature-256"] === "string" ? req.headers["x-hub-signature-256"] : void 0;
    if (hubSig && engine.getState().settings.webhookSecret) {
      const valid = verifyHubSignature256(
        JSON.stringify(req.body || {}),
        hubSig,
        engine.getState().settings.webhookSecret
      );
      if (!valid) {
        res.status(401).json({ error: "Invalid X-Hub-Signature-256 HMAC signature" });
        return;
      }
    }
    const b = req.body || {};
    const resolvedFrom = b.fromPhone || b.from;
    if (!b.chatId && !resolvedFrom && !b.senderId) {
      res.status(400).json({ error: "chatId, fromPhone, or senderId is required" });
      return;
    }
    const result = engine.receiveMessage({
      chatId: b.chatId,
      phoneNumberId: b.phoneNumberId,
      fromPhone: resolvedFrom,
      fromName: b.fromName,
      senderId: b.senderId,
      body: typeof b.body === "string" ? b.body : "",
      type: b.type,
      media: b.media,
      mediaId: b.mediaId,
      location: b.location,
      contacts: b.contacts,
      interactive: b.interactive,
      order: b.order,
      replyToMessageId: b.replyToMessageId,
      metadata: b.metadata
    });
    if (!result.ok) {
      res.status(403).json({ error: result.error });
      return;
    }
    res.status(201).json({
      message: result.message,
      chat: result.chat,
      optInChanged: result.optInChanged
    });
  });
  router.post("/api/messages/:messageId/receipt", requireAuth, (req, res) => {
    const status = req.body?.status;
    const errorCode = typeof req.body?.errorCode === "number" ? req.body.errorCode : void 0;
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }
    const updated = engine.updateMessageReceipt(req.params.messageId, status, errorCode);
    if (!updated) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json({ message: updated });
  });
  router.post("/:version(v\\d+\\.\\d+)/:phoneNumberId/messages", requireAuth, (req, res) => {
    const payload = req.body || {};
    if (payload.status === "read" && typeof payload.message_id === "string") {
      const updated = engine.updateMessageReceipt(payload.message_id, "read");
      if (!updated) {
        res.status(404).json({ error: { message: "Message not found", code: 100 } });
        return;
      }
      res.json({ success: true });
      return;
    }
    const normalized = normalizeCloudApiSendPayload(payload);
    if (!normalized) {
      res.status(400).json({
        error: {
          message: 'Invalid Cloud API payload. Provide "to" and supported message type (text, image, video, audio, document, sticker, location, contacts, interactive, template).',
          type: "OAuthException",
          code: 100
        }
      });
      return;
    }
    const result = engine.sendMessage({
      toPhone: normalized.toPhone,
      phoneNumberId: req.params.phoneNumberId,
      body: normalized.body,
      type: normalized.type,
      media: normalized.media,
      mediaId: normalized.mediaId,
      location: normalized.location,
      contacts: normalized.contacts,
      interactive: normalized.interactive,
      templateName: normalized.templateName,
      templateVariables: normalized.templateVariables,
      templateOtpCode: normalized.templateOtpCode,
      templateHeaderImageUrl: normalized.templateHeaderImageUrl,
      metadata: { cloudApiVersion: req.params.version, phoneNumberId: req.params.phoneNumberId }
    });
    if (!result.ok) {
      res.status(result.httpStatus || 400).json({
        error: {
          message: result.error?.message || "Message send rejected",
          type: "OAuthException",
          code: result.error?.code || 131026,
          error_data: result.error?.errorData
        }
      });
      return;
    }
    res.status(200).json({
      messaging_product: "whatsapp",
      contacts: [{ input: normalized.toPhone, wa_id: normalized.toPhone.replace(/[^\d]/g, "") }],
      messages: [{ id: result.message.id, message_status: result.message.status }]
    });
  });
  router.post("/:version(v\\d+\\.\\d+)/:phoneNumberId/media", requireAuth, (req, res) => {
    const { dataUrl, base64, mimeType, filename } = req.body || {};
    const uploaded = handleMediaSave(store, engine, { dataUrl, base64, mimeType, filename });
    if (!uploaded) {
      res.status(400).json({ error: { message: "Provide dataUrl or base64 payload", code: 100 } });
      return;
    }
    res.status(200).json({ id: uploaded.id });
  });
  router.get("/:version(v\\d+\\.\\d+)/:mediaId", requireAuth, (req, res) => {
    const rec = engine.getMediaRecord(req.params.mediaId);
    if (!rec) {
      res.status(404).json({ error: { message: "Media ID not found", code: 100 } });
      return;
    }
    res.json({
      messaging_product: "whatsapp",
      url: rec.url,
      mime_type: rec.mimeType,
      file_size: rec.sizeBytes,
      id: rec.id
    });
  });
  router.post("/api/media", requireAuth, (req, res) => {
    const uploaded = handleMediaSave(store, engine, req.body || {});
    if (!uploaded) {
      res.status(400).json({ error: "Provide dataUrl or base64 content" });
      return;
    }
    res.status(201).json(uploaded);
  });
  router.get("/api/media", requireAuth, (_req, res) => {
    res.json({ media: Object.values(engine.getState().mediaIndex) });
  });
  router.get("/api/media/:id", (req, res) => {
    const filePath = store.getMediaPath(req.params.id);
    if (!filePath) {
      res.status(404).json({ error: "Media not found" });
      return;
    }
    res.sendFile(filePath);
  });
  router.get("/api/templates", requireAuth, (_req, res) => {
    res.json({ templates: engine.getState().templates });
  });
  router.post("/api/templates", requireAuth, (req, res) => {
    const { name, bodyText, category } = req.body || {};
    if (!name || !bodyText || !category) {
      res.status(400).json({ error: "name, bodyText, and category (UTILITY|MARKETING|AUTHENTICATION) are required" });
      return;
    }
    const tpl = engine.upsertTemplate(req.body);
    res.status(201).json({ template: tpl });
  });
  router.patch("/api/templates/:id/status", requireAuth, (req, res) => {
    const status = req.body?.status;
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      res.status(400).json({ error: "status must be PENDING, APPROVED, or REJECTED" });
      return;
    }
    const updated = engine.setTemplateStatus(req.params.id, status, req.body?.rejectionReason);
    if (!updated) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ template: updated });
  });
  router.delete("/api/templates/:id", requireAuth, (req, res) => {
    const ok = engine.deleteTemplate(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.get("/api/conversations/pricing", requireAuth, (_req, res) => {
    res.json(engine.getConversationPricingSummary());
  });
  router.patch("/api/business/profile", requireAuth, (req, res) => {
    const profile = engine.updateBusinessProfile(req.body || {});
    res.json({ businessProfile: profile });
  });
  router.patch("/api/business/automation", requireAuth, (req, res) => {
    const automation = engine.updateBusinessAutomation(req.body || {});
    res.json({ businessAutomation: automation });
  });
  router.post("/api/business/catalog", requireAuth, (req, res) => {
    const { name, price } = req.body || {};
    if (!name || !price) {
      res.status(400).json({ error: "name and price are required" });
      return;
    }
    const item = engine.upsertCatalogItem(req.body);
    res.status(201).json({ item });
  });
  router.delete("/api/business/catalog/:id", requireAuth, (req, res) => {
    const ok = engine.deleteCatalogItem(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Catalog item not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.post("/api/business/quick-replies", requireAuth, (req, res) => {
    const { shortcut, message } = req.body || {};
    if (!shortcut || !message) {
      res.status(400).json({ error: "shortcut and message are required" });
      return;
    }
    const quickReply = engine.upsertQuickReply(req.body);
    res.status(201).json({ quickReply });
  });
  router.delete("/api/business/quick-replies/:id", requireAuth, (req, res) => {
    const ok = engine.deleteQuickReply(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Quick reply not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.post("/api/business/labels", requireAuth, (req, res) => {
    const { name, color } = req.body || {};
    if (!name || !color) {
      res.status(400).json({ error: "name and color are required" });
      return;
    }
    const label = engine.upsertLabel(req.body);
    res.status(201).json({ label });
  });
  router.delete("/api/business/labels/:id", requireAuth, (req, res) => {
    const ok = engine.deleteLabel(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Label not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.get("/api/auto-replies", requireAuth, (_req, res) => {
    res.json({ rules: engine.getState().autoReplyRules });
  });
  router.post("/api/auto-replies", requireAuth, (req, res) => {
    const { name, pattern, reply } = req.body || {};
    if (!name || !pattern || !reply) {
      res.status(400).json({ error: "name, pattern, and reply are required" });
      return;
    }
    const rule = engine.upsertAutoReplyRule(req.body);
    res.status(201).json({ rule });
  });
  router.delete("/api/auto-replies/:id", requireAuth, (req, res) => {
    const ok = engine.deleteAutoReplyRule(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Auto-reply rule not found" });
      return;
    }
    res.json({ ok: true });
  });
  router.get("/api/webhooks/logs", requireAuth, (req, res) => {
    const phoneFilter = typeof req.query.phoneNumberId === "string" ? req.query.phoneNumberId : "";
    const logs = engine.getState().webhookLogs.filter(
      (l) => phoneFilter ? l.phoneNumberId === phoneFilter : true
    );
    res.json({ logs });
  });
  router.delete("/api/webhooks/logs", requireAuth, (_req, res) => {
    engine.clearWebhookLogs();
    res.json({ ok: true });
  });
  router.get("/api/clients", requireAuth, (req, res) => {
    const segment = typeof req.query.segment === "string" ? req.query.segment : void 0;
    const optInStatus = req.query.optInStatus === "opted_in" || req.query.optInStatus === "opted_out" || req.query.optInStatus === "unknown" ? req.query.optInStatus : void 0;
    const personality = typeof req.query.personality === "string" ? req.query.personality : void 0;
    const country = typeof req.query.country === "string" ? req.query.country : void 0;
    const search = typeof req.query.search === "string" ? req.query.search : void 0;
    const clients = engine.listClients({ segment, optInStatus, personality, country, search });
    res.json({ total: clients.length, clients });
  });
  router.post("/api/clients/seed", requireAuth, (req, res) => {
    const body = req.body || {};
    const result = engine.bulkSeedClients({
      count: typeof body.count === "number" ? body.count : void 0,
      seed: typeof body.seed === "number" ? body.seed : void 0,
      clients: Array.isArray(body.clients) ? body.clients : void 0,
      segments: Array.isArray(body.segments) ? body.segments : void 0,
      countries: Array.isArray(body.countries) ? body.countries : void 0,
      invalidPct: typeof body.invalidPct === "number" ? body.invalidPct : void 0,
      optOutPct: typeof body.optOutPct === "number" ? body.optOutPct : void 0,
      disabledPct: typeof body.disabledPct === "number" ? body.disabledPct : void 0,
      clearPreviousSeeded: Boolean(body.clearPreviousSeeded)
    });
    res.status(201).json(result);
  });
  router.post("/api/clients/simulate-response", requireAuth, (req, res) => {
    const body = req.body || {};
    const validActions = ["reply", "button_click", "opt_out", "opt_in", "catalog_view", "silence"];
    if (!validActions.includes(body.action)) {
      res.status(400).json({ error: `action must be one of: ${validActions.join(", ")}` });
      return;
    }
    if ((!Array.isArray(body.phones) || body.phones.length === 0) && (!Array.isArray(body.contactIds) || body.contactIds.length === 0)) {
      res.status(400).json({ error: "Provide phones[] or contactIds[]" });
      return;
    }
    const result = engine.simulateClientResponse({
      phones: body.phones,
      contactIds: body.contactIds,
      action: body.action,
      text: typeof body.text === "string" ? body.text : void 0,
      buttonId: typeof body.buttonId === "string" ? body.buttonId : void 0,
      buttonTitle: typeof body.buttonTitle === "string" ? body.buttonTitle : void 0,
      delayMs: typeof body.delayMs === "number" ? body.delayMs : void 0
    });
    res.status(200).json(result);
  });
  router.get("/api/broadcasts", requireAuth, (_req, res) => {
    const broadcasts = engine.listBroadcasts();
    res.json({ total: broadcasts.length, broadcasts });
  });
  router.get("/api/broadcasts/:id", requireAuth, (req, res) => {
    const job = engine.getBroadcast(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Broadcast job not found" });
      return;
    }
    const statusFilter = typeof req.query.status === "string" ? req.query.status : "";
    const recipients = statusFilter ? job.recipients.filter((r) => r.status === statusFilter) : job.recipients;
    res.json({ broadcast: { ...job, recipients } });
  });
  const handleBroadcastCreate = (req, res, forceScheduled = false) => {
    const body = req.body || {};
    const selector = body.selector || {
      mode: Array.isArray(body.segments) && body.segments.length > 0 ? "segments" : Array.isArray(body.phones) && body.phones.length > 0 ? "phones" : Array.isArray(body.contactIds) && body.contactIds.length > 0 ? "contactIds" : "all",
      segments: body.segments,
      phones: body.phones,
      contactIds: body.contactIds
    };
    const delaySeconds = typeof body.delaySeconds === "number" ? body.delaySeconds : forceScheduled && !body.scheduledFor ? 5 : void 0;
    const result = engine.createBroadcast({
      name: typeof body.name === "string" ? body.name : void 0,
      phoneNumberId: typeof body.phoneNumberId === "string" ? body.phoneNumberId : void 0,
      selector,
      type: body.type,
      templateId: body.templateId,
      templateName: body.templateName,
      templateVariables: Array.isArray(body.templateVariables) ? body.templateVariables : void 0,
      perRecipientVariables: body.perRecipientVariables && typeof body.perRecipientVariables === "object" ? body.perRecipientVariables : void 0,
      body: typeof body.body === "string" ? body.body : void 0,
      interactive: body.interactive,
      throughputPerSec: typeof body.throughputPerSec === "number" ? body.throughputPerSec : void 0,
      concurrency: typeof body.concurrency === "number" ? body.concurrency : void 0,
      scheduledFor: typeof body.scheduledFor === "string" ? body.scheduledFor : void 0,
      delaySeconds
    });
    if (!result.ok) {
      res.status(result.httpStatus || 400).json({ error: result.error });
      return;
    }
    res.status(result.httpStatus || 201).json({ broadcast: result.broadcast });
  };
  router.post("/api/broadcasts", requireAuth, (req, res) => handleBroadcastCreate(req, res, false));
  router.post(
    "/api/broadcasts/schedule",
    requireAuth,
    (req, res) => handleBroadcastCreate(req, res, true)
  );
  router.post("/api/broadcasts/:id/dispatch", requireAuth, (req, res) => {
    const result = engine.dispatchBroadcastNow(req.params.id);
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ broadcast: result.broadcast });
  });
  router.get("/api/testing/failure-injection", requireAuth, (_req, res) => {
    res.json({ failureInjection: engine.getState().failureInjection });
  });
  router.patch("/api/testing/failure-injection", requireAuth, (req, res) => {
    const updated = engine.updateFailureInjection(req.body || {});
    res.json({ failureInjection: updated });
  });
  router.get("/api/testing/rate-limits", requireAuth, (_req, res) => {
    const state = engine.getState();
    res.json({ rateLimits: state.rateLimits, usage: state.rateLimitUsage });
  });
  router.patch("/api/testing/rate-limits", requireAuth, (req, res) => {
    const rateLimits = engine.updateRateLimits(req.body || {});
    res.json({ rateLimits, usage: engine.getState().rateLimitUsage });
  });
  router.post("/api/testing/rate-limits/reset", requireAuth, (_req, res) => {
    const usage = engine.resetRateLimitCounters();
    res.json({ ok: true, usage });
  });
  return router;
}
function handleMediaSave(store, engine, input) {
  let resolvedMime = typeof input.mimeType === "string" ? input.mimeType : "application/octet-stream";
  let rawBase64 = typeof input.base64 === "string" ? input.base64 : "";
  if (typeof input.dataUrl === "string" && input.dataUrl.startsWith("data:")) {
    const match = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      resolvedMime = match[1];
      rawBase64 = match[2];
    }
  }
  if (!rawBase64) return null;
  const buffer = Buffer.from(rawBase64, "base64");
  const extFromName = typeof input.filename === "string" ? path2.extname(input.filename).replace(".", "") : "";
  const extFromMime = resolvedMime.split("/")[1]?.split(";")[0] || "bin";
  const saved = store.saveMedia(buffer, extFromName || extFromMime);
  const record = engine.registerMedia({
    id: saved.id,
    url: `/api/media/${saved.id}`,
    mimeType: resolvedMime,
    filename: typeof input.filename === "string" && input.filename ? input.filename : saved.id,
    sizeBytes: buffer.length,
    uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return {
    ...record,
    mediaId: record.id
  };
}

// server/storage.ts
import crypto3 from "crypto";
import fs3 from "fs";
import path3 from "path";
var FileStateStore = class {
  constructor(dataFile, mediaDir) {
    this.memoryFallback = null;
    this.memoryMedia = /* @__PURE__ */ new Map();
    this.dataFile = dataFile;
    this.mediaDir = mediaDir;
  }
  ensureDirs() {
    try {
      fs3.mkdirSync(path3.dirname(this.dataFile), { recursive: true });
      fs3.mkdirSync(this.mediaDir, { recursive: true });
    } catch {
    }
  }
  load() {
    try {
      if (!fs3.existsSync(this.dataFile)) {
        return this.memoryFallback ? structuredClone(this.memoryFallback) : null;
      }
      const raw = fs3.readFileSync(this.dataFile, "utf-8");
      const parsed = JSON.parse(raw);
      this.memoryFallback = structuredClone(parsed);
      return parsed;
    } catch {
      return this.memoryFallback ? structuredClone(this.memoryFallback) : null;
    }
  }
  save(state) {
    this.memoryFallback = structuredClone(state);
    try {
      this.ensureDirs();
      const tmpFile = `${this.dataFile}.tmp`;
      const payload = JSON.stringify(state, null, 2);
      fs3.writeFileSync(tmpFile, payload, "utf-8");
      try {
        fs3.renameSync(tmpFile, this.dataFile);
      } catch (err) {
        fs3.copyFileSync(tmpFile, this.dataFile);
        try {
          fs3.unlinkSync(tmpFile);
        } catch {
        }
      }
    } catch {
      try {
        fs3.writeFileSync(this.dataFile, JSON.stringify(state, null, 2), "utf-8");
      } catch {
      }
    }
  }
  saveMedia(buffer, ext) {
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
    const id = `media_${crypto3.randomUUID().replace(/-/g, "").slice(0, 14)}.${safeExt}`;
    try {
      this.ensureDirs();
      const filePath = path3.join(this.mediaDir, id);
      fs3.writeFileSync(filePath, buffer);
      return { id, filePath };
    } catch {
      this.memoryMedia.set(id, buffer);
      return { id, filePath: id };
    }
  }
  getMediaPath(id) {
    const safeId = path3.basename(id);
    const full = path3.join(this.mediaDir, safeId);
    try {
      return fs3.existsSync(full) ? full : null;
    } catch {
      return null;
    }
  }
  getMediaBuffer(id) {
    if (this.memoryMedia.has(id)) {
      return this.memoryMedia.get(id);
    }
    const safeId = path3.basename(id);
    const full = path3.join(this.mediaDir, safeId);
    try {
      return fs3.existsSync(full) ? fs3.readFileSync(full) : null;
    } catch {
      return null;
    }
  }
};

// server/app.ts
var cachedApp = null;
var cachedEngine = null;
function getApp() {
  if (cachedApp && cachedEngine) return { app: cachedApp, engine: cachedEngine };
  const env = loadEnvConfig();
  const store = new FileStateStore(env.dataFile, env.mediaDir);
  const engine = new EmulatorEngine(store, env);
  const app = express2();
  app.use(express2.json({ limit: "15mb" }));
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-WA-SIM-UI");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });
  app.use((req, _res, next) => {
    const fwd = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"];
    if (fwd && (req.url === "/api" || req.url === "/")) {
      req.url = fwd;
    }
    if (!req.url.startsWith("/api/")) {
      if (req.url === "/state" || req.url.startsWith("/state?") || req.url === "/config" || req.url.startsWith("/config?") || req.url === "/reset" || req.url.startsWith("/reset?") || req.url === "/chats" || req.url.startsWith("/chats/") || req.url === "/messages" || req.url.startsWith("/messages/") || req.url === "/contacts" || req.url.startsWith("/contacts/") || req.url === "/phone-numbers" || req.url.startsWith("/phone-numbers/") || req.url === "/templates" || req.url.startsWith("/templates/")) {
        req.url = "/api" + req.url;
      }
    }
    next();
  });
  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ status: "ok", service: "vehicledesk-whatsapp-emulator", variant: env.variant });
  });
  app.use(createApiRouter(engine, store, env));
  app.use((err, _req, res, _next) => {
    console.error("[Express Global Error]:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err?.message || String(err),
      stack: err?.stack
    });
  });
  cachedApp = app;
  cachedEngine = engine;
  return { app, engine };
}

// api/index.ts
var appInstance = null;
var initError = null;
try {
  const { app } = getApp();
  appInstance = app;
} catch (err) {
  console.error("[Vercel Serverless Init Error]:", err);
  initError = {
    message: err?.message || String(err),
    stack: err?.stack
  };
}
function handler(req, res) {
  if (initError) {
    return res.status(500).json({
      error: "Vercel Lambda Initialization Failed",
      details: initError
    });
  }
  const originalUrl = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"];
  if (originalUrl && (req.url === "/api" || req.url === "/")) {
    req.url = originalUrl;
  }
  return appInstance(req, res);
}
export {
  handler as default
};
