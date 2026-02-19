# NGO Connect Backend

Backend API for NGO-Connect. Runtime is PostgreSQL-first and serves all client applications through Express routes under `/api/*`.

## Phase Progress (Current)

### Phase 3: Campaign Update Delivery + Engagement
- Added structured campaign updates and donor notifications.
- Added single-campaign analytics endpoint:
  - `GET /api/campaigns/:id/updates/analytics`
- Added engagement capture endpoint:
  - `POST /api/notifications/:id/open`

### Phase 4: Webhooks + NGO Aggregate Analytics
- Added outbound webhook dispatcher with signed payloads.
- Events emitted:
  - `campaign.update.created`
  - `notification.engagement`
- Added NGO aggregate analytics endpoint:
  - `GET /api/campaigns/ngo/campaign-updates/analytics`
- Added smoke test command:
  - `npm run smoke:webhook`

### Phase 5: Delivery Logs + Dead-Letter Replay
- Added persistent delivery table:
  - `webhook_deliveries_rel`
- Added admin webhook APIs:
  - `GET /api/admin/webhooks`
  - `POST /api/admin/webhooks/:id/retry`
- Failed deliveries are tracked as dead-letter records, replay outcomes are recorded.
- Added receiver hardening example:
  - `node scripts/webhookReceiverExample.js`
  - See `backend/docs/webhooks.md`

### Phase 6: Automatic Replay Worker + Alerts
- Added automatic dead-letter replay worker with exponential backoff scheduling.
- Added admin worker controls:
  - `GET /api/admin/webhooks/worker/status`
  - `POST /api/admin/webhooks/worker/run`
- Added dead-letter backlog alerting via SMTP email and/or Slack webhook.
- Added CLI worker run command:
  - `npm run webhook:worker:tick`
- Added end-to-end worker replay smoke test:
  - `npm run smoke:webhook:worker`

### Phase 7: Metrics + Export APIs
- Added webhook metrics endpoint:
  - `GET /api/admin/webhooks/metrics?hours=24`
- Added webhook export endpoint:
  - `GET /api/admin/webhooks/export?format=csv|json`
- Added webhook metrics views in admin dashboard.

### Phase 8: Retention Cleanup
- Added cleanup endpoint:
  - `POST /api/admin/webhooks/cleanup`
- Added CLI cleanup command:
  - `npm run webhook:cleanup`
- Added dashboard controls for cleanup dry-run and retention purge.

### Phase 9: Worker Runtime Status
- Worker status endpoint now returns runtime telemetry (`lastTickAt`, `lastResult`, `lastError`, `tickCount`, `isRunning`).
- Admin dashboard now surfaces runtime tick state.

### Phase 10: Innovation Features + Transparency
- Added `/api/innovation` route group for new ecosystem modules.
- Added trust endpoint:
  - `GET /api/ngos/:id/transparency`
- Implemented:
  - Giving circles
  - In-kind wishlists and pledges
  - Volunteer shift scheduling, reminders, logs, and CSV export
  - Donor CRM notes/segments/campaign messaging
  - Impact updates timeline
  - Corporate matching workflows
  - Emergency response feed/toggles
  - Volunteer endorsements
  - Gamification summary and leaderboard
- Recent innovation reliability updates:
  - wishlist item quantities now expose committed totals (pledged/approved/received) in addition to fulfilled totals
  - wishlist/giving-circle needs auto-switch to `completed` and reject over-contribution attempts
  - giving-circle contributions now carry payment metadata and are recorded only after frontend gateway-confirmed payment flow
- Added idempotent reward writes and core-flow gamification hooks for donations and volunteer approvals.

## Backend Architecture

### Stack
- Node.js + Express
- PostgreSQL (`pg`) via pooled connection
- JWT auth (`jsonwebtoken`)
- Password hashing (`bcryptjs`)
- Multer for document uploads
- Gemini API integration (`@google/generative-ai`)

### Module Layout

```
backend/
├── sql/
│   └── normalized_schema.sql
├── src/
│   ├── db/
│   │   ├── postgres.js        # pg pool + connect/query helpers
│   │   ├── modelFactory.js    # model abstraction mapped to *_rel tables
│   │   └── queryMatcher.js    # compatibility matcher used by model helpers
│   ├── middleware/
│   │   └── auth.js            # JWT + role authorization
│   ├── models/                # Users, NGOs, Campaigns, Donations, etc.
│   ├── routes/                # Domain route handlers
│   ├── services/
│   │   └── paymentGateway.js  # mock/razorpay abstraction
│   └── utils/
├── docs/
├── seed.js
└── package.json
```

### Route Groups
Mounted by `src/server.js`:
- `/api/auth`
- `/api/users`
- `/api/ngos`
- `/api/campaigns`
- `/api/donations`
- `/api/volunteering`
- `/api/certificates`
- `/api/messages`
- `/api/notifications`
- `/api/categories`
- `/api/requests`
- `/api/admin`
- `/api/ai`
- `/api/innovation`

Additional update-trust routes:
- `GET /api/campaigns/:id/updates/analytics`
- `GET /api/campaigns/ngo/campaign-updates/analytics`
- `POST /api/notifications/:id/open`
- `GET /api/ngos/:id/transparency`
- `GET /api/ngos/me/members` (members with tasks, campaign assignments, and badges)
- `POST /api/ngos/me/members`
- `GET /api/admin/webhooks`
- `GET /api/admin/webhooks/metrics`
- `GET /api/admin/webhooks/export`
- `POST /api/admin/webhooks/cleanup`
- `POST /api/admin/webhooks/:id/retry`
- `GET /api/admin/webhooks/worker/status`
- `POST /api/admin/webhooks/worker/run`

### Access Control
- `auth()` middleware verifies bearer token and injects `req.user`.
- Role restrictions are route-level (`user`, `ngo`, `admin`) using `auth(['role'])`.

## Database Design

Schema file: `sql/normalized_schema.sql`

### Table Pattern
Core entity tables use:
- `id BIGSERIAL PRIMARY KEY`
- `external_id TEXT UNIQUE NOT NULL`
- Typed relational columns
- `source_doc JSONB` for API payload compatibility
- `created_at`, `updated_at`

### Core Tables
- `users_rel`
- `ngos_rel`
- `campaigns_rel`
- `volunteer_opportunities_rel`
- `volunteer_applications_rel`
- `donations_rel`
- `certificates_rel`
- `messages_rel`
- `notifications_rel`
- `categories_rel`
- `help_requests_rel`
- `flag_requests_rel`
- `ai_logs_rel`
- `webhook_deliveries_rel`
- `giving_circles_rel`
- `circle_members_rel`
- `circle_contributions_rel`
- `wishlist_items_rel`
- `in_kind_pledges_rel`
- `volunteer_shifts_rel`
- `volunteer_shift_signups_rel`
- `volunteer_logs_rel`
- `donor_notes_rel`
- `donor_segments_rel`
- `donor_segment_members_rel`
- `impact_updates_rel`
- `corporate_profiles_rel`
- `corporate_employee_links_rel`
- `corporate_matches_rel`
- `user_rewards_rel`
- `volunteer_endorsements_rel`

### Join Tables
- `ngo_categories_rel`
- `campaign_volunteers_rel`
- `campaign_volunteer_registrations_rel`
- `opportunity_applicants_rel`

### Relationship Highlights
- `campaigns_rel.ngo_id -> ngos_rel.id`
- `donations_rel.user_id -> users_rel.id`
- `donations_rel.campaign_id -> campaigns_rel.id`
- `volunteer_applications_rel.opportunity_id -> volunteer_opportunities_rel.id`
- `certificates_rel.donation_id -> donations_rel.id`
- `certificates_rel.volunteer_application_id -> volunteer_applications_rel.id`

## Runtime Model Strategy

- Models in `src/models/*.js` are generated through `createModel(...)`.
- API uses stable `external_id` values in payloads and URLs.
- Route handlers use explicit PostgreSQL query logic where relational filtering/updates are needed.

## Payment Flow (Donations)

1. `POST /api/donations/campaign/:id/initiate`
2. Create gateway order (`mock` or `razorpay`)
3. Persist pending donation
4. `POST /api/donations/:id/confirm`
5. Verify payment, mark donation completed, update campaign amount, trigger certificate-approval state

## Innovation Money Flow

- Emergency campaign contributions in Innovation Center use the same donation gateway flow:
  1. `POST /api/donations/campaign/:id/initiate`
  2. gateway checkout (mock or Razorpay)
  3. `POST /api/donations/:id/confirm`
- Giving-circle contributions follow a two-step flow:
  1. frontend completes donation gateway flow against the mapped campaign
  2. frontend records the circle contribution via `POST /api/innovation/giving-circles/:id/contribute`
- Circle contribution records now persist payment context (`paymentMethod`, gateway refs in `paymentMeta`) for traceability.

## Environment

Create `backend/.env`:

```env
PORT=5001
POSTGRES_URL=postgresql://ngo_connect_app:ngo_connect_app_pw_2026@localhost:5432/ngo_connect
JWT_SECRET=<your_jwt_secret>
GEMINI_API_KEY=<optional>
PAYMENT_GATEWAY_PROVIDER=mock
# Optional Razorpay credentials:
# RAZORPAY_KEY_ID=<key>
# RAZORPAY_KEY_SECRET=<secret>
# Optional SMTP (campaign-update email delivery)
# MAIL_HOST=smtp.example.com
# MAIL_PORT=587
# MAIL_SECURE=false
# MAIL_USER=<smtp-user>
# MAIL_PASS=<smtp-pass>
# MAIL_FROM="NGO Connect <no-reply@example.com>"
# FRONTEND_URL=http://localhost:3000
# Optional outbound webhook settings
# WEBHOOK_ENABLED=true
# WEBHOOK_URL=http://localhost:9000/webhooks/ngo-connect
# WEBHOOK_SECRET=<shared-signing-secret>
# WEBHOOK_TIMEOUT_MS=5000
# WEBHOOK_RETRIES=1
# WEBHOOK_EVENTS=campaign.update.created,notification.engagement
# WEBHOOK_MAX_AGE_SECONDS=300
# WEBHOOK_AUTO_RETRY_ENABLED=true
# WEBHOOK_AUTO_RETRY_INTERVAL_MS=60000
# WEBHOOK_AUTO_RETRY_BATCH_SIZE=5
# WEBHOOK_AUTO_RETRY_ATTEMPTS=1
# WEBHOOK_AUTO_RETRY_BACKOFF_BASE_MS=60000
# WEBHOOK_AUTO_RETRY_BACKOFF_MAX_MS=1800000
# WEBHOOK_DEAD_LETTER_ALERT_ENABLED=true
# WEBHOOK_DEAD_LETTER_ALERT_THRESHOLD=5
# WEBHOOK_DEAD_LETTER_ALERT_COOLDOWN_MS=900000
# WEBHOOK_DEAD_LETTER_ALERT_SAMPLE_SIZE=5
# WEBHOOK_ALERT_EMAIL_TO=ops@example.com
# WEBHOOK_ALERT_SLACK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
# WEBHOOK_CLEANUP_DAYS=30
# WEBHOOK_CLEANUP_LIMIT=2000
# WEBHOOK_CLEANUP_DRY_RUN=true
# WEBHOOK_CLEANUP_STATUSES=delivered,skipped,replayed_success
```

Note: old `MONGO_*` variables are not used by the active backend runtime.

## Commands

```bash
npm install
npm run db:relational-schema
npm run seed
npm run dev
npm start
npm run smoke
npm run smoke:webhook
npm run smoke:webhook:worker
npm run webhook:worker:tick
npm run webhook:cleanup
npm run db:migrate:webhooks
npm run db:migrate:innovation
npm run webhook:receiver:example
```

### Smoke Test (API)

Run the backend in one terminal, then execute the smoke test in another:

```bash
cd backend
npm run dev
```

```bash
cd backend
npm run smoke
```

`npm run smoke` exercises user/NGO/admin flows end-to-end (donations, volunteering, certificates, support requests, messaging, moderation, admin dashboard snapshot).
It now also covers innovation flows (wishlists, giving circles, impact updates, CRM, shifts/logs, corporate matching, endorsements, emergency feed, and gamification).

`npm run seed` now inserts innovation-ready sample rows (completed donations, wishlist/pledges, giving circle, CRM segment, impact updates, corporate matching seed data, and gamification events).
It also seeds NGO team documentation data:
- `members` list with role/tasks/contributions plus random campaign assignment details
- `teamStrengthList` with role-wise counts and contribution summaries
- task-performance badges including monthly top-task `Member of the Month` badges
This seed payload is used directly by the NGO dashboard `Members & Team List` view.
It resets data with a single `TRUNCATE ... RESTART IDENTITY CASCADE` across all `*_rel` tables to avoid FK lock deadlocks during cleanup.

## Local Validation Checklist

- `GET /` returns API health payload.
- Login works for seeded user/admin/ngo accounts.
- Admin dashboard snapshot works: `GET /api/admin/dashboard` (admin auth).
- Admin SSR snapshot works: `GET /api/admin/dashboard/ssr` (admin auth, HTML).
- `GET /api/ngos` and `GET /api/campaigns` return data.
- Donation initiate/confirm endpoints respond successfully.
- Volunteer applications and certificate approval queues return expected results.
- Support requests show up for the selected NGO: `POST /api/requests` then `GET /api/requests/ngo`.
- Flag requests are visible in admin moderation: `POST /api/ngos/:id/flag-request` then `GET /api/admin/flag-requests`.
