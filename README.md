# WA-Sim — WhatsApp Developer Emulator

Drop-in local emulator for **WhatsApp (Personal)** and **WhatsApp Business**, built for QA teams, CI pipelines, and developers testing software that sends or receives WhatsApp messages—without touching the real WhatsApp network or needing Meta credentials.

## Quick Start (One Command)

1. Copy the environment template and configure your integration parameters:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies and start both the cloned WhatsApp Web UI and backend API/WebSocket engine:
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:3000` (WebSocket stream runs on `ws://localhost:3000/ws`).

For production / containerized CI runs:
```bash
npm run build
npm start
```

## Architecture

- **`server/`** — Separable Node/Express + WebSocket (`ws`) backend (`config.ts`, `engine.ts`, `storage.ts`, `webhooks.ts`, `routes.ts`, `ws.ts`).
- **`src/`** — Separable React + Tailwind WhatsApp Web UI (Personal & Business variants + QA Test Console).
- **`shared/`** — Shared TypeScript domain contracts.
- **`data/`** — Local JSON state persistence (`emulator-state.json`) and uploaded media files.

## Configuration (`.env`)

All test-suite integration parameters live in `.env` (see `.env.example` for full documentation):

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP + WebSocket + UI port | `3000` |
| `EMULATOR_VARIANT` | `personal` or `business` | `personal` |
| `EMULATOR_API_KEY` | Bearer / `X-API-Key` token required on external REST calls | `""` |
| `EMULATOR_WEBHOOK_URL` | Target HTTP endpoint in your system under test | `""` |
| `EMULATOR_WEBHOOK_SECRET` | HMAC-SHA256 secret for `X-WA-Signature` header | `wa-sim-webhook-secret` |
| `EMULATOR_LIFECYCLE_DELIVERED_MS` | Outbound `sent -> delivered` delay (ms) | `450` |
| `EMULATOR_LIFECYCLE_READ_MS` | Outbound `delivered -> read` delay (ms) | `1400` |
| `EMULATOR_PRELOADED_CONTACTS` | JSON array of extra contacts seeded on boot/reset | `""` |
| `EMULATOR_AUTO_REPLY_RULES` | JSON array of auto-reply bot rules | `""` |

## Pointing Your Test Suite at WA-Sim

### 1. Send an Outbound Message (WhatsApp Cloud API Drop-In)
Point your existing WhatsApp Cloud API client base URL to `http://localhost:3000`:
```bash
curl -X POST http://localhost:3000/v19.0/wa-sim-phone-001/messages \
  -H "Authorization: Bearer wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "+14155550142",
    "type": "text",
    "text": { "body": "status" }
  }'
```
Because `"status"` matches the default auto-reply rule, the emulator automatically transitions the outbound ticks (`queued -> sent -> delivered -> read`), emits a typing event, replies as the simulated contact, and POSTs signed Cloud-API-shaped webhooks to `EMULATOR_WEBHOOK_URL`.

### 2. Simulate an Inbound Message from a Customer
```bash
curl -X POST http://localhost:3000/api/messages/receive \
  -H "Authorization: Bearer wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "fromPhone": "+14155550188",
    "fromName": "Priya Patel",
    "body": "Where is my order #ORD-4821?"
  }'
```

### 3. Control Typing, Receipts, Read Status & Deterministic Resets
```bash
# Trigger typing indicator
curl -X POST http://localhost:3000/api/chats/chat-alex/typing \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "isTyping": true, "mode": "typing" }'

# Override message receipt status (queued | sent | delivered | read | failed)
curl -X POST http://localhost:3000/api/messages/<MESSAGE_ID>/receipt \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "status": "read" }'

# Reset emulator state between automated test cases
curl -X POST http://localhost:3000/api/reset \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "variant": "business" }'
```

## Running Engine Unit Tests
```bash
npm test
```
