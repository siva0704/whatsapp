import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  resolveRecipientTemplateVariables,
} from './broadcast';
import { isValidE164 } from './compliance';
import type { EmulatorEnvConfig } from './config';
import { EmulatorEngine } from './engine';
import { generateSeededClients } from './seeder';
import { MemoryStateStore } from './storage';

function makePhase3Env(overrides?: Partial<EmulatorEnvConfig>): EmulatorEnvConfig {
  return {
    port: 3000,
    variant: 'business',
    apiKey: 'test-token',
    webhookUrl: '',
    webhookSecret: 'test-secret',
    dataFile: './data/test-p3.json',
    mediaDir: './data/media',
    selfName: 'WhatsApp Business',
    selfPhone: '',
    lifecycleDeliveredMs: 20,
    lifecycleReadMs: 45,
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

function createApprovedTestTemplate(engine: EmulatorEngine) {
  return engine.upsertTemplate({
    name: 'campaign_offer',
    category: 'MARKETING',
    status: 'APPROVED',
    bodyText: 'Hi {{1}}, enjoy your offer code {{2}}.',
    sampleValues: ['Customer', 'OFFER20'],
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

test('deterministic bulk seeding produces identical E.164 client cohorts for the same seed', () => {
  const first = generateSeededClients(
    {
      count: 25,
      seed: 1337,
      segments: ['alpha', 'premium', 'leads'],
      invalidPct: 8,
      optOutPct: 8,
    },
    new Set()
  );
  const second = generateSeededClients(
    {
      count: 25,
      seed: 1337,
      segments: ['alpha', 'premium', 'leads'],
      invalidPct: 8,
      optOutPct: 8,
    },
    new Set()
  );

  assert.equal(first.length, 25);
  assert.deepEqual(first, second);
  for (const client of first) {
    assert.equal(isValidE164(client.phone), true, `Expected valid E.164 phone: ${client.phone}`);
    assert.ok(client.name.length > 2);
    assert.ok((client.tags || []).length >= 1);
    assert.ok(client.country);
    assert.ok(client.timezone);
  }

  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    const res = engine.bulkSeedClients({
      count: 30,
      seed: 2026,
      segments: ['alpha', 'premium'],
      invalidPct: 10,
      optOutPct: 10,
    });
    assert.equal(res.seededCount, 30);
    const alphaClients = engine.listClients({ segment: 'alpha' });
    assert.ok(alphaClients.length > 0);
  } finally {
    engine.clearTimers();
  }
});

test('broadcast fan-out resolves dynamic {{first_name}} variables and completes async receipts', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    engine.upsertPhoneNumber({
      id: 'phone-test-1',
      phoneNumber: '+12025550190',
      displayName: 'Test Sender',
    });
    const tpl = createApprovedTestTemplate(engine);

    engine.bulkSeedClients({
      count: 12,
      seed: 101,
      segments: ['diwali-vip'],
      invalidPct: 0,
      optOutPct: 0,
    });

    const seededContacts = engine.listClients({ segment: 'diwali-vip' });
    assert.equal(seededContacts.length, 12);
    const sampleVars = resolveRecipientTemplateVariables(
      ['{{first_name}}', 'FESTIVAL20'],
      seededContacts[0]
    );
    assert.equal(sampleVars[0], seededContacts[0].name.split(' ')[0]);
    assert.equal(sampleVars[1], 'FESTIVAL20');

    const created = engine.createBroadcast({
      name: 'Festival Offer',
      type: 'template',
      templateId: tpl.id,
      templateVariables: ['{{first_name}}', 'FESTIVAL20'],
      selector: { mode: 'segments', segments: ['diwali-vip'] },
      throughputPerSec: 200,
      concurrency: 12,
    });

    assert.equal(created.ok, true);
    assert.ok(created.broadcast);
    assert.equal(created.broadcast.totalRecipients, 12);

    await wait(320);

    const updated = engine.getBroadcast(created.broadcast.id);
    assert.ok(updated);
    assert.equal(updated.status, 'completed');
    assert.equal(updated.counts.failed, 0);
    assert.equal(updated.counts.sent + updated.counts.delivered + updated.counts.read, 12);

    const firstRecipient = updated.recipients[0];
    const chatMsgs = engine.getState().messages[firstRecipient.chatId || ''] || [];
    const lastOut = [...chatMsgs].reverse().find((m) => m.direction === 'outbound');
    assert.ok(lastOut);
    assert.ok(
      lastOut.body.includes(firstRecipient.name.split(' ')[0]),
      `Expected interpolated first name in "${lastOut.body}"`
    );
  } finally {
    engine.clearTimers();
  }
});

test('rate limiter enforces per-second (#130429), daily template (#130429), and pair (#131056) limits', () => {
  const cfg = {
    ...DEFAULT_RATE_LIMITS,
    enabled: true,
    messagesPerSecond: 2,
    messagesPerMinute: 100,
    pairMessagesPerMinute: 2,
    dailyTemplateLimit: 3,
  };
  const limiter = new RateLimiter(1000);

  // 2 sends to +12025550111 at t=1000 succeed
  assert.equal(limiter.checkAndConsume(cfg, 'p1', '+12025550111', true, 1000).ok, true);
  assert.equal(limiter.checkAndConsume(cfg, 'p1', '+12025550111', true, 1000).ok, true);

  // 3rd send in same second fails with 130429 throughput
  const secBreach = limiter.checkAndConsume(cfg, 'p1', '+12025550222', true, 1000);
  assert.equal(secBreach.ok, false);
  if (!secBreach.ok) {
    assert.equal(secBreach.error.code, 130429);
    assert.equal(secBreach.httpStatus, 429);
  }

  // Next second (t=2100), sending a 3rd time to SAME recipient breaches pair limit (131056)
  const pairBreach = limiter.checkAndConsume(cfg, 'p1', '+12025550111', false, 2100);
  assert.equal(pairBreach.ok, false);
  if (!pairBreach.ok) {
    assert.equal(pairBreach.error.code, 131056);
    assert.equal(pairBreach.httpStatus, 429);
  }

  // Sending 3rd template to a DIFFERENT recipient succeeds, then 4th template breaches daily cap (130429)
  assert.equal(limiter.checkAndConsume(cfg, 'p1', '+12025550222', true, 2100).ok, true);
  const dailyBreach = limiter.checkAndConsume(cfg, 'p1', '+12025550333', true, 3200);
  assert.equal(dailyBreach.ok, false);
  if (!dailyBreach.ok) {
    assert.equal(dailyBreach.error.code, 130429);
    assert.equal(dailyBreach.httpStatus, 429);
  }
});

test('failure injection deterministically injects #131030 invalid-number failures in broadcast batches', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    const tpl = createApprovedTestTemplate(engine);
    engine.bulkSeedClients({
      count: 40,
      seed: 303,
      segments: ['qa-inject'],
      invalidPct: 0,
      optOutPct: 0,
    });

    engine.updateFailureInjection({
      enabled: true,
      invalidNumberPct: 25,
      optOutPct: 0,
      outOfWindowPct: 0,
      disabledPct: 0,
      seed: 42,
    });

    const created = engine.createBroadcast({
      name: 'Failure Injection Batch',
      type: 'template',
      templateId: tpl.id,
      templateVariables: ['{{first_name}}', 'TEST'],
      selector: { mode: 'segments', segments: ['qa-inject'] },
      throughputPerSec: 300,
      concurrency: 20,
    });

    assert.equal(created.ok, true);
    assert.ok(created.broadcast);
    await wait(260);

    const job = engine.getBroadcast(created.broadcast.id)!;
    assert.equal(job.status, 'completed');
    const invalidFailures = job.recipients.filter((r) => r.errorCode === 131030).length;
    assert.ok(
      invalidFailures >= 4 && invalidFailures <= 18,
      `Expected ~25% invalid failures, got ${invalidFailures}/40`
    );
  } finally {
    engine.clearTimers();
  }
});

test('seeded client personalities auto-respond (quick_opt_out flips opt-in via STOP, silent does not reply)', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    const tpl = createApprovedTestTemplate(engine);
    const res = engine.bulkSeedClients({
      clients: [
        {
          name: 'Opt Out Tester',
          phone: '+12025550901',
          country: 'US',
          tags: ['personality-test'],
          optInStatus: 'opted_in',
          personality: 'quick_opt_out',
          receiptTiming: {
            deliveredMinMs: 10,
            deliveredMaxMs: 15,
            readMinMs: 20,
            readMaxMs: 25,
            readProbability: 1,
          },
        },
        {
          name: 'Silent Tester',
          phone: '+12025550902',
          country: 'US',
          tags: ['personality-test'],
          optInStatus: 'opted_in',
          personality: 'silent',
          receiptTiming: {
            deliveredMinMs: 10,
            deliveredMaxMs: 15,
            readMinMs: 20,
            readMaxMs: 25,
            readProbability: 1,
          },
        },
      ],
    });

    assert.equal(res.seededCount, 2);
    const optOutContact = res.contacts[0];
    const silentContact = res.contacts[1];

    const created = engine.createBroadcast({
      name: 'Personality Response Check',
      type: 'template',
      templateId: tpl.id,
      templateVariables: ['{{first_name}}', 'HELLO'],
      selector: { mode: 'segments', segments: ['personality-test'] },
      throughputPerSec: 200,
      concurrency: 4,
    });
    assert.equal(created.ok, true);

    await wait(1150);

    const updatedOptOut = engine.getState().contacts.find((c) => c.id === optOutContact.id)!;
    assert.equal(updatedOptOut.optInStatus, 'opted_out');

    const silentChat = engine.getState().chats.find((c) => c.contactId === silentContact.id)!;
    const silentInbound = (engine.getState().messages[silentChat.id] || []).filter(
      (m) => m.direction === 'inbound'
    );
    assert.equal(silentInbound.length, 0);

    // Subsequent template to optOutContact must now fail with #131049
    const blocked = engine.sendMessage({
      toPhone: optOutContact.phone,
      type: 'template',
      templateId: tpl.id,
      templateVariables: ['Opt', 'AGAIN'],
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error?.code, 131049);
  } finally {
    engine.clearTimers();
  }
});

test('broadcast respects invalid (#131030), disabled (#131026), opted-out (#131049), and 24h window (#131047)', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    const tpl = createApprovedTestTemplate(engine);
    engine.bulkSeedClients({
      clients: [
        {
          name: 'Invalid User',
          phone: '+12025550911',
          tags: ['compliance-mix'],
          invalidNumber: true,
          optInStatus: 'opted_in',
          personality: 'silent',
        },
        {
          name: 'Disabled User',
          phone: '+12025550912',
          tags: ['compliance-mix'],
          disabled: true,
          optInStatus: 'opted_in',
          personality: 'silent',
        },
        {
          name: 'Opted Out User',
          phone: '+12025550913',
          tags: ['compliance-mix'],
          optInStatus: 'opted_out',
          personality: 'silent',
        },
        {
          name: 'Healthy User',
          phone: '+12025550914',
          tags: ['compliance-mix'],
          optInStatus: 'opted_in',
          personality: 'silent',
        },
      ],
    });

    const created = engine.createBroadcast({
      name: 'Compliance Check Broadcast',
      type: 'template',
      templateId: tpl.id,
      templateVariables: ['{{first_name}}', 'CHK'],
      selector: { mode: 'segments', segments: ['compliance-mix'] },
      throughputPerSec: 200,
      concurrency: 4,
    });

    assert.equal(created.ok, true);
    assert.ok(created.broadcast);
    await wait(220);

    const job = engine.getBroadcast(created.broadcast.id)!;
    assert.equal(job.status, 'completed');
    const byPhone = new Map(job.recipients.map((r) => [r.phone, r]));
    assert.equal(byPhone.get('+12025550911')?.errorCode, 131030);
    assert.equal(byPhone.get('+12025550912')?.errorCode, 131026);
    assert.equal(byPhone.get('+12025550913')?.errorCode, 131049);
    assert.notEqual(byPhone.get('+12025550914')?.status, 'failed');

    // Non-template text broadcast to Healthy User (no inbound yet => 24h window closed) fails with #131047
    const textJob = engine.createBroadcast({
      name: 'Free-form Out-of-Window Broadcast',
      type: 'text',
      body: 'Hey {{first_name}}, checking in!',
      selector: { mode: 'phones', phones: ['+12025550914'] },
      throughputPerSec: 200,
      concurrency: 1,
    });
    assert.equal(textJob.ok, true);
    assert.ok(textJob.broadcast);
    await wait(120);
    const doneText = engine.getBroadcast(textJob.broadcast.id)!;
    assert.equal(doneText.recipients[0].errorCode, 131047);
  } finally {
    engine.clearTimers();
  }
});

test('simulateClientResponse injects interactive button clicks, catalog views, and opt-out/opt-in keywords', () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    const seeded = engine.bulkSeedClients({
      clients: [
        {
          name: 'Interactive Client',
          phone: '+12025550921',
          tags: ['sim'],
          optInStatus: 'opted_in',
          personality: 'silent',
        },
      ],
    });
    const client = seeded.contacts[0];

    const btn = engine.simulateClientResponse({
      contactIds: [client.id],
      action: 'button_click',
      buttonId: 'btn_order',
      buttonTitle: 'Order Now',
    });
    assert.equal(btn.ok, true);
    assert.equal(btn.affected, 1);

    const chat = engine.getState().chats.find((c) => c.contactId === client.id)!;
    const msgs = engine.getState().messages[chat.id] || [];
    assert.equal(msgs[msgs.length - 1]?.type, 'interactive');

    const optOut = engine.simulateClientResponse({
      contactIds: [client.id],
      action: 'opt_out',
    });
    assert.equal(optOut.ok, true);
    assert.equal(engine.getState().contacts.find((c) => c.id === client.id)?.optInStatus, 'opted_out');

    const optIn = engine.simulateClientResponse({
      contactIds: [client.id],
      action: 'opt_in',
    });
    assert.equal(optIn.ok, true);
    assert.equal(engine.getState().contacts.find((c) => c.id === client.id)?.optInStatus, 'opted_in');
  } finally {
    engine.clearTimers();
  }
});

test('scheduled broadcast auto-dispatches after delaySeconds', async () => {
  const engine = new EmulatorEngine(new MemoryStateStore(), makePhase3Env());
  try {
    const tpl = createApprovedTestTemplate(engine);
    engine.bulkSeedClients({
      clients: [
        {
          name: 'Sched Client 1',
          phone: '+12025550931',
          tags: ['sched-test'],
          optInStatus: 'opted_in',
          personality: 'silent',
        },
        {
          name: 'Sched Client 2',
          phone: '+12025550932',
          tags: ['sched-test'],
          optInStatus: 'opted_in',
          personality: 'silent',
        },
      ],
    });

    const created = engine.createBroadcast({
      name: 'Delayed Campaign',
      type: 'template',
      templateId: tpl.id,
      templateVariables: ['{{first_name}}', 'AUTO'],
      selector: { mode: 'segments', segments: ['sched-test'] },
      throughputPerSec: 200,
      concurrency: 2,
      delaySeconds: 0.25,
    });

    assert.equal(created.ok, true);
    assert.equal(created.broadcast?.status, 'scheduled');

    await wait(480);

    const dispatched = engine.getBroadcast(created.broadcast!.id)!;
    assert.equal(dispatched.status, 'completed');
    assert.equal(dispatched.counts.failed, 0);
    assert.equal(
      dispatched.counts.sent + dispatched.counts.delivered + dispatched.counts.read,
      2
    );
  } finally {
    engine.clearTimers();
  }
});
