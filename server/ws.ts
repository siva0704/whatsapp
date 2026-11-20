import type http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerWsEvent } from '../shared/types';
import type { EmulatorEngine } from './engine';

export function attachWebSocketServer(httpServer: http.Server, engine: EmulatorEngine): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const broadcast = (event: ServerWsEvent) => {
    const encoded = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encoded);
      }
    }
  };

  engine.subscribe(broadcast);

  wss.on('connection', (socket) => {
    // Send full state snapshot on connect
    const syncEvent: ServerWsEvent = { type: 'state:sync', payload: engine.getState() };
    socket.send(JSON.stringify(syncEvent));

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; payload?: Record<string, unknown> };
        if (!msg.type || !msg.payload) return;

        if (msg.type === 'message:send') {
          const { chatId, toPhone, body, type, media, catalogItemId, replyToMessageId } = msg.payload;
          engine.sendMessage({
            chatId: typeof chatId === 'string' ? chatId : undefined,
            toPhone: typeof toPhone === 'string' ? toPhone : undefined,
            body: typeof body === 'string' ? body : '',
            type: typeof type === 'string' ? (type as never) : undefined,
            media: media as never,
            catalogItemId: typeof catalogItemId === 'string' ? catalogItemId : undefined,
            replyToMessageId: typeof replyToMessageId === 'string' ? replyToMessageId : undefined,
          });
        } else if (msg.type === 'chat:read' && typeof msg.payload.chatId === 'string') {
          engine.markChatRead(msg.payload.chatId);
        } else if (msg.type === 'typing:set' && typeof msg.payload.chatId === 'string') {
          const isTyping = msg.payload.isTyping !== false;
          const contactId = isTyping && typeof msg.payload.contactId === 'string' ? msg.payload.contactId : null;
          const mode = msg.payload.mode === 'recording' ? 'recording' : 'typing';
          engine.setTyping(msg.payload.chatId, contactId, contactId ? mode : null);
        }
      } catch {
        // Ignore malformed client WS frames
      }
    });
  });

  return wss;
}
