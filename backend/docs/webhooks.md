# Webhooks: Verification, Replay Protection, and Operations

## Events emitted by NGO-Connect

- `campaign.update.created`
- `notification.engagement`

Each payload is sent as JSON:

```json
{
  "id": "wh_xxx",
  "event": "campaign.update.created",
  "sentAt": "2026-02-19T12:34:56.000Z",
  "data": {}
}
```

## Security headers

- `X-NgoConnect-Event`
- `X-NgoConnect-Delivery-Id`
- `X-NgoConnect-Timestamp` (epoch milliseconds)
- `X-NgoConnect-Signature` (`sha256=<hmac>`)

Signature format:

1. Build string: `<timestamp>.<raw_request_body>`
2. HMAC SHA-256 with `WEBHOOK_SECRET`
3. Prefix with `sha256=`

## Receiver hardening checklist

1. Verify HMAC signature before parsing payload.
2. Reject stale timestamps (default 5-minute replay window).
3. Enforce idempotency with delivery-id de-duplication.
4. Return `2xx` only after successful processing.
5. Keep handlers idempotent; retries are expected.

## Local receiver example

Use the included example server:

```bash
cd backend
WEBHOOK_SECRET=<shared-secret> node scripts/webhookReceiverExample.js
```

Optional env:

- `WEBHOOK_RECEIVER_PORT` (default `9000`)
- `WEBHOOK_RECEIVER_PATH` (default `/webhooks/ngo-connect`)
- `WEBHOOK_MAX_AGE_SECONDS` (default `300`)

## Dead-letter queue and replay

Webhook attempts are stored in `webhook_deliveries_rel`.

- Failed attempts are marked `dead_letter`.
- Admin can replay a failed delivery:
  - `POST /api/admin/webhooks/:id/retry`
- Query delivery history:
  - `GET /api/admin/webhooks?status=dead_letter&limit=25`

Replay updates original record status:

- `replayed_success` or `replayed_failed`

and creates a new webhook attempt log tied by `parentDeliveryExternalId`.

## Phase 6: Automatic Replay Worker

NGO-Connect can run an interval worker that retries dead-letter records automatically.

Enable with:

- `WEBHOOK_AUTO_RETRY_ENABLED=true`
- `WEBHOOK_AUTO_RETRY_INTERVAL_MS=60000`
- `WEBHOOK_AUTO_RETRY_BATCH_SIZE=5`
- `WEBHOOK_AUTO_RETRY_ATTEMPTS=1`
- `WEBHOOK_AUTO_RETRY_BACKOFF_BASE_MS=60000`
- `WEBHOOK_AUTO_RETRY_BACKOFF_MAX_MS=1800000`

Behavior:

1. Select records in `dead_letter` / `replayed_failed` where `next_retry_at <= now()`.
2. Retry delivery.
3. On success: mark original as `replayed_success`.
4. On failure: mark `replayed_failed`, increase failure counter, schedule `next_retry_at` using exponential backoff.

Admin worker controls:

- `GET /api/admin/webhooks/worker/status`
- `POST /api/admin/webhooks/worker/run`

CLI one-shot tick:

```bash
cd backend
WEBHOOK_AUTO_RETRY_ENABLED=true npm run webhook:worker:tick
```

End-to-end auto-retry smoke test (`dead_letter -> replayed_success`):

```bash
cd backend
npm run smoke:webhook:worker
```

## Phase 6: Backlog Alerting (Email/Slack)

Enable alerting when dead-letter backlog exceeds threshold:

- `WEBHOOK_DEAD_LETTER_ALERT_ENABLED=true`
- `WEBHOOK_DEAD_LETTER_ALERT_THRESHOLD=5`
- `WEBHOOK_DEAD_LETTER_ALERT_COOLDOWN_MS=900000`
- `WEBHOOK_DEAD_LETTER_ALERT_SAMPLE_SIZE=5`
- `WEBHOOK_ALERT_EMAIL_TO=ops@example.com,platform@example.com`
- `WEBHOOK_ALERT_SLACK_URL=https://hooks.slack.com/services/...`

Alerting includes backlog count and sample records (event/reason/attempts).

## Phase 7: Metrics + Export APIs

Admin metrics endpoint:

- `GET /api/admin/webhooks/metrics?hours=24`

Returns:

- window summary (`total`, `successful`, `failed`, `skipped`, `successRate`, `avgAttempts`)
- event breakdown (top events by volume/success rate)
- hourly trend buckets

Admin export endpoint:

- `GET /api/admin/webhooks/export?format=csv&limit=1000`
- `GET /api/admin/webhooks/export?format=json&limit=1000`

Query filters:

- `status`
- `event`
- `from` (ISO timestamp)
- `to` (ISO timestamp)
- `limit` (max 5000)

## Phase 8: Retention / Cleanup

Admin cleanup endpoint:

- `POST /api/admin/webhooks/cleanup`

Body:

```json
{
  "dryRun": true,
  "olderThanDays": 30,
  "statuses": ["delivered", "skipped", "replayed_success"],
  "limit": 2000
}
```

CLI cleanup command:

```bash
cd backend
npm run webhook:cleanup
```

CLI env overrides:

- `WEBHOOK_CLEANUP_DAYS` (default `30`)
- `WEBHOOK_CLEANUP_LIMIT` (default `2000`)
- `WEBHOOK_CLEANUP_DRY_RUN` (default `true`)
- `WEBHOOK_CLEANUP_STATUSES` (CSV list)

## Phase 9: Worker Runtime Visibility

`GET /api/admin/webhooks/worker/status` now includes runtime state:

- `runtime.active`
- `runtime.startedAt`
- `runtime.lastTickAt`
- `runtime.lastResult`
- `runtime.lastError`
- `runtime.tickCount`
- `runtime.isRunning`
