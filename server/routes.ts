import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import type { MessageStatus, OptInStatus, TemplateApprovalStatus } from '../shared/types';
import { getCustomerServiceWindowStatus } from './compliance';
import type { EmulatorEnvConfig } from './config';
import { type EmulatorEngine, normalizeCloudApiSendPayload } from './engine';
import type { StateStore } from './storage';
import { verifyHubSignature256 } from './webhooks';

const VALID_STATUSES: MessageStatus[] = ['queued', 'sent', 'delivered', 'read', 'failed'];

export function createApiRouter(
  engine: EmulatorEngine,
  store: StateStore,
  env: EmulatorEnvConfig
): express.Router {
  const router = express.Router();

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
    const apiKeyHeader =
      typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : '';

    if (bearer === env.apiKey || apiKeyHeader === env.apiKey) {
      next();
      return;
    }

    res.status(401).json({
      error: {
        message: 'Unauthorized. Provide Authorization: Bearer <EMULATOR_API_KEY> or X-API-Key header.',
        type: 'OAuthException',
        code: 190,
      },
    });
  };

  router.get('/api/health', (_req, res) => {
    const state = engine.getState();
    res.json({
      status: 'ok',
      variant: state.settings.variant,
      activePhoneNumberId: state.settings.activePhoneNumberId,
      phoneNumbers: state.phoneNumbers.length,
      chats: state.chats.length,
      contacts: state.contacts.length,
      templates: state.templates.length,
      enforce24hWindow: state.settings.enforce24hWindow,
      enforceOptIn: state.settings.enforceOptIn,
      webhookConfigured: Boolean(state.settings.webhookUrl),
    });
  });

  // Full state snapshot
  router.get('/api/state', requireAuth, (_req, res) => {
    res.json(engine.getState());
  });

  // Reset database to deterministic seed
  router.post('/api/reset', requireAuth, (req, res) => {
    const variant =
      req.body?.variant === 'business' || req.body?.variant === 'personal'
        ? req.body.variant
        : undefined;
    const state = engine.reset(variant);
    res.json({ ok: true, state });
  });

  // SIT compatibility endpoint
  router.get('/config', (_req, res) => {
    res.json({
      port: env.port || 4020,
      mockServerUrl: 'http://localhost:4010',
      sutBackendUrl: 'http://localhost:3000',
      variant: env.variant || 'business',
    });
  });

  // Config & Self Profile
  router.get('/api/config', requireAuth, (_req, res) => {
    const { settings, self, phoneNumbers } = engine.getState();
    res.json({ settings, self, phoneNumbers });
  });

  router.patch('/api/config', requireAuth, (req, res) => {
    const result = engine.updateConfig(req.body || {});
    res.json(result);
  });

  // Phone Numbers / WABA Management
  router.get('/api/phone-numbers', requireAuth, (_req, res) => {
    res.json({
      activePhoneNumberId: engine.getState().settings.activePhoneNumberId,
      phoneNumbers: engine.getState().phoneNumbers,
    });
  });

  router.post('/api/phone-numbers', requireAuth, (req, res) => {
    const { phoneNumber, displayName } = req.body || {};
    if (!phoneNumber || !displayName) {
      res.status(400).json({ error: 'phoneNumber and displayName are required' });
      return;
    }
    const result = engine.upsertPhoneNumber(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ phoneNumber: result.phoneNumber });
  });

  // Contacts, Block/Unblock, Opt-In/Opt-Out Compliance
  router.get('/api/contacts', requireAuth, (_req, res) => {
    res.json({ contacts: engine.getState().contacts });
  });

  router.post('/api/contacts', requireAuth, (req, res) => {
    const { name, profileName, phone, about, isBot, isBusiness, avatarUrl, optInStatus, optInSource } =
      req.body || {};
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      res.status(400).json({ error: 'phone is required (E.164 format)' });
      return;
    }
    try {
      const created = engine.createContact({
        name: typeof name === 'string' && name.trim() ? name : phone,
        profileName,
        phone,
        about,
        isBot,
        isBusiness,
        avatarUrl,
        optInStatus,
        optInSource,
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid contact' });
    }
  });

  router.patch('/api/contacts/:id', requireAuth, (req, res) => {
    try {
      const updated = engine.updateContact(req.params.id, req.body || {});
      if (!updated) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }
      res.json({ contact: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid contact patch' });
    }
  });

  router.post('/api/contacts/:id/block', requireAuth, (req, res) => {
    const blocked = req.body?.blocked !== false;
    const updated = engine.updateContact(req.params.id, { blocked });
    if (!updated) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.json({ contact: updated });
  });

  router.get('/api/contacts/:id/opt-in', requireAuth, (req, res) => {
    const contact = engine.getState().contacts.find((c) => c.id === req.params.id);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.json({
      contactId: contact.id,
      phone: contact.phone,
      optInStatus: contact.optInStatus,
      optInUpdatedAt: contact.optInUpdatedAt,
      optInSource: contact.optInSource,
      history: contact.optInHistory,
    });
  });

  router.post('/api/contacts/:id/opt-in', requireAuth, (req, res) => {
    const status = req.body?.status as OptInStatus;
    if (!['opted_in', 'opted_out', 'unknown'].includes(status)) {
      res.status(400).json({ error: 'status must be opted_in, opted_out, or unknown' });
      return;
    }
    const updated = engine.setContactOptIn(
      req.params.id,
      status,
      typeof req.body?.source === 'string' ? req.body.source : 'api',
      typeof req.body?.keyword === 'string' ? req.body.keyword : undefined,
      typeof req.body?.note === 'string' ? req.body.note : undefined
    );
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

  // Chats + 24h Window Inspection
  router.get('/api/chats', requireAuth, (req, res) => {
    const phoneFilter = typeof req.query.phoneNumberId === 'string' ? req.query.phoneNumberId : '';
    const chats = engine.getState().chats.filter((c) =>
      phoneFilter ? c.phoneNumberId === phoneFilter : true
    );
    res.json({ chats });
  });

  router.get('/api/chats/:chatId/window', requireAuth, (req, res) => {
    const chat = engine.getState().chats.find((c) => c.id === req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({
      chatId: chat.id,
      lastInboundAt: chat.lastInboundAt,
      ...getCustomerServiceWindowStatus(chat.lastInboundAt),
    });
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
    try {
      const created = engine.createContact({ name: name || phone, phone });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid phone' });
    }
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
    const chat = engine.getState().chats.find((c) => c.id === req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    const messages = engine.getState().messages[req.params.chatId] || [];
    res.json({ messages });
  });

  router.post('/api/chats/:chatId/read', requireAuth, (req, res) => {
    const chat = engine.markChatRead(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    res.json({ ok: true, chat });
  });

  router.post('/api/chats/:chatId/typing', requireAuth, (req, res) => {
    const { isTyping, contactId, mode } = req.body || {};
    const state = engine.getState();
    const targetChat = state.chats.find((c) => c.id === req.params.chatId);
    if (!targetChat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    const resolvedContactId =
      isTyping === false
        ? null
        : typeof contactId === 'string' && contactId
          ? contactId
          : targetChat.contactId || targetChat.participantIds[0] || null;

    const resolvedMode = resolvedContactId
      ? mode === 'recording'
        ? 'recording'
        : 'typing'
      : null;

    const chat = engine.setTyping(req.params.chatId, resolvedContactId, resolvedMode);
    res.json({ ok: true, chat });
  });

  // Send outbound message (rich types, templates, catalog, carousels, error code injection)
  router.post('/api/messages/send', requireAuth, (req, res) => {
    const body = req.body || {};
    const resolvedTo = body.toPhone || body.to;
    if (!body.chatId && !resolvedTo) {
      res.status(400).json({ error: 'chatId or toPhone is required' });
      return;
    }

    const result = engine.sendMessage({
      chatId: body.chatId,
      toPhone: resolvedTo,
      phoneNumberId: body.phoneNumberId,
      body: typeof body.body === 'string' ? body.body : '',
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
      simulateErrorCode:
        typeof body.simulateErrorCode === 'number' ? body.simulateErrorCode : undefined,
      metadata: body.metadata,
    });

    if (!result.ok) {
      res.status(result.httpStatus || 400).json({
        error: result.error,
        message: result.message,
      });
      return;
    }
    res.status(201).json({ message: result.message, chat: result.chat });
  });

  // Inject inbound message (supports text, media, location, order, interactive replies, button clicks)
  router.post('/api/messages/receive', requireAuth, (req, res) => {
    // Optional X-Hub-Signature-256 verification when header is supplied by external webhook testers
    const hubSig =
      typeof req.headers['x-hub-signature-256'] === 'string'
        ? req.headers['x-hub-signature-256']
        : undefined;
    if (hubSig && engine.getState().settings.webhookSecret) {
      const valid = verifyHubSignature256(
        JSON.stringify(req.body || {}),
        hubSig,
        engine.getState().settings.webhookSecret
      );
      if (!valid) {
        res.status(401).json({ error: 'Invalid X-Hub-Signature-256 HMAC signature' });
        return;
      }
    }

    const b = req.body || {};
    const resolvedFrom = b.fromPhone || b.from;
    if (!b.chatId && !resolvedFrom && !b.senderId) {
      res.status(400).json({ error: 'chatId, fromPhone, or senderId is required' });
      return;
    }

    const result = engine.receiveMessage({
      chatId: b.chatId,
      phoneNumberId: b.phoneNumberId,
      fromPhone: resolvedFrom,
      fromName: b.fromName,
      senderId: b.senderId,
      body: typeof b.body === 'string' ? b.body : '',
      type: b.type,
      media: b.media,
      mediaId: b.mediaId,
      location: b.location,
      contacts: b.contacts,
      interactive: b.interactive,
      order: b.order,
      replyToMessageId: b.replyToMessageId,
      metadata: b.metadata,
    });

    if (!result.ok) {
      res.status(403).json({ error: result.error });
      return;
    }
    res.status(201).json({
      message: result.message,
      chat: result.chat,
      optInChanged: result.optInChanged,
    });
  });

  // Explicit message receipt override (with optional Meta error code)
  router.post('/api/messages/:messageId/receipt', requireAuth, (req, res) => {
    const status = req.body?.status as MessageStatus;
    const errorCode =
      typeof req.body?.errorCode === 'number' ? req.body.errorCode : undefined;
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }
    const updated = engine.updateMessageReceipt(req.params.messageId, status, errorCode);
    if (!updated) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({ message: updated });
  });

  // WhatsApp Cloud API Drop-In Compatible Endpoints (v18.0 - v22.0)
  router.get(
    ['/:version(v\\d+\\.\\d+)/:wabaId/message_templates', '/:wabaId(\\d+)/message_templates'],
    requireAuth,
    (_req, res) => {
      res.json({
        data: engine.getState().templates.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language,
          components: [
            { type: 'BODY', text: t.bodyText },
            ...(t.footerText ? [{ type: 'FOOTER', text: t.footerText }] : []),
          ],
        })),
      });
    }
  );

  router.get(
    ['/:version(v\\d+\\.\\d+)/:phoneNumberId(\\d+)', '/:phoneNumberId(\\d+)'],
    requireAuth,
    (req, res) => {
      res.json({
        verified_name: 'Wealth Transformers India Pvt Ltd',
        code_verification_status: 'VERIFIED',
        display_phone_number: '+91 98200 00001',
        quality_rating: 'GREEN',
        id: req.params.phoneNumberId,
      });
    }
  );

  router.post(
    ['/:version(v\\d+\\.\\d+)/:phoneNumberId/messages', '/:phoneNumberId(\\d+)/messages'],
    requireAuth,
    (req, res) => {
    const payload = req.body || {};

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
          message:
            'Invalid Cloud API payload. Provide "to" and supported message type (text, image, video, audio, document, sticker, location, contacts, interactive, template).',
          type: 'OAuthException',
          code: 100,
        },
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
      metadata: { cloudApiVersion: req.params.version, phoneNumberId: req.params.phoneNumberId },
    });

    if (!result.ok) {
      res.status(result.httpStatus || 400).json({
        error: {
          message: result.error?.message || 'Message send rejected',
          type: 'OAuthException',
          code: result.error?.code || 131026,
          error_data: result.error?.errorData,
        },
      });
      return;
    }

    res.status(200).json({
      messaging_product: 'whatsapp',
      contacts: [{ input: normalized.toPhone, wa_id: normalized.toPhone.replace(/[^\d]/g, '') }],
      messages: [{ id: result.message!.id, message_status: result.message!.status }],
    });
  });

  // Cloud API Media Upload & Lookup by Media ID
  router.post('/:version(v\\d+\\.\\d+)/:phoneNumberId/media', requireAuth, (req, res) => {
    const { dataUrl, base64, mimeType, filename } = req.body || {};
    const uploaded = handleMediaSave(store, engine, { dataUrl, base64, mimeType, filename });
    if (!uploaded) {
      res.status(400).json({ error: { message: 'Provide dataUrl or base64 payload', code: 100 } });
      return;
    }
    res.status(200).json({ id: uploaded.id });
  });

  router.get('/:version(v\\d+\\.\\d+)/:mediaId', requireAuth, (req, res) => {
    const rec = engine.getMediaRecord(req.params.mediaId);
    if (!rec) {
      res.status(404).json({ error: { message: 'Media ID not found', code: 100 } });
      return;
    }
    res.json({
      messaging_product: 'whatsapp',
      url: rec.url,
      mime_type: rec.mimeType,
      file_size: rec.sizeBytes,
      id: rec.id,
    });
  });

  // REST Media upload & download
  router.post('/api/media', requireAuth, (req, res) => {
    const uploaded = handleMediaSave(store, engine, req.body || {});
    if (!uploaded) {
      res.status(400).json({ error: 'Provide dataUrl or base64 content' });
      return;
    }
    res.status(201).json(uploaded);
  });

  router.get('/api/media', requireAuth, (_req, res) => {
    res.json({ media: Object.values(engine.getState().mediaIndex) });
  });

  router.get('/api/media/:id', (req, res) => {
    const filePath = store.getMediaPath(req.params.id);
    if (!filePath) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    res.sendFile(filePath);
  });

  // Templates CRUD + Approval Status Transitions
  router.get('/api/templates', requireAuth, (_req, res) => {
    res.json({ templates: engine.getState().templates });
  });

  router.post('/api/templates', requireAuth, (req, res) => {
    const { name, bodyText, category } = req.body || {};
    if (!name || !bodyText || !category) {
      res.status(400).json({ error: 'name, bodyText, and category (UTILITY|MARKETING|AUTHENTICATION) are required' });
      return;
    }
    const tpl = engine.upsertTemplate(req.body);
    res.status(201).json({ template: tpl });
  });

  router.patch('/api/templates/:id/status', requireAuth, (req, res) => {
    const status = req.body?.status as TemplateApprovalStatus;
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'status must be PENDING, APPROVED, or REJECTED' });
      return;
    }
    const updated = engine.setTemplateStatus(req.params.id, status, req.body?.rejectionReason);
    if (!updated) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template: updated });
  });

  router.delete('/api/templates/:id', requireAuth, (req, res) => {
    const ok = engine.deleteTemplate(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ ok: true });
  });

  // Conversational Categories & Pricing Simulation
  router.get('/api/conversations/pricing', requireAuth, (_req, res) => {
    res.json(engine.getConversationPricingSummary());
  });

  // Business Profile, Automation, Catalog, Quick Replies, Labels
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

  // Webhook Logs (with optional phoneNumberId filter)
  router.get('/api/webhooks/logs', requireAuth, (req, res) => {
    const phoneFilter = typeof req.query.phoneNumberId === 'string' ? req.query.phoneNumberId : '';
    const logs = engine.getState().webhookLogs.filter((l) =>
      phoneFilter ? l.phoneNumberId === phoneFilter : true
    );
    res.json({ logs });
  });

  router.delete('/api/webhooks/logs', requireAuth, (_req, res) => {
    engine.clearWebhookLogs();
    res.json({ ok: true });
  });

  return router;
}

function handleMediaSave(
  store: StateStore,
  engine: EmulatorEngine,
  input: { dataUrl?: unknown; base64?: unknown; mimeType?: unknown; filename?: unknown }
) {
  let resolvedMime =
    typeof input.mimeType === 'string' ? input.mimeType : 'application/octet-stream';
  let rawBase64 = typeof input.base64 === 'string' ? input.base64 : '';

  if (typeof input.dataUrl === 'string' && input.dataUrl.startsWith('data:')) {
    const match = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      resolvedMime = match[1];
      rawBase64 = match[2];
    }
  }
  if (!rawBase64) return null;

  const buffer = Buffer.from(rawBase64, 'base64');
  const extFromName =
    typeof input.filename === 'string' ? path.extname(input.filename).replace('.', '') : '';
  const extFromMime = resolvedMime.split('/')[1]?.split(';')[0] || 'bin';
  const saved = store.saveMedia(buffer, extFromName || extFromMime);
  const record = engine.registerMedia({
    id: saved.id,
    url: `/api/media/${saved.id}`,
    mimeType: resolvedMime,
    filename: typeof input.filename === 'string' && input.filename ? input.filename : saved.id,
    sizeBytes: buffer.length,
    uploadedAt: new Date().toISOString(),
  });
  return {
    ...record,
    mediaId: record.id,
  };
}
