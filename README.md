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

## Architecture: One Business Sender, Many Seeded Client Numbers

WA-Sim models how real WhatsApp Business Platform integrations run in production:
- **Exactly ONE WhatsApp Business sender account** (supporting multiple `phone_number_id`s under that business account via `.env`).
- **Many simulated personal client recipients** managed programmatically via REST, CLI, or JSON seed files—not logged-in UI users.
- Your external automation or software under test drives broadcasts, promotional offers, festival wishes, transactional updates, and interactive flows **out** to hundreds of client numbers at scale while WA-Sim faithfully simulates delivery/read receipt distributions, auto-responses (replies, button clicks, catalog views, `STOP` opt-outs), 24-hour customer service windows (`131047`), opt-out blocks (`131049`), invalid/disabled numbers (`131030`/`131026`), and rate limits (`130429`/`131056`).

## Configuration (`.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP + WebSocket + UI port | `3000` |
| `EMULATOR_VARIANT` | `business` (default single-sender console) or `personal` | `business` |
| `EMULATOR_API_KEY` | Bearer / `X-API-Key` token required on external API calls | `""` |
| `EMULATOR_WEBHOOK_URL` | Default target URL for signed Meta Cloud API webhooks | `""` |
| `EMULATOR_WEBHOOK_SECRET` | HMAC-SHA256 secret (`X-Hub-Signature-256` & `X-WA-Signature`) | `wa-sim-webhook-secret` |
| `EMULATOR_ENFORCE_24H_WINDOW` | Enforce 24h customer service window (error `131047`) | `true` |
| `EMULATOR_ENFORCE_OPT_IN` | Block business templates after opt-out (error `131049`) | `true` |
| `EMULATOR_PHONE_NUMBERS` | JSON array of additional sender `phone_number_id`s under this WABA | `""` |
| `EMULATOR_CLIENT_SEED_FILE` | Path to JSON seed file (e.g. `./data/clients-seed.example.json`) | `""` |
| `EMULATOR_CLIENT_SEED_COUNT` | Auto-generate N deterministic client numbers on boot/reset | `0` |
| `EMULATOR_BROADCAST_THROUGHPUT` | Default broadcast queue throughput (messages/sec) | `25` |
| `EMULATOR_BROADCAST_CONCURRENCY` | Default broadcast worker batch concurrency | `8` |
| `EMULATOR_RATE_LIMIT_PER_SEC` | Per-number msgs/sec limit (`130429` HTTP 429) | `80` |
| `EMULATOR_RATE_LIMIT_PER_MIN` | Per-number msgs/min limit (`130429` HTTP 429) | `1200` |
| `EMULATOR_PAIR_RATE_LIMIT_PER_MIN` | Per-recipient pair limit (`131056` HTTP 429) | `15` |
| `EMULATOR_DAILY_TEMPLATE_LIMIT` | Aggregate daily template limit (`130429` HTTP 429) | `1000` |

## Seeding Simulated Client Numbers (CLI, File, or REST)

```bash
# Seed 100 deterministic simulated clients via CLI
npx tsx scripts/seed-clients.ts --count 100 --segments chennai,premium --invalid-pct 7

# Seed from the bundled JSON file
npx tsx scripts/seed-clients.ts --file data/clients-seed.example.json

# Or via REST API
curl -X POST http://localhost:3000/api/clients/seed \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "count": 50, "seed": 202604, "segments": ["chennai", "premium"], "invalidPct": 7, "optOutPct": 6 }'
```

## Integration API & `curl` Examples

All external calls accept `Authorization: Bearer <EMULATOR_API_KEY>` or `X-API-Key: <EMULATOR_API_KEY>`.

### 1. Launch a Segmented Broadcast with Dynamic Per-Recipient Variables
Supports `{{name}}`, `{{first_name}}`, `{{phone}}`, `{{country}}`, and `{{segment}}` inside `templateVariables`, or explicit `perRecipientVariables` maps:
```bash
curl -X POST http://localhost:3000/api/broadcasts \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chennai Harvest Promo",
    "selector": { "mode": "segments", "segments": ["chennai"] },
    "type": "template",
    "templateName": "seasonal_roast_launch",
    "templateVariables": ["{{first_name}}", "FESTIVAL20"],
    "throughputPerSec": 40,
    "concurrency": 10
  }'

# Inspect per-recipient statuses (queued / sent / delivered / read / failed) & Meta error codes
curl http://localhost:3000/api/broadcasts/<BROADCAST_ID> \
  -H "X-API-Key: wa-sim-local-dev-token"
```

### 2. Schedule a Future Broadcast (Auto-Dispatch)
```bash
curl -X POST http://localhost:3000/api/broadcasts/schedule \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diwali Scheduled Wishes",
    "selector": { "mode": "all" },
    "type": "template",
    "templateName": "seasonal_roast_launch",
    "templateVariables": ["{{first_name}}", "FEST25"],
    "delaySeconds": 10
  }'
```

### 3. Configure Failure Injection & Rate-Limit Thresholds
```bash
# Inject 7% invalid-number failures (Meta #131030) and 5% opt-outs (#131049)
curl -X PATCH http://localhost:3000/api/testing/failure-injection \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true, "invalidNumberPct": 7, "optOutPct": 5, "seed": 42 }'

# Tighten rate limits to test HTTP 429 / Meta #130429 & #131056 retry logic
curl -X PATCH http://localhost:3000/api/testing/rate-limits \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true, "messagesPerSecond": 5, "dailyTemplateLimit": 10 }'
```

### 4. Simulate Client Responses (Keyword Reply, Button Click, Opt-Out, Silence)
```bash
curl -X POST http://localhost:3000/api/clients/simulate-response \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "phones": ["+919840100001", "+919840100002"],
    "action": "button_click",
    "buttonId": "confirm_delivery",
    "buttonTitle": "Confirm Delivery"
  }'
```

### 5. Send a Single Template or Interactive Message (Cloud API Drop-In)
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

### 6. Opt-In / Opt-Out, Media IDs, Pricing & Reset
```bash
# Customer texts STOP -> opts out -> subsequent business templates fail with Meta code 131049
curl -X POST http://localhost:3000/api/messages/receive \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "fromPhone": "+14155550142", "body": "STOP" }'

# Check 24h customer service window & conversation pricing summary
curl http://localhost:3000/api/chats/chat-elena/window -H "X-API-Key: wa-sim-local-dev-token"
curl http://localhost:3000/api/conversations/pricing -H "X-API-Key: wa-sim-local-dev-token"

# Reset deterministic seed state between test suites
curl -X POST http://localhost:3000/api/reset \
  -H "X-API-Key: wa-sim-local-dev-token" \
  -H "Content-Type: application/json" \
  -d '{ "variant": "business" }'
```
