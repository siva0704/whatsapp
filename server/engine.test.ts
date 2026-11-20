import test from 'node:test';
import assert from 'node:assert/strict';
import type { EmulatorEnvConfig } from './config';
import {
  EmulatorEngine,
  matchAutoReplyRule,
  normalizeCloudApiSendPayload,
} from './engine';
import { MemoryStateStore } from './storage';

function makeTestEnv(overrides?: Partial<EmulatorEnvConfig>): EmulatorEnvConfig {
  return {
    port: 3000,
    variant: 'personal',
    apiKey: 'test-token',
    webhookUrl: '',
    webhookSecret: 'secret',
    dataFile: './data/test.json',
    mediaDir: './data/media',
    selfName: 'QA Test Runner',
    selfPhone: '+14155550100',
    lifecycleDeliveredMs: 25,
    lifecycleReadMs: 60,
    preloadedContacts: [],
    autoReplyRules: [],
    ...overrides,
  };
}

test('outbound message transitions through queued -> sent -> delivered -> read', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv());
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
    chatId: 'chat-alex',
    body: 'Checking lifecycle transitions',
  });
  assert.ok(sent);
  assert.equal(sent.message.status, 'sent');

  await new Promise((r) => setTimeout(r, 220));
  engine.clearTimers();

  assert.equal(engine.findMessage(sent.message.id)?.status, 'read');
  assert.deepEqual(statuses.slice(0, 4), ['queued', 'sent', 'delivered', 'read']);
});

test('explicit receipt override updates message status immediately', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv());
  const sent = engine.sendMessage({
    chatId: 'chat-alex',
    body: 'Manual receipt check',
    skipLifecycleTimers: true,
  });
  assert.ok(sent);

  const failed = engine.updateMessageReceipt(sent.message.id, 'failed');
  assert.equal(failed?.status, 'failed');

  const delivered = engine.updateMessageReceipt(sent.message.id, 'delivered');
  assert.equal(delivered?.status, 'delivered');
});

test('inbound message increments unread count and markChatRead resets it', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv());
  const before = engine.getState().chats.find((c) => c.id === 'chat-alex')!.unreadCount;

  const received = engine.receiveMessage({
    fromPhone: '+14155550142',
    body: 'Inbound webhook verification payload',
  });
  assert.ok(received);
  assert.equal(received.chat.unreadCount, before + 1);
  assert.equal(received.message.direction, 'inbound');

  const readChat = engine.markChatRead(received.chat.id);
  assert.equal(readChat?.unreadCount, 0);
  assert.equal(engine.findMessage(received.message.id)?.status, 'read');
});

test('inbound message from unknown phone auto-creates contact and direct chat', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv());
  const res = engine.receiveMessage({
    fromPhone: '+12065550177',
    fromName: 'External Webhook Client',
    body: 'First inbound contact',
  });
  assert.ok(res);
  assert.equal(res.chat.name, 'External Webhook Client');
  assert.ok(engine.getState().contacts.some((c) => c.phone === '+12065550177'));
});

test('auto-reply rules match contains, exact, and regex patterns accurately', () => {
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
    {
      id: 'r2',
      name: 'Regex',
      enabled: true,
      matchType: 'regex' as const,
      pattern: '^order\\s+#\\d+$',
      reply: 'Found order',
      delayMs: 100,
      simulateTypingMs: 50,
    },
    {
      id: 'r3',
      name: 'Disabled',
      enabled: false,
      matchType: 'contains' as const,
      pattern: 'secret',
      reply: 'Nope',
      delayMs: 100,
      simulateTypingMs: 50,
    },
  ];

  assert.equal(matchAutoReplyRule(rules, 'ping')?.id, 'r1');
  assert.equal(matchAutoReplyRule(rules, 'order #4821')?.id, 'r2');
  assert.equal(matchAutoReplyRule(rules, 'secret word'), null);
});

test('Business variant triggers greeting message on inbound customer message without triggering bot loop', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const res = engine.receiveMessage({
    fromPhone: '+14155550188',
    body: 'Hello store!',
  });
  assert.ok(res);

  await new Promise((r) => setTimeout(r, 1500));
  engine.clearTimers();

  const msgs = engine.getState().messages[res.chat.id];
  const last = msgs[msgs.length - 1];
  assert.equal(last.direction, 'outbound');
  assert.equal(last.metadata?.businessAutomation, 'greeting');
  assert.equal(msgs.filter((m) => m.metadata?.autoReplyRuleId).length, 0);
});

test('group chat creation and catalog item messaging work end-to-end', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makeTestEnv({ variant: 'business' }));
  const group = engine.createGroupChat({
    name: 'Automation Triage',
    participantIds: ['contact-alex', 'contact-priya'],
  });
  assert.equal(group.type, 'group');
  assert.equal(group.participantIds.length, 2);

  const catalogMsg = engine.sendMessage({
    chatId: group.id,
    body: '',
    catalogItemId: 'cat-pour-over',
    skipLifecycleTimers: true,
  });
  assert.ok(catalogMsg);
  assert.equal(catalogMsg.message.type, 'catalog_item');
  assert.equal(catalogMsg.message.catalogItem?.sku, 'BRW-PO-900');
});

test('normalizeCloudApiSendPayload parses WhatsApp Cloud API text and media formats', () => {
  const textPayload = normalizeCloudApiSendPayload({
    messaging_product: 'whatsapp',
    to: '+14155550142',
    type: 'text',
    text: { body: 'Hello from Cloud SDK' },
  });
  assert.deepEqual(textPayload, {
    toPhone: '+14155550142',
    type: 'text',
    body: 'Hello from Cloud SDK',
  });

  const invalid = normalizeCloudApiSendPayload({ to: '+14155550142', type: 'text' });
  assert.equal(invalid, null);
});
