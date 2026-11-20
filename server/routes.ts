import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import type { MessageStatus } from '../shared/types';
import type { EmulatorEnvConfig } from './config';
import { type EmulatorEngine, normalizeCloudApiSendPayload } from './engine';
import type { StateStore } from './storage';

const VALID_STATUSES: MessageStatus[] = ['queued', 'sent', 'delivered', 'read', 'failed'];

export function createApiRouter(
  engine: EmulatorEngine,
  store: StateStore,
  env: EmulatorEnvConfig
): express.Router {
  const router = express.Router();

  // Optional API Key auth for external test suites.
  // Browser UI sends X-WA-Sim-UI: 1 on same-origin requests so interactive testing never blocks.
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!env.apiKey) {
      next();
      return;
    }
    if (req.headers['x-wa-sim-ui'] === '1') {
      next();
      return;
    }
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const apiKeyHeader = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : '';

    if (bearer === env.apiKey || apiKeyHeader === env.apiKey) {
      next();
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Provide Authorization: Bearer <EMULATOR_API_KEY> or X-API-Key header.',
    });
  };

  router.get('/api/health', (_req, res) => {
    const state = engine.getState();
    res.json({
      status: 'ok',
      variant: state.settings.variant,
      chats: state.chats.length,
      contacts: state.contacts.length,
      webhookConfigured: Boolean(state.settings.webhookUrl),
    });
  });

  // Full state snapshot
  router.get('/api/state', requireAuth, (_req, res) => {
    res.json(engine.getState());
  });

  // Reset database to deterministic seed (useful in automated test beforeEach hooks)
  router.post('/api/reset', requireAuth, (req, res) => {
    const variant = req.body?.variant === 'business' || req.body?.variant === 'personal'
      ? req.body.variant
      : undefined;
    const state = engine.reset(variant);
    res.json({ ok: true, state });
  });

  // Config & Self Profile
  router.get('/api/config', requireAuth, (_req, res) => {
    const { settings, self } = engine.getState();
    res.json({ settings, self });
  });

  router.patch('/api/config', requireAuth, (req, res) => {
    const result = engine.updateConfig(req.body || {});
    res.json(result);
  });

  // Contacts
  router.get('/api/contacts', requireAuth, (_req, res) => {
    res.json({ contacts: engine.getState().contacts });
  });

  router.post('/api/contacts', requireAuth, (req, res) => {
    const { name, phone, about, isBot, isBusiness, avatarUrl } = req.body || {};
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      res.status(400).json({ error: 'phone is required' });
      return;
    }
    const created = engine.createContact({
      name: typeof name === 'string' && name.trim() ? name : phone,
      phone,
      about,
      isBot,
      isBusiness,
      avatarUrl,
    });
    res.status(201).json(created);
  });

  router.patch('/api/contacts/:id', requireAuth, (req, res) => {
    const updated = engine.updateContact(req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.json({ contact: updated });
  });

  router.delete('/api/contacts/:id', requireAuth, (req, res) => {
    const deleted = engine.deleteContact(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.json({ ok: true });
  });

  // Chats
  router.get('/api/chats', requireAuth, (_req, res) => {
    res.json({ chats: engine.getState().chats });
  });

  router.post('/api/chats', requireAuth, (req, res) => {
    const { type, name, description, participantIds, phone } = req.body || {};
    if (type === 'group') {
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Group name is required' });
        return;
      }
      const chat = engine.createGroupChat({
        name,
        description,
        participantIds: Array.isArray(participantIds) ? participantIds : [],
      });
      res.status(201).json({ chat });
      return;
    }

    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ error: 'phone is required for direct chat' });
      return;
    }
    const created = engine.createContact({ name: name || phone, phone });
    res.status(201).json(created);
  });

  router.patch('/api/chats/:id', requireAuth, (req, res) => {
    const updated = engine.updateChat(req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ chat: updated });
  });

  router.post('/api/chats/:id/clear', requireAuth, (req, res) => {
    const chat = engine.clearChatMessages(req.params.id);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ ok: true, chat });
  });

  router.delete('/api/chats/:id', requireAuth, (req, res) => {
    const deleted = engine.deleteChat(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/api/chats/:chatId/messages', requireAuth, (req, res) => {
    const messages = engine.getState().messages[req.params.chatId];
    if (!messages) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ messages });
  });

  // Mark chat read
  router.post('/api/chats/:chatId/read', requireAuth, (req, res) => {
    const chat = engine.markChatRead(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ ok: true, chat });
  });

  // Set typing / recording presence
  router.post('/api/chats/:chatId/typing', requireAuth, (req, res) => {
    const { isTyping, contactId, mode } = req.body || {};
    const state = engine.getState();
    const targetChat = state.chats.find((c) => c.id === req.params.chatId);
    if (!targetChat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    const resolvedContactId = isTyping === false
      ? null
      : (typeof contactId === 'string' && contactId ? contactId : (targetChat.contactId || targetChat.participantIds[0] || null));

    const resolvedMode = resolvedContactId
      ? (mode === 'recording' ? 'recording' : 'typing')
      : null;

    const chat = engine.setTyping(req.params.chatId, resolvedContactId, resolvedMode);
    res.json({ ok: true, chat });
  });

  // Send outbound message
  router.post('/api/messages/send', requireAuth, (req, res) => {
    const { chatId, toPhone, to, body, type, media, catalogItemId, replyToMessageId, skipLifecycleTimers, metadata } = req.body || {};
    const resolvedTo = toPhone || to;
    if (!chatId && !resolvedTo) {
      res.status(400).json({ error: 'chatId or toPhone is required' });
      return;
    }
    if (!body && !media && !catalogItemId) {
      res.status(400).json({ error: 'body, media, or catalogItemId is required' });
      return;
    }

    const result = engine.sendMessage({
      chatId,
      toPhone: resolvedTo,
      body: typeof body === 'string' ? body : '',
      type,
      media,
      catalogItemId,
      replyToMessageId,
      skipLifecycleTimers: Boolean(skipLifecycleTimers),
      metadata,
    });

    if (!result) {
      res.status(404).json({ error: 'Target chat not found' });
      return;
    }
    res.status(201).json(result);
  });

  // Inject inbound message from simulated contact / external test harness
  router.post('/api/messages/receive', requireAuth, (req, res) => {
    const { chatId, fromPhone, from, fromName, senderId, body, type, media, replyToMessageId, metadata } = req.body || {};
    const resolvedFrom = fromPhone || from;
    if (!chatId && !resolvedFrom && !senderId) {
      res.status(400).json({ error: 'chatId, fromPhone, or senderId is required' });
      return;
    }
    if (!body && !media) {
      res.status(400).json({ error: 'body or media is required' });
      return;
    }

    const result = engine.receiveMessage({
      chatId,
      fromPhone: resolvedFrom,
      fromName,
      senderId,
      body: typeof body === 'string' ? body : '',
      type,
      media,
      replyToMessageId,
      metadata,
    });

    if (!result) {
      res.status(404).json({ error: 'Could not resolve target chat or sender' });
      return;
    }
    res.status(201).json(result);
  });

  // Explicit message receipt override
  router.post('/api/messages/:messageId/receipt', requireAuth, (req, res) => {
    const status = req.body?.status as MessageStatus;
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }
    const updated = engine.updateMessageReceipt(req.params.messageId, status);
    if (!updated) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({ message: updated });
  });

  // WhatsApp Cloud API Drop-In Compatible Endpoint (v18.0 - v21.0)
  router.post('/:version(v\\d+\\.\\d+)/:phoneNumberId/messages', requireAuth, (req, res) => {
    const payload = req.body || {};

    // Cloud API mark-as-read format: { messaging_product: 'whatsapp', status: 'read', message_id: '...' }
    if (payload.status === 'read' && typeof payload.message_id === 'string') {
      const updated = engine.updateMessageReceipt(payload.message_id, 'read');
      if (!updated) {
        res.status(404).json({ error: { message: 'Message not found', code: 100 } });
        return;
      }
      res.json({ success: true });
      return;
    }

    const normalized = normalizeCloudApiSendPayload(payload);
    if (!normalized) {
      res.status(400).json({
        error: {
          message: 'Invalid Cloud API payload. Provide "to" and "text.body" (or image/document/audio/template).',
          type: 'OAuthException',
          code: 100,
        },
      });
      return;
    }

    const result = engine.sendMessage({
      toPhone: normalized.toPhone,
      body: normalized.body,
      type: normalized.type,
      media: normalized.media,
      metadata: { cloudApiVersion: req.params.version, phoneNumberId: req.params.phoneNumberId },
    });

    if (!result) {
      res.status(500).json({ error: { message: 'Failed to enqueue message' } });
      return;
    }

    res.status(200).json({
      messaging_product: 'whatsapp',
      contacts: [{ input: normalized.toPhone, wa_id: normalized.toPhone.replace(/[^\d]/g, '') }],
      messages: [{ id: result.message.id, message_status: result.message.status }],
    });
  });

  // Media upload (base64 data URL or raw base64 JSON) & retrieval
  router.post('/api/media', requireAuth, (req, res) => {
    const { dataUrl, base64, mimeType, filename } = req.body || {};
    let resolvedMime = typeof mimeType === 'string' ? mimeType : 'application/octet-stream';
    let rawBase64 = typeof base64 === 'string' ? base64 : '';

    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        resolvedMime = match[1];
        rawBase64 = match[2];
      }
    }

    if (!rawBase64) {
      res.status(400).json({ error: 'Provide dataUrl or base64 content' });
      return;
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    const extFromName = typeof filename === 'string' ? path.extname(filename).replace('.', '') : '';
    const extFromMime = resolvedMime.split('/')[1]?.split(';')[0] || 'bin';
    const saved = store.saveMedia(buffer, extFromName || extFromMime);

    res.status(201).json({
      id: saved.id,
      url: `/api/media/${saved.id}`,
      mimeType: resolvedMime,
      filename: filename || saved.id,
      sizeBytes: buffer.length,
    });
  });

  router.get('/api/media/:id', (req, res) => {
    const filePath = store.getMediaPath(req.params.id);
    if (!filePath) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    res.sendFile(filePath);
  });

  // Business endpoints
  router.patch('/api/business/profile', requireAuth, (req, res) => {
    const profile = engine.updateBusinessProfile(req.body || {});
    res.json({ businessProfile: profile });
  });

  router.patch('/api/business/automation', requireAuth, (req, res) => {
    const automation = engine.updateBusinessAutomation(req.body || {});
    res.json({ businessAutomation: automation });
  });

  router.post('/api/business/catalog', requireAuth, (req, res) => {
    const { name, price } = req.body || {};
    if (!name || !price) {
      res.status(400).json({ error: 'name and price are required' });
      return;
    }
    const item = engine.upsertCatalogItem(req.body);
    res.status(201).json({ item });
  });

  router.delete('/api/business/catalog/:id', requireAuth, (req, res) => {
    const ok = engine.deleteCatalogItem(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Catalog item not found' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/api/business/quick-replies', requireAuth, (req, res) => {
    const { shortcut, message } = req.body || {};
    if (!shortcut || !message) {
      res.status(400).json({ error: 'shortcut and message are required' });
      return;
    }
    const quickReply = engine.upsertQuickReply(req.body);
    res.status(201).json({ quickReply });
  });

  router.delete('/api/business/quick-replies/:id', requireAuth, (req, res) => {
    const ok = engine.deleteQuickReply(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Quick reply not found' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/api/business/labels', requireAuth, (req, res) => {
    const { name, color } = req.body || {};
    if (!name || !color) {
      res.status(400).json({ error: 'name and color are required' });
      return;
    }
    const label = engine.upsertLabel(req.body);
    res.status(201).json({ label });
  });

  router.delete('/api/business/labels/:id', requireAuth, (req, res) => {
    const ok = engine.deleteLabel(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }
    res.json({ ok: true });
  });

  // Auto-Reply Bot Rules
  router.get('/api/auto-replies', requireAuth, (_req, res) => {
    res.json({ rules: engine.getState().autoReplyRules });
  });

  router.post('/api/auto-replies', requireAuth, (req, res) => {
    const { name, pattern, reply } = req.body || {};
    if (!name || !pattern || !reply) {
      res.status(400).json({ error: 'name, pattern, and reply are required' });
      return;
    }
    const rule = engine.upsertAutoReplyRule(req.body);
    res.status(201).json({ rule });
  });

  router.delete('/api/auto-replies/:id', requireAuth, (req, res) => {
    const ok = engine.deleteAutoReplyRule(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Auto-reply rule not found' });
      return;
    }
    res.json({ ok: true });
  });

  // Webhook logs
  router.get('/api/webhooks/logs', requireAuth, (_req, res) => {
    res.json({ logs: engine.getState().webhookLogs });
  });

  router.delete('/api/webhooks/logs', requireAuth, (_req, res) => {
    engine.clearWebhookLogs();
    res.json({ ok: true });
  });

  return router;
}
