import type {
  BroadcastSelector,
  Contact,
  FailureInjectionConfig,
  MessageError,
  RateLimitConfig,
  RateLimitSnapshot,
} from '../shared/types';
import { META_ERRORS, normalizeE164 } from './compliance';
import { createSeededRng } from './seeder';

export const DEFAULT_FAILURE_INJECTION: FailureInjectionConfig = {
  enabled: false,
  invalidNumberPct: 0,
  optOutPct: 0,
  outOfWindowPct: 0,
  disabledPct: 0,
};

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  enabled: true,
  messagesPerSecond: 80,
  messagesPerMinute: 1200,
  pairMessagesPerMinute: 15,
  dailyTemplateLimit: 1000,
};

/**
 * Resolves dynamic placeholders inside template variable inputs for each broadcast recipient.
 * Supports: {{name}}, {{first_name}}, {{phone}}, {{country}}, {{segment}}, {{timezone}}
 */
export function resolveRecipientTemplateVariables(
  baseVariables: string[],
  contact: Contact,
  perRecipientOverride?: string[]
): string[] {
  const source =
    perRecipientOverride && perRecipientOverride.length > 0 ? perRecipientOverride : baseVariables;
  const firstName = (contact.profileName || contact.name).split(/\s+/)[0] || contact.name;
  const primarySegment = contact.tags?.[0] || 'customer';

  return source.map((raw) =>
    raw
      .replace(/\{\{name\}\}/gi, contact.name)
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{phone\}\}/gi, contact.phone)
      .replace(/\{\{country\}\}/gi, contact.country || 'US')
      .replace(/\{\{segment\}\}/gi, primarySegment)
      .replace(/\{\{timezone\}\}/gi, contact.timezone || 'UTC')
  );
}

/**
 * Filters contacts matching a broadcast recipient selector (all, segments/tags, phones, contactIds).
 */
export function selectBroadcastRecipients(
  contacts: Contact[],
  selector: BroadcastSelector
): Contact[] {
  if (selector.mode === 'all') {
    return contacts.filter((c) => !c.isBot);
  }

  if (selector.mode === 'segments') {
    const wanted = new Set(
      (selector.segments || []).map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    if (wanted.size === 0) return [];
    return contacts.filter((c) =>
      (c.tags || []).some((t) => wanted.has(t.trim().toLowerCase()))
    );
  }

  if (selector.mode === 'phones') {
    const wanted = new Set(
      (selector.phones || []).map((p) => normalizeE164(p)).filter(Boolean)
    );
    return contacts.filter((c) => wanted.has(normalizeE164(c.phone)));
  }

  if (selector.mode === 'contactIds') {
    const wanted = new Set(selector.contactIds || []);
    return contacts.filter((c) => wanted.has(c.id));
  }

  return [];
}

/**
 * Evaluates failure-injection probabilities for a given send attempt.
 * Returns a Meta-shaped MessageError if a fault is injected, or null otherwise.
 */
export function evaluateFailureInjection(
  config: FailureInjectionConfig,
  rollPercent: number, // 0..100
  recipientPhone: string
): { error: MessageError; httpStatus: number } | null {
  if (!config.enabled) return null;

  let cursor = 0;
  if (config.invalidNumberPct > 0) {
    cursor += config.invalidNumberPct;
    if (rollPercent < cursor) {
      return {
        httpStatus: 400,
        error: META_ERRORS.INVALID_RECIPIENT(
          `Failure injection (${config.invalidNumberPct}%): ${recipientPhone} rejected as invalid WhatsApp number.`
        ),
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
        ),
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
        ),
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
        ),
      };
    }
  }

  return null;
}

/**
 * Sliding-window per-number throughput, per-pair (131056), and aggregate daily template (130429) rate limiter.
 */
export class RateLimiter {
  private readonly perNumberEvents = new Map<string, number[]>();
  private readonly perPairEvents = new Map<string, number[]>();
  private dailyTemplatesSent = 0;
  private dailyResetAtMs: number;
  private totalThrottled = 0;

  constructor(nowMs: number = Date.now()) {
    this.dailyResetAtMs = this.nextUtcMidnight(nowMs);
  }

  private nextUtcMidnight(nowMs: number): number {
    const d = new Date(nowMs);
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }

  private prune(arr: number[], cutoffMs: number): number[] {
    let i = 0;
    while (i < arr.length && arr[i] < cutoffMs) i++;
    return i > 0 ? arr.slice(i) : arr;
  }

  reset(nowMs: number = Date.now()): void {
    this.perNumberEvents.clear();
    this.perPairEvents.clear();
    this.dailyTemplatesSent = 0;
    this.totalThrottled = 0;
    this.dailyResetAtMs = this.nextUtcMidnight(nowMs);
  }

  checkAndConsume(
    config: RateLimitConfig,
    phoneNumberId: string,
    recipientPhone: string,
    isTemplate: boolean,
    nowMs: number = Date.now()
  ): { ok: true } | { ok: false; error: MessageError; httpStatus: number } {
    if (nowMs >= this.dailyResetAtMs) {
      this.dailyTemplatesSent = 0;
      this.dailyResetAtMs = this.nextUtcMidnight(nowMs);
    }

    if (!config.enabled) {
      return { ok: true };
    }

    // 1. Aggregate daily template limit -> Meta #130429 (HTTP 429)
    if (isTemplate && config.dailyTemplateLimit > 0 && this.dailyTemplatesSent >= config.dailyTemplateLimit) {
      this.totalThrottled += 1;
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.THROUGHPUT_RATE_LIMIT(
          `Aggregate daily template limit reached (${this.dailyTemplatesSent}/${config.dailyTemplateLimit}).`
        ),
      };
    }

    // 2. Per-number sliding 1s and 60s windows -> Meta #130429 (HTTP 429)
    const numEvents = this.prune(this.perNumberEvents.get(phoneNumberId) || [], nowMs - 60_000);
    const lastSecCount = numEvents.filter((ts) => ts >= nowMs - 1_000).length;

    if (config.messagesPerSecond > 0 && lastSecCount >= config.messagesPerSecond) {
      this.totalThrottled += 1;
      this.perNumberEvents.set(phoneNumberId, numEvents);
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.THROUGHPUT_RATE_LIMIT(
          `Per-second throughput limit reached for ${phoneNumberId} (${lastSecCount}/${config.messagesPerSecond} msg/s).`
        ),
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
        ),
      };
    }

    // 3. Per-pair (business number -> recipient) rate limit -> Meta #131056 (HTTP 429)
    const pairKey = `${phoneNumberId}::${normalizeE164(recipientPhone)}`;
    const pairEvents = this.prune(this.perPairEvents.get(pairKey) || [], nowMs - 60_000);
    if (config.pairMessagesPerMinute > 0 && pairEvents.length >= config.pairMessagesPerMinute) {
      this.totalThrottled += 1;
      this.perPairEvents.set(pairKey, pairEvents);
      return {
        ok: false,
        httpStatus: 429,
        error: META_ERRORS.PAIR_RATE_LIMIT(
          `Pair rate limit exceeded for ${phoneNumberId} -> ${recipientPhone} (${pairEvents.length}/${config.pairMessagesPerMinute} msg/min).`
        ),
      };
    }

    // Consume quota
    numEvents.push(nowMs);
    this.perNumberEvents.set(phoneNumberId, numEvents);
    pairEvents.push(nowMs);
    this.perPairEvents.set(pairKey, pairEvents);
    if (isTemplate) {
      this.dailyTemplatesSent += 1;
    }

    return { ok: true };
  }

  getSnapshot(nowMs: number = Date.now()): RateLimitSnapshot {
    const windowSecondCounts: Record<string, number> = {};
    const windowMinuteCounts: Record<string, number> = {};
    for (const [numId, events] of this.perNumberEvents.entries()) {
      const pruned = this.prune(events, nowMs - 60_000);
      this.perNumberEvents.set(numId, pruned);
      windowMinuteCounts[numId] = pruned.length;
      windowSecondCounts[numId] = pruned.filter((ts) => ts >= nowMs - 1_000).length;
    }
    return {
      windowSecondCounts,
      windowMinuteCounts,
      dailyTemplatesSent: this.dailyTemplatesSent,
      dailyResetAt: new Date(this.dailyResetAtMs).toISOString(),
      totalThrottled: this.totalThrottled,
    };
  }
}

export function createBroadcastRollGenerator(seed?: number): () => number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    const rng = createSeededRng(seed);
    return () => rng() * 100;
  }
  return () => Math.random() * 100;
}
