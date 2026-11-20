# WA-Sim — WhatsApp & Meta WhatsApp Business Platform Developer Emulator

Drop-in local emulator for **WhatsApp (Personal)** and the **Meta WhatsApp Business Platform**, built for QA teams, CI pipelines, and developers testing WhatsApp integrations without touching the real WhatsApp network or requiring Meta credentials.

## Quick Start (One Command)

```bash
cp .env.example .env
npm install
npm run dev
```

- Web & Mobile-Responsive UI + REST API: `http://localhost:3000`
- Real-Time WebSocket Stream: `ws://localhost:3000/ws`
- Production build & start: `npm run build && npm start`
- Engine unit test suite: `npm test`

## Configuration (`.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP + WebSocket + UI port | `3000` |
| `EMULATOR_VARIANT` | `personal` or `business` | `personal` |
| `EMULATOR_API_KEY` | Bearer / `X-API-Key` token required on external API calls | `""` |
| `EMULATOR_WEBHOOK_URL` | Default target URL for signed Meta Cloud API webhooks | `""` |
| `EMULATOR_WEBHOOK_SECRET` | HMAC-SHA256 secret (`X-Hub-Signature-256` & `X-WA-Signature`) | `wa-sim-webhook-secret` |
| `EMULATOR_ENFORCE_24H_WINDOW` | Enforce 24h customer service window (error `131047`) | `true` |
| `EMULATOR_ENFORCE_OPT_IN` | Block business templates after opt-out (error `131049`) | `true` |
| `EMULATOR_PRICING_RATES` | JSON map of per-category USD pricing rates | `MARKETING/UTILITY/AUTH/SERVICE` |
| `EMULATOR_PHONE_NUMBERS` | JSON array of additional WABA phone number IDs & webhook URLs | `""` |
| `EMULATOR_PRELOADED_CONTACTS` | JSON array of extra E.164 contacts seeded on boot/reset | `""` |
| `EMULATOR_AUTO_REPLY_RULES` | JSON array of auto-reply bot rules | `""` |

## Integration API & `curl` Examples

All external calls accept `Authorization: Bearer <EMULATOR_API_KEY>` or `X-API-Key: <EMULATOR_API_KEY>`.

### 1. Send an Approved Template Message (Cloud API Drop-In)
Works even when the 24-hour customer service window is closed (provided the contact is not opted out or blocked):
```bash
curl -X POST http://localhost:3000/v19.0/wa-sim-phone-001/messages \
  -H "Authorization: Bearer wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "+14155550164",
    "type": "template",
    "template": {
      "name": "order_shipment_update",
      "language": { "code": "en_US" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "Elena" },
            { "type": "text", "text": "#ORD-9012" },
            { "type": "text", "text": "Friday 14:00" }
          ]
        }
      ]
    }
  }'
```

### 2. Send an Interactive Message (Reply Buttons / List / CTA URL)
```bash
curl -X POST http://localhost:3000/v19.0/wa-sim-phone-001/messages \
  -H "Authorization: Bearer wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "+14155550142",
    "type": "interactive",
    "interactive": {
      "type": "button",
      "header": { "type": "text", "text": "Delivery Confirmation" },
      "body": { "text": "Would you like courier drop-off at the front desk?" },
      "footer": { "text": "Meridian Logistics" },
      "action": {
        "buttons": [
          { "type": "reply", "reply": { "id": "confirm_yes", "title": "Yes, drop off" } },
          { "type": "reply", "reply": { "id": "reschedule", "title": "Reschedule" } }
        ]
      }
    }
  }'
```

### 3. Opt-In / Opt-Out Lifecycle & Compliance API
Inbound keywords (`STOP`, `UNSUBSCRIBE`, `OPT-OUT`, `STOPALL` / `START`, `SUBSCRIBE`, `OPT-IN`, `UNSTOP` — case-insensitive, internationalized word boundaries) automatically update server-side compliance state and emit an `account_update` webhook:
```bash
# Customer texts STOP -> opts out -> subsequent business templates fail with Meta code 131049
curl -X POST http://localhost:3000/api/messages/receive \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "fromPhone": "+14155550142", "body": "STOP" }'

# Inspect opt-in status & history
curl http://localhost:3000/api/contacts/contact-alex/opt-in \
  -H "X-API-Key: wa-sim-local-dev-token"

# Explicitly update opt-in via API
curl -X POST http://localhost:3000/api/contacts/contact-alex/opt-in \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "status": "opted_in", "source": "web_checkout" }'
```

### 4. Inject Inbound Interactive Button Reply
```bash
curl -X POST http://localhost:3000/api/messages/receive \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "fromPhone": "+14155550142",
    "type": "interactive",
    "body": "Yes, drop off",
    "interactive": {
      "kind": "button_reply",
      "bodyText": "Yes, drop off",
      "selectedId": "confirm_yes",
      "selectedTitle": "Yes, drop off"
    }
  }'
```

### 5. Upload Media Once & Reference by Media ID
```bash
# Upload and receive media ID
MEDIA_ID=$(curl -sf -X POST http://localhost:3000/v19.0/wa-sim-phone-001/media \
  -H "Authorization: Bearer wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "filename": "receipt.txt", "mimeType": "text/plain", "base64": "SGVsbG8gV0EtU2lt" }' | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).id)")

# Send document referencing media ID
curl -X POST http://localhost:3000/v19.0/wa-sim-phone-001/messages \
  -H "Authorization: Bearer wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d "{\"messaging_product\":\"whatsapp\",\"to\":\"+14155550142\",\"type\":\"document\",\"document\":{\"id\":\"$MEDIA_ID\",\"filename\":\"receipt.txt\"}}"
```

### 6. Simulate Meta Error Codes & Inspect Pricing / 24h Window
```bash
# Inject failed outbound message with Meta error code 131026 (or 131047 / 131049)
curl -X POST http://localhost:3000/api/messages/send \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "chatId": "chat-alex", "body": "Undeliverable test", "simulateErrorCode": 131026 }'

# Check 24h customer service window state
curl http://localhost:3000/api/chats/chat-elena/window -H "X-API-Key: wa-sim-local-dev-token"

# Inspect conversation categories & simulated billing totals
curl http://localhost:3000/api/conversations/pricing -H "X-API-Key: wa-sim-local-dev-token"

# Reset deterministic seed state between test cases
curl -X POST http://localhost:3000/api/reset \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "variant": "business" }'
```
