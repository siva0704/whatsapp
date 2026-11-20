import crypto from 'crypto';
import type { WebhookLogEntry } from '../shared/types';

export interface WebhookDispatchInput {
  event: string;
  targetUrl: string;
  secret: string;
  payload: Record<string, unknown>;
}

export function signWebhookPayload(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

export async function dispatchWebhook(input: WebhookDispatchInput): Promise<WebhookLogEntry> {
  const id = `wh_${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = new Date().toISOString();
  const startedAt = Date.now();

  if (!input.targetUrl) {
    return {
      id,
      event: input.event,
      targetUrl: '(not configured — logged locally)',
      timestamp,
      statusCode: null,
      ok: true,
      durationMs: 0,
      payload: input.payload,
    };
  }

  const body = JSON.stringify(input.payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-WA-Event': input.event,
    'X-WA-Delivery': id,
  };
  if (input.secret) {
    headers['X-WA-Signature'] = signWebhookPayload(body, input.secret);
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
      targetUrl: input.targetUrl,
      timestamp,
      statusCode: res.status,
      ok: res.ok,
      durationMs,
      error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
      payload: input.payload,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : 'Network error';
    return {
      id,
      event: input.event,
      targetUrl: input.targetUrl,
      timestamp,
      statusCode: null,
      ok: false,
      durationMs,
      error: message,
      payload: input.payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildCloudWebhookEnvelope(
  eventType: 'messages' | 'statuses' | 'typing',
  selfPhone: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'wa-sim-waba-001',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: selfPhone,
                phone_number_id: 'wa-sim-phone-001',
              },
              ...(eventType === 'messages' ? { messages: [data] } : {}),
              ...(eventType === 'statuses' ? { statuses: [data] } : {}),
              ...(eventType === 'typing' ? { typing: data } : {}),
            },
          },
        ],
      },
    ],
    emulator_event: eventType,
    data,
  };
}
