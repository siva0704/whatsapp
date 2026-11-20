import type { LinkPreview, MessageError, OptInStatus } from '../shared/types';

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const META_ERRORS = {
  MESSAGE_UNDELIVERABLE: (details = 'Recipient cannot receive messages or has blocked this number.'): MessageError => ({
    code: 131026,
    title: 'Message undeliverable',
    message: '(#131026) Message undeliverable',
    errorData: { details },
  }),
  RE_ENGAGEMENT_REQUIRED: (
    details = 'More than 24 hours have passed since the customer last replied. Send an approved template message to re-engage.'
  ): MessageError => ({
    code: 131047,
    title: 'Re-engagement message',
    message: '(#131047) Re-engagement message required outside 24-hour customer service window',
    errorData: { details },
  }),
  RECIPIENT_OPTED_OUT: (
    details = 'Business-initiated message blocked: recipient has opted out of marketing/template messages.'
  ): MessageError => ({
    code: 131049,
    title: 'Recipient opted out',
    message: '(#131049) Message not delivered to maintain healthy ecosystem engagement (recipient opted out)',
    errorData: { details },
  }),
  TEMPLATE_NOT_APPROVED: (
    details = 'Template does not exist or has not been APPROVED.'
  ): MessageError => ({
    code: 132001,
    title: 'Template does not exist or not approved',
    message: '(#132001) Template name does not exist in translation or is not APPROVED',
    errorData: { details },
  }),
  CONTACT_BLOCKED: (
    details = 'Recipient number is blocked.'
  ): MessageError => ({
    code: 131026,
    title: 'Message undeliverable (blocked)',
    message: '(#131026) Recipient is blocked and cannot exchange messages',
    errorData: { details },
  }),
};

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}

export function normalizeE164(phone: string): string {
  const cleaned = phone.trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

// Internationalized word-boundary regexes (Unicode letters/digits)
const OPT_OUT_PATTERNS: Array<{ keyword: string; regex: RegExp }> = [
  { keyword: 'STOPALL', regex: /(?<![\p{L}\p{N}_])STOPALL(?![\p{L}\p{N}_])/iu },
  { keyword: 'UNSUBSCRIBE', regex: /(?<![\p{L}\p{N}_])UNSUBSCRIBE(?![\p{L}\p{N}_])/iu },
  { keyword: 'OPT-OUT', regex: /(?<![\p{L}\p{N}_])OPT-OUT(?![\p{L}\p{N}_])/iu },
  { keyword: 'STOP', regex: /(?<![\p{L}\p{N}_])STOP(?![\p{L}\p{N}_])/iu },
];

const OPT_IN_PATTERNS: Array<{ keyword: string; regex: RegExp }> = [
  { keyword: 'UNSTOP', regex: /(?<![\p{L}\p{N}_])UNSTOP(?![\p{L}\p{N}_])/iu },
  { keyword: 'SUBSCRIBE', regex: /(?<![\p{L}\p{N}_])SUBSCRIBE(?![\p{L}\p{N}_])/iu },
  { keyword: 'OPT-IN', regex: /(?<![\p{L}\p{N}_])OPT-IN(?![\p{L}\p{N}_])/iu },
  { keyword: 'START', regex: /(?<![\p{L}\p{N}_])START(?![\p{L}\p{N}_])/iu },
];

export function detectOptInKeyword(
  text: string
): { action: OptInStatus; keyword: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const item of OPT_OUT_PATTERNS) {
    if (item.regex.test(trimmed)) {
      return { action: 'opted_out', keyword: item.keyword };
    }
  }
  for (const item of OPT_IN_PATTERNS) {
    if (item.regex.test(trimmed)) {
      return { action: 'opted_in', keyword: item.keyword };
    }
  }
  return null;
}

export interface WindowStatus {
  open: boolean;
  remainingMs: number;
  expiresAt: string | null;
}

export function getCustomerServiceWindowStatus(
  lastInboundAt?: string | null,
  nowMs: number = Date.now()
): WindowStatus {
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
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

export function renderTemplateBody(bodyText: string, variables: string[]): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, indexStr) => {
    const idx = Number(indexStr) - 1;
    const val = variables[idx];
    return typeof val === 'string' && val.length > 0 ? val : match;
  });
}

export function extractLinkPreview(text: string): LinkPreview | undefined {
  const match = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
  if (!match) return undefined;
  try {
    const parsed = new URL(match[0]);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathSegment = parsed.pathname
      .split('/')
      .filter(Boolean)
      .slice(-1)[0];
    const cleanTitle = pathSegment
      ? pathSegment
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : host;
    return {
      url: parsed.toString(),
      domain: host,
      title: `${cleanTitle} — ${host}`,
      description: `Preview for ${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`,
    };
  } catch {
    return undefined;
  }
}
