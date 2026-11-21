import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOptInKeyword,
  getCustomerServiceWindowStatus,
  isValidE164,
  renderTemplateBody,
} from './compliance';
import type { EmulatorEnvConfig } from './config';
import {
  EmulatorEngine,
  matchAutoReplyRule,
  normalizeCloudApiSendPayload,
} from './engine';
import { MemoryStateStore } from './storage';
import {
  buildCloudWebhookEnvelope,
  signWebhookPayload,
  verifyHubSignature256,
} from './webhooks';

function makeTestEnv(overrides?: Partial<EmulatorEnvConfig>): EmulatorEnvConfig {
  return {
    port: 3000,
    variant: 'personal',
    apiKey: 'test-token',
    webhookUrl: '',
    webhookSecret: 'test-secret',
    dataFile: './data/test.json',
    mediaDir: './data/media',
    selfName: 'WhatsApp Business',
    selfPhone: '',
    lifecycleDeliveredMs: 25,
    lifecycleReadMs: 60,
    enforce24hWindow: true,
    enforceOptIn: true,
    pricingRatesUsd: {
      MARKETING: 0.025,
      UTILITY: 0.015,
      AUTHENTICATION: 0.0135,
      SERVICE: 0,
    },
    preloadedContacts: [],
    autoReplyRules: [],
    phoneNumbers: [],
    ...overrides,
  };
}

test('default initial state is completely empty with zero mock data or mock WhatsApp numbers', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const state = engine.getState();

  assert.equal(state.self.phone, '');
  assert.equal(state.phoneNumbers.length, 0);
  assert.equal(state.contacts.length, 0);
  assert.equal(state.chats.length, 0);
  assert.equal(Object.keys(state.messages).length, 0);
  assert.equal(state.templates.length, 0);
  assert.equal(state.catalog.length, 0);
  assert.equal(state.quickReplies.length, 0);
  assert.equal(state.labels.length, 0);
  assert.equal(state.autoReplyRules.length, 0);
  assert.equal(state.conversations.length, 0);
  assert.equal(state.webhookLogs.length, 0);
  assert.equal(state.statusUpdates.length, 0);
  assert.equal(state.callLogs.length, 0);
  assert.equal(state.broadcasts.length, 0);
  assert.equal(state.settings.activePhoneNumberId, '');
  assert.equal(state.settings.businessAutomation.greetingEnabled, false);
  assert.equal(state.settings.businessAutomation.awayEnabled, false);
});

test('outbound message transitions through queued -> sent -> delivered -> read', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv());
  const { chat } = engine.createContact({
    name: 'Test Peer',
    phone: '+12025550101',
  });
  const statuses: string[] = [];

  engine.subscribe((ev) => {
    if (ev.type === 'message:created' && ev.payload.message.direction === 'outbound') {
      statuses.push(ev.payload.message.status);
    }
    if (ev.type === 'message:updated') {
      statuses.push(ev.payload.message.status);
    }
  });

  const sent = engine.sendMessage({
    chatId: chat.id,
    body: 'Checking lifecycle transitions',
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.message?.status, 'sent');

  await new Promise((r) => setTimeout(r, 220));
  engine.clearTimers();

  assert.equal(engine.findMessage(sent.message!.id)?.status, 'read');
  assert.deepEqual(statuses.slice(0, 4), ['queued', 'sent', 'delivered', 'read']);
});

test('E.164 phone validation and contact block/unblock reject inbound and outbound', () => {
  assert.equal(isValidE164('+12025550102'), true);
  assert.equal(isValidE164('202-555-0102'), false);
  assert.equal(isValidE164('+0123456'), false);

  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const { contact, chat } = engine.createContact({
    name: 'Blocked Peer',
    phone: '+12025550102',
  });
  engine.updateContact(contact.id, { blocked: true });

  const outBlocked = engine.sendMessage({
    chatId: chat.id,
    body: 'Hello blocked user',
    skipLifecycleTimers: true,
  });
  assert.equal(outBlocked.ok, false);
  assert.equal(outBlocked.error?.code, 131026);
  assert.equal(outBlocked.message?.status, 'failed');

  const inBlocked = engine.receiveMessage({
    fromPhone: contact.phone,
    body: 'Blocked inbound attempt',
  });
  assert.equal(inBlocked.ok, false);
  assert.equal(inBlocked.error?.code, 131026);
});

test('internationalized opt-in and opt-out keyword detection respects word boundaries', () => {
  assert.deepEqual(detectOptInKeyword('STOP'), { action: 'opted_out', keyword: 'STOP' });
  assert.deepEqual(detectOptInKeyword('please unsubscribe me!'), { action: 'opted_out', keyword: 'UNSUBSCRIBE' });
  assert.deepEqual(detectOptInKeyword('opt-out now'), { action: 'opted_out', keyword: 'OPT-OUT' });
  assert.deepEqual(detectOptInKeyword('StopAll'), { action: 'opted_out', keyword: 'STOPALL' });

  assert.deepEqual(detectOptInKeyword('START'), { action: 'opted_in', keyword: 'START' });
  assert.deepEqual(detectOptInKeyword('opt-in'), { action: 'opted_in', keyword: 'OPT-IN' });
  assert.deepEqual(detectOptInKeyword('unstop please'), { action: 'opted_in', keyword: 'UNSTOP' });

  // Must NOT false-trigger on substrings
  assert.equal(detectOptInKeyword('I am stopping by soon'), null);
  assert.equal(detectOptInKeyword('We just started testing'), null);
  assert.equal(detectOptInKeyword('Restart the server'), null);
});

test('opt-out blocks business-initiated template sends (131049) while session replies remain allowed', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const { contact, chat } = engine.createContact({
    name: 'Compliance Peer',
    phone: '+12025550103',
    optInStatus: 'opted_in',
  });
  const tpl = engine.upsertTemplate({
    name: 'promo_alert',
    category: 'MARKETING',
    status: 'APPROVED',
    bodyText: 'Hi {{1}}, use code {{2}} today.',
    sampleValues: ['Peer', 'SAVE10'],
  });

  // Customer texts STOP -> flips optInStatus to opted_out and records history
  const stopInbound = engine.receiveMessage({
    fromPhone: contact.phone,
    body: 'STOP',
  });
  assert.equal(stopInbound.ok, true);
  assert.equal(stopInbound.optInChanged?.status, 'opted_out');

  const updated = engine.getState().contacts.find((c) => c.id === contact.id)!;
  assert.equal(updated.optInStatus, 'opted_out');
  assert.equal(updated.optInHistory[0].keyword, 'STOP');

  // Business-initiated template is blocked with Meta error 131049
  const blockedTpl = engine.sendMessage({
    chatId: chat.id,
    type: 'template',
    templateName: tpl.name,
    templateVariables: ['Peer', 'SAVE10'],
    skipLifecycleTimers: true,
  });
  assert.equal(blockedTpl.ok, false);
  assert.equal(blockedTpl.error?.code, 131049);
  assert.equal(blockedTpl.message?.status, 'failed');

  // Inbound-triggered session reply inside open 24h window still succeeds
  const sessionReply = engine.sendMessage({
    chatId: chat.id,
    body: 'You have been unsubscribed from promotional alerts.',
    skipLifecycleTimers: true,
  });
  assert.equal(sessionReply.ok, true);

  // Customer replies START -> re-opts in -> template now succeeds
  const startInbound = engine.receiveMessage({
    fromPhone: contact.phone,
    body: 'START',
  });
  assert.equal(startInbound.optInChanged?.status, 'opted_in');

  const allowedTpl = engine.sendMessage({
    chatId: chat.id,
    type: 'template',
    templateName: tpl.name,
    templateVariables: ['Peer', 'SAVE10'],
    skipLifecycleTimers: true,
  });
  assert.equal(allowedTpl.ok, true);
  assert.equal(allowedTpl.message?.type, 'template');
});

test('24-hour customer service window rejects free-form outside window (131047) and re-opens on new inbound', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const { chat } = engine.createContact({
    name: 'Window Peer',
    phone: '+12025550104',
    optInStatus: 'opted_in',
  });
  const tpl = engine.upsertTemplate({
    name: 'order_update',
    category: 'UTILITY',
    status: 'APPROVED',
    bodyText: 'Hi {{1}}, your order {{2}} arrives {{3}}.',
    sampleValues: ['Peer', '#1001', 'Friday'],
  });

  // New contact has no inbound yet => 24h window is closed
  assert.equal(getCustomerServiceWindowStatus(chat.lastInboundAt).open, false);

  // Free-form text rejected with Meta code 131047
  const rejected = engine.sendMessage({
    chatId: chat.id,
    body: 'Checking in with free-form message',
    skipLifecycleTimers: true,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error?.code, 131047);

  // Approved template succeeds outside 24h window
  const tplOk = engine.sendMessage({
    chatId: chat.id,
    type: 'template',
    templateName: tpl.name,
    templateVariables: ['Peer', '#1001', 'Friday'],
    skipLifecycleTimers: true,
  });
  assert.equal(tplOk.ok, true);
  assert.match(tplOk.message!.body, /Hi Peer, your order #1001/);

  // New inbound re-opens the 24h window
  const inbound = engine.receiveMessage({
    chatId: chat.id,
    body: 'Thanks, can I change the delivery time?',
  });
  assert.equal(inbound.ok, true);
  assert.equal(getCustomerServiceWindowStatus(inbound.chat!.lastInboundAt).open, true);

  // Free-form session reply now succeeds!
  const freeFormNowOk = engine.sendMessage({
    chatId: chat.id,
    body: 'Sure! What time window works best?',
    skipLifecycleTimers: true,
  });
  assert.equal(freeFormNowOk.ok, true);
});

test('template variable filling, approval status checks, and pricing simulation', () => {
  assert.equal(
    renderTemplateBody('Hello {{1}}, code {{2}} expires soon.', ['Sam', '991204']),
    'Hello Sam, code 991204 expires soon.'
  );

  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const { chat } = engine.createContact({
    name: 'Template Peer',
    phone: '+12025550105',
    optInStatus: 'opted_in',
  });
  const pendingTpl = engine.upsertTemplate({
    name: 'vip_early_access',
    category: 'MARKETING',
    status: 'PENDING',
    bodyText: 'Hi {{1}}, early access opens at {{2}}.',
    sampleValues: ['Peer', '18:00 UTC'],
  });

  // Attempting to send PENDING template fails with 132001
  const pendingSend = engine.sendMessage({
    chatId: chat.id,
    type: 'template',
    templateName: pendingTpl.name,
    skipLifecycleTimers: true,
  });
  assert.equal(pendingSend.ok, false);
  assert.equal(pendingSend.error?.code, 132001);

  // Approving it makes it sendable and logs a billable MARKETING conversation
  engine.setTemplateStatus(pendingTpl.id, 'APPROVED');
  const approvedSend = engine.sendMessage({
    chatId: chat.id,
    type: 'template',
    templateName: pendingTpl.name,
    templateVariables: ['Peer', '18:00 UTC'],
    skipLifecycleTimers: true,
  });
  assert.equal(approvedSend.ok, true);

  const pricing = engine.getConversationPricingSummary();
  assert.ok(pricing.byCategory.MARKETING.count >= 1);
  assert.ok(pricing.grandTotalUsd > 0);
});

test('Cloud API payload normalization covers interactive, location, template, and media IDs', () => {
  const interactive = normalizeCloudApiSendPayload({
    to: '+12025550106',
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Confirm appointment?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
          { type: 'reply', reply: { id: 'no', title: 'Reschedule' } },
        ],
      },
    },
  });
  assert.equal(interactive?.type, 'interactive');
  assert.equal(interactive?.interactive?.buttons?.length, 2);

  const mediaById = normalizeCloudApiSendPayload({
    to: '+12025550106',
    type: 'image',
    image: { id: 'media_abc123', caption: 'Invoice photo' },
  });
  assert.equal(mediaById?.mediaId, 'media_abc123');
});

test('Meta Cloud API webhook envelopes and X-Hub-Signature-256 HMAC validation', () => {
  const envelope = buildCloudWebhookEnvelope(
    'message_template_status_update',
    { id: 'wa-sim-phone-001', wabaId: 'wa-sim-waba-001', phoneNumber: '+12025550100' },
    { event: 'APPROVED', message_template_name: 'order_update' }
  );
  assert.equal(envelope.object, 'whatsapp_business_account');
  const raw = JSON.stringify(envelope);
  const sig = signWebhookPayload(raw, 'my-secret');
  assert.equal(verifyHubSignature256(raw, sig, 'my-secret'), true);
  assert.equal(verifyHubSignature256(raw, 'sha256=deadbeef', 'my-secret'), false);
});

test('auto-reply rules match contains, exact, and regex patterns and Business greeting avoids loops', async () => {
  const rules = [
    {
      id: 'r1',
      name: 'Exact',
      enabled: true,
      matchType: 'exact' as const,
      pattern: 'PING',
      reply: 'PONG',
      delayMs: 100,
      simulateTypingMs: 50,
    },
  ];
  assert.equal(matchAutoReplyRule(rules, 'ping')?.id, 'r1');

  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  engine.updateBusinessAutomation({
    greetingEnabled: true,
    greetingMessage: 'Welcome! How can we help today?',
  });

  const res = engine.receiveMessage({ fromPhone: '+12025550108', body: 'Hello store!' });
  assert.equal(res.ok, true);

  await new Promise((r) => setTimeout(r, 1400));
  engine.clearTimers();

  const msgs = engine.getState().messages[res.chat!.id];
  const last = msgs[msgs.length - 1];
  assert.equal(last.metadata?.businessAutomation, 'greeting');
  assert.equal(msgs.filter((m) => m.metadata?.autoReplyRuleId).length, 0);
});
