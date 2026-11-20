import crypto from 'crypto';
import type { PhoneNumberConfig, WebhookLogEntry } from '../shared/types';

export interface WebhookDispatchInput {
  event: string;
  phoneNumberId?: string;
  targetUrl: string;
  secret: string;
  payload: Record<string, unknown>;
}

export function signWebhookPayload(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function verifyHubSignature256(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!secret) return true;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = signWebhookPayload(rawBody, secret);
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(signatureHeader, 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function dispatchWebhook(input: WebhookDispatchInput): Promise<WebhookLogEntry> {
  const id = `wh_${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = new Date().toISOString();
  const startedAt = Date.now();
  const body = JSON.stringify(input.payload);
  const signature = input.secret ? signWebhookPayload(body, input.secret) : undefined;

  if (!input.targetUrl) {
    return {
      id,
      event: input.event,
      phoneNumberId: input.phoneNumberId,
      targetUrl: '(not configured — logged locally)',
      timestamp,
      statusCode: null,
      ok: true,
      durationMs: 0,
      signatureHeader: signature,
      payload: input.payload,
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-WA-Event': input.event,
    'X-WA-Delivery': id,
  };
  if (signature) {
    headers['X-WA-Signature'] = signature;
    headers['X-Hub-Signature-256'] = signature;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(input.targetUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
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
      error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
      payload: input.payload,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : 'Network error';
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
      payload: input.payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildCloudWebhookEnvelope(
  field: 'messages' | 'statuses' | 'typing' | 'message_template_status_update' | 'account_update',
  phoneConfig: Pick<PhoneNumberConfig, 'id' | 'wabaId' | 'phoneNumber'>,
  data: Record<string, unknown>,
  extraContacts?: Array<{ profile: { name: string }; wa_id: string }>
): Record<string, unknown> {
  if (field === 'message_template_status_update' || field === 'account_update') {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: phoneConfig.wabaId,
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field,
              value: data,
            },
          ],
        },
      ],
      emulator_event: field,
      data,
    };
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: phoneConfig.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: phoneConfig.phoneNumber,
                phone_number_id: phoneConfig.id,
              },
              ...(extraContacts ? { contacts: extraContacts } : {}),
              ...(field === 'messages' ? { messages: [data] } : {}),
              ...(field === 'statuses' ? { statuses: [data] } : {}),
              ...(field === 'typing' ? { typing: data } : {}),
            },
          },
        ],
      },
    ],
    emulator_event: field,
    data,
  };
}
