import { useEffect, useRef, useState } from 'react';
import type {
  AutoReplyRule,
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CatalogItemRef,
  Chat,
  Contact,
  EmulatorState,
  EmulatorVariant,
  MediaAttachment,
  MessageStatus,
  MessageType,
  QuickReply,
  ServerWsEvent,
} from '../../shared/types';

const UI_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-WA-Sim-UI': '1',
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...UI_HEADERS,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const emulatorApi = {
  getState: () => apiRequest<EmulatorState>('/api/state'),

  reset: (variant?: EmulatorVariant) =>
    apiRequest<{ ok: boolean; state: EmulatorState }>('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ variant }),
    }),

  updateConfig: (patch: {
    variant?: EmulatorVariant;
    webhookUrl?: string;
    webhookSecret?: string;
    lifecycleDeliveredMs?: number;
    lifecycleReadMs?: number;
    autoMarkReadOnAutoReply?: boolean;
    self?: Partial<{ name: string; phone: string; about: string }>;
  }) =>
    apiRequest('/api/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  createContact: (input: {
    name: string;
    phone: string;
    about?: string;
    isBot?: boolean;
    isBusiness?: boolean;
  }) =>
    apiRequest<{ contact: Contact; chat: Chat }>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createGroup: (input: { name: string; description?: string; participantIds: string[] }) =>
    apiRequest<{ chat: Chat }>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'group', ...input }),
    }),

  updateChat: (
    chatId: string,
    patch: Partial<Pick<Chat, 'name' | 'description' | 'archived' | 'pinned' | 'muted' | 'labelIds' | 'participantIds' | 'unreadCount'>>
  ) =>
    apiRequest<{ chat: Chat }>(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  clearChat: (chatId: string) =>
    apiRequest<{ ok: boolean }>(`/api/chats/${chatId}/clear`, { method: 'POST' }),

  deleteChat: (chatId: string) =>
    apiRequest<{ ok: boolean }>(`/api/chats/${chatId}`, { method: 'DELETE' }),

  markChatRead: (chatId: string) =>
    apiRequest<{ ok: boolean; chat: Chat }>(`/api/chats/${chatId}/read`, { method: 'POST' }),

  setTyping: (chatId: string, isTyping: boolean, mode: 'typing' | 'recording' = 'typing', contactId?: string) =>
    apiRequest<{ ok: boolean }>(`/api/chats/${chatId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping, mode, contactId }),
    }),

  sendMessage: (payload: {
    chatId?: string;
    toPhone?: string;
    body: string;
    type?: MessageType;
    media?: MediaAttachment;
    catalogItemId?: string;
    replyToMessageId?: string;
  }) =>
    apiRequest('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  receiveMessage: (payload: {
    chatId?: string;
    fromPhone?: string;
    fromName?: string;
    senderId?: string;
    body: string;
    type?: MessageType;
    media?: MediaAttachment;
  }) =>
    apiRequest('/api/messages/receive', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateReceipt: (messageId: string, status: MessageStatus) =>
    apiRequest(`/api/messages/${messageId}/receipt`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  uploadMedia: (payload: { dataUrl: string; filename?: string; mimeType?: string }) =>
    apiRequest<MediaAttachment>('/api/media', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBusinessProfile: (patch: Partial<BusinessProfile>) =>
    apiRequest('/api/business/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  updateBusinessAutomation: (patch: Partial<BusinessAutomation>) =>
    apiRequest('/api/business/automation', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  upsertCatalogItem: (item: Partial<CatalogItemRef> & { name: string; price: string }) =>
    apiRequest('/api/business/catalog', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  deleteCatalogItem: (id: string) =>
    apiRequest(`/api/business/catalog/${id}`, { method: 'DELETE' }),

  upsertQuickReply: (qr: Partial<QuickReply> & { shortcut: string; message: string }) =>
    apiRequest('/api/business/quick-replies', {
      method: 'POST',
      body: JSON.stringify(qr),
    }),

  deleteQuickReply: (id: string) =>
    apiRequest(`/api/business/quick-replies/${id}`, { method: 'DELETE' }),

  upsertLabel: (lbl: Partial<BusinessLabel> & { name: string; color: string }) =>
    apiRequest('/api/business/labels', {
      method: 'POST',
      body: JSON.stringify(lbl),
    }),

  deleteLabel: (id: string) =>
    apiRequest(`/api/business/labels/${id}`, { method: 'DELETE' }),

  upsertAutoReplyRule: (rule: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }) =>
    apiRequest('/api/auto-replies', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  deleteAutoReplyRule: (id: string) =>
    apiRequest(`/api/auto-replies/${id}`, { method: 'DELETE' }),

  clearWebhookLogs: () =>
    apiRequest('/api/webhooks/logs', { method: 'DELETE' }),
};

export function applyWsEvent(prev: EmulatorState | null, event: ServerWsEvent): EmulatorState | null {
  if (event.type === 'state:sync') {
    return event.payload;
  }
  if (!prev) return prev;

  switch (event.type) {
    case 'message:created': {
      const { chatId, message, chat } = event.payload;
      const existingList = prev.messages[chatId] || [];
      // Idempotency guard against reconnect races
      const alreadyExists = existingList.some((m) => m.id === message.id);
      const nextList = alreadyExists ? existingList : [...existingList, message];

      const chatExists = prev.chats.some((c) => c.id === chat.id);
      const nextChats = chatExists
        ? prev.chats.map((c) => (c.id === chat.id ? chat : c))
        : [chat, ...prev.chats];

      return {
        ...prev,
        chats: nextChats,
        messages: {
          ...prev.messages,
          [chatId]: nextList,
        },
      };
    }
    case 'message:updated': {
      const { chatId, message } = event.payload;
      const list = prev.messages[chatId] || [];
      return {
        ...prev,
        messages: {
          ...prev.messages,
          [chatId]: list.map((m) => (m.id === message.id ? message : m)),
        },
      };
    }
    case 'chat:updated': {
      const chat = event.payload;
      const exists = prev.chats.some((c) => c.id === chat.id);
      return {
        ...prev,
        chats: exists
          ? prev.chats.map((c) => (c.id === chat.id ? chat : c))
          : [chat, ...prev.chats],
      };
    }
    case 'chat:deleted': {
      const { chatId } = event.payload;
      const nextMessages = { ...prev.messages };
      delete nextMessages[chatId];
      return {
        ...prev,
        chats: prev.chats.filter((c) => c.id !== chatId),
        messages: nextMessages,
      };
    }
    case 'contact:updated': {
      const contact = event.payload;
      const exists = prev.contacts.some((c) => c.id === contact.id);
      return {
        ...prev,
        contacts: exists
          ? prev.contacts.map((c) => (c.id === contact.id ? contact : c))
          : [...prev.contacts, contact],
      };
    }
    case 'contact:deleted': {
      return {
        ...prev,
        contacts: prev.contacts.filter((c) => c.id !== event.payload.contactId),
      };
    }
    case 'typing:updated': {
      const { chatId, contactId, mode } = event.payload;
      return {
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === chatId ? { ...c, typingContactId: contactId, typingMode: mode } : c
        ),
      };
    }
    case 'config:updated': {
      return {
        ...prev,
        settings: event.payload.settings,
        self: event.payload.self,
      };
    }
    case 'business:updated': {
      return {
        ...prev,
        catalog: event.payload.catalog,
        quickReplies: event.payload.quickReplies,
        labels: event.payload.labels,
        autoReplyRules: event.payload.autoReplyRules,
      };
    }
    case 'webhook:logged': {
      const exists = prev.webhookLogs.some((l) => l.id === event.payload.id);
      if (exists) return prev;
      return {
        ...prev,
        webhookLogs: [event.payload, ...prev.webhookLogs].slice(0, 60),
      };
    }
    default:
      return prev;
  }
}

export function useEmulatorState() {
  const [state, setState] = useState<EmulatorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    emulatorApi
      .getState()
      .then((initial) => {
        if (!cancelled) {
          setState(initial);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to connect to emulator backend');
          setLoading(false);
        }
      });

    let ws: WebSocket | null = null;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as ServerWsEvent;
          if (!cancelled) {
            setState((prev) => applyWsEvent(prev, parsed));
            setLoading(false);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setWsConnected(false);
          reconnectTimer.current = setTimeout(connect, 1800);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws?.close();
    };
  }, []);

  return { state, loading, error, wsConnected };
}
