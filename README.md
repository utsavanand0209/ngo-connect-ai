# NGO-Connect

NGO-Connect is a full-stack platform that connects donors, volunteers, NGOs, and admins in one workflow. The project now runs on a PostgreSQL-backed architecture across the backend runtime.

## Phase Progress (Current)

### Phase 3: Donor Engagement + Delivery Analytics
- NGOs can publish campaign updates from campaign pages.
- Updates trigger personalized donor notifications and optional email delivery.
- Engagement is tracked using open/click counters.
- Added APIs:
  - `POST /api/campaigns/:id/updates`
  - `GET /api/campaigns/:id/updates/analytics`
  - `POST /api/notifications/:id/open`

### Phase 4: NGO Analytics Hub + Webhooks
- NGO dashboard now shows aggregate campaign update analytics across all NGO campaigns.
- Added API:
  - `GET /api/campaigns/ngo/campaign-updates/analytics`
- Added outbound webhook framework with signed events:
  - `campaign.update.created`
  - `notification.engagement`
- Added webhook smoke test:
  - `npm run smoke:webhook` (from `backend/`)

### Phase 5: Webhook Reliability + Dead-Letter Operations
- Added persistent webhook delivery logs table (`webhook_deliveries_rel`).
- Failed deliveries are now captured in dead-letter status for admin replay.
- Added admin webhook operations:
  - `GET /api/admin/webhooks`
  - `POST /api/admin/webhooks/:id/retry`
- Admin dashboard now includes a dead-letter queue panel with replay actions.
- Added webhook receiver example with signature verification and replay protection:
  - `backend/scripts/webhookReceiverExample.js`

### Phase 6: Automated Replay + Alerting
- Added automatic dead-letter replay worker with exponential backoff.
- Added worker controls:
  - `GET /api/admin/webhooks/worker/status`
  - `POST /api/admin/webhooks/worker/run`
- Added backlog alerting for dead-letter queue via email and Slack.
- Added one-shot worker tick command:
  - `npm run webhook:worker:tick` (from `backend/`)
- Added end-to-end worker replay smoke test:
  - `npm run smoke:webhook:worker` (from `backend/`)

### Phase 7: Webhook Metrics + Export
- Added admin webhook metrics API for windowed summary, event breakdown, and trend:
  - `GET /api/admin/webhooks/metrics?hours=24`
- Added webhook delivery export API:
  - `GET /api/admin/webhooks/export?format=csv|json`
- Admin dashboard now includes metrics cards, event performance table, and CSV export.

### Phase 8: Delivery Retention Cleanup
- Added cleanup API for retention-based purge:
  - `POST /api/admin/webhooks/cleanup`
- Added cleanup CLI:
  - `npm run webhook:cleanup` (from `backend/`)
- Admin dashboard now supports dry-run cleanup and 30-day purge action.

### Phase 9: Runtime Worker Visibility
- Worker status now exposes runtime telemetry (`lastTickAt`, `lastResult`, `lastError`, `tickCount`, `isRunning`).
- Admin dashboard now surfaces last worker tick time for faster operations debugging.

### Phase 10: Innovation Ecosystem + Transparency
- Added full innovation API surface under `/api/innovation`.
- Added NGO trust endpoint:
  - `GET /api/ngos/:id/transparency`
- Added frontend Innovation Center (`/innovation-center`) for users/NGOs.
- Implemented feature modules:
  - giving circles
  - in-kind wishlist + pledges
  - volunteer shifts/reminders/logs/export
  - donor CRM segments/notes/messaging
  - impact timeline updates
  - corporate donation matching
  - emergency response feed and toggles
  - volunteer endorsements
  - gamification summary and leaderboard
- Innovation flow fixes:
  - wishlist quantities now reflect committed pledges immediately
  - giving circles and wishlist needs auto-close on completion and block extra contributions/pledges
  - emergency campaign contributions in Innovation Center now use the full payment method + gateway flow (UPI/card/netbanking)
  - giving circle contributions now use payment method + gateway flow (UPI/card) before recording the circle contribution

### Phase 11: End-To-End Role Scenario + Data Flood Testing
- Added high-volume role workflow scenario runner:
  - `npm run scenario:flood` (from `backend/`)
- Added role moderation scenario runner:
  - `npm run scenario:roles` (from `backend/`)
- Scenario runner now creates and validates cross-role workflows for:
  - users, NGOs, admin moderation
  - campaigns, members, opportunities, shifts, wishlists, pledges
  - donations, campaign updates, messaging, help requests, endorsements
  - CRM segments, corporate matching, emergency feed, webhook admin operations
- Automated scenario reports are now written to:
  - `docs/test-reports/`

### Phase 12: Campaign Update Analytics Reliability
- Legacy campaign updates are now normalized and included in analytics totals.
- User dashboard now tracks campaign-update notification opens automatically when update notifications are viewed.
- Click tracking remains linked to `View Campaign Update` action.
- Email delivery metric behavior:
  - `Email Delivery` only increases when SMTP is configured and emails are actually sent.
  - without SMTP (`MAIL_*` not set), attempts can increase while sent remains `0`.

## Innovation Center Features And Flow

Route: `/innovation-center` (for authenticated `user` and `ngo` roles).

### User Modules
- Emergency Response Feed: see active emergency campaigns/opportunities/wishlist needs and contribute directly.
- Giving Circles: create/join circles, contribute money, and track progress/member counts until need completion lock.
- In-Kind Wishlist: pledge quantities against item needs; completed items are locked with `Need Completed`.
- Gamification + Endorsements: view points, badges, leaderboard, and NGO-issued volunteer endorsements.
- Corporate Matching: create/link company profiles and evaluate/approve eligible match records.

### NGO Modules
- Wishlist Management: create in-kind needs and mark operational fulfillment state via pledges and approvals.
- Impact Updates: publish campaign-level progress/utilization updates.
- Donor CRM: manage donor notes, build segments, and send targeted segment messages.
- Volunteer Operations: schedule shifts, capture volunteer logs, approve/reject logs, and export logs.
- Emergency Controls: mark campaigns/opportunities as emergency to surface them in emergency feed.

### Money Contribution Flow In Innovation Center
- Emergency campaigns:
  1. User enters amount + payment method (`upi`/`card`/`netbanking`) in Innovation Center.
  2. Frontend initiates donation payment order (`/api/donations/campaign/:id/initiate`).
  3. Checkout runs on configured provider (`mock` or Razorpay).
  4. Payment is confirmed (`/api/donations/:id/confirm`) and campaign totals update.
- Giving circles:
  1. User enters amount + payment method (`upi`/`card`) in Giving Circles list.
  2. Same initiate + checkout + confirm donation flow runs first.
  3. On successful payment confirmation, circle contribution is recorded (`/api/innovation/giving-circles/:id/contribute`).
  4. Circle progress/remaining amount refreshes; completed circles lock further contributions.

## Architecture At A Glance

```
React SPA (frontend)
  -> Axios API client + JWT
Express API (backend)
  -> Route handlers + auth middleware + service layer
PostgreSQL
  -> *_rel tables + JSONB source_doc + relational keys/indexes
```

## Repository Layout

```
Ngo-Connect/
├── backend/
│   ├── sql/                     # PostgreSQL schema (normalized_schema.sql)
│   ├── src/
│   │   ├── db/                  # pg pool, model factory, query helpers
│   │   ├── middleware/          # JWT auth + role checks
│   │   ├── models/              # Model wrappers mapped to *_rel tables
│   │   ├── routes/              # Domain API routes
│   │   ├── services/            # External service adapters (payments)
│   │   └── utils/               # Utility helpers (certificates, etc.)
│   ├── docs/                    # Migration/design notes
│   └── seed.js                  # Sample data seeding
├── frontend/
│   └── src/
│       ├── components/          # Shared UI + route guards
│       ├── pages/               # Feature pages (user/ngo/admin)
│       ├── services/            # API client
│       └── utils/               # Client-side helpers
└── README.md
```

## Frontend Design

### Core Stack
- React 18
- React Router v6
- Axios
- Tailwind CSS
- Recharts
- Leaflet + react-leaflet

### Routing And Access Control
- `frontend/src/App.js` defines all page routes.
- `ProtectedRoute` gates authenticated routes.
- `UserRoute` gates donor/volunteer-only screens.
- `AdminRoute` gates admin-only screens.

### Feature Areas
- Public: Home, NGO list/profile, campaign list/details.
- User: discover NGOs, donations, volunteer campaigns/opportunities, recommendations, insights, dashboard/profile, messaging.
- NGO: profile updates, campaign creation, volunteer and donation operations.
- Admin: NGO verification, flags moderation, categories, notifications, requests, analytics, user management.

### API Client Pattern
- `frontend/src/services/api.js` centralizes all HTTP calls.
- JWT token is injected via Axios request interceptor.
- API base comes from `REACT_APP_API_URL` (defaults to `http://localhost:5001/api`).
- Frontend exposes feature-specific API helpers for donations, volunteering, certificates, categories, requests, recommendations, and NGO discovery.

## Backend Design

### Runtime Stack
- Node.js + Express
- PostgreSQL (`pg`)
- JWT auth (`jsonwebtoken`)
- Password hashing (`bcryptjs`)
- Multer uploads
- Gemini integration (`@google/generative-ai`)

### API Composition
Mounted in `backend/src/server.js`:
- `/api/auth`
- `/api/ngos`
- `/api/campaigns`
- `/api/donations`
- `/api/volunteering`
- `/api/certificates`
- `/api/messages`
- `/api/notifications`
- `/api/categories`
- `/api/requests`
- `/api/users`
- `/api/admin`
- `/api/ai`
- `/api/innovation`

### Layered Structure
- Routes: request validation, authorization, response shaping.
- Middleware: token verification + role-based access.
- Models: table mappings via `createModel` in `backend/src/db/modelFactory.js`.
- DB layer: pooled pg connection + SQL helpers in `backend/src/db/postgres.js`.
- Services: payment gateway abstraction (`mock` and `razorpay`).

### Key Backend Flows
- Donation flow:
  - Initiate payment order (`/api/donations/campaign/:id/initiate`).
  - Confirm payment (`/api/donations/:id/confirm`).
  - Update donation state, campaign amount, and certificate approval workflow.
- Volunteer flow:
  - Opportunity publishing by NGOs.
  - User applications and completion state transitions.
  - NGO certificate approval decision endpoints.
- Support requests (help requests):
  - Users submit a request to a selected NGO (`/api/requests`).
  - NGOs manage request status in their dashboard inbox (`/api/requests/ngo`).
  - Admin dashboard snapshot includes a support-requests panel (`/api/admin/dashboard`).
- Moderation flag requests:
  - Users request admin review for NGOs/campaigns (`/api/ngos/:id/flag-request`, `/api/campaigns/:id/flag-request`).
  - Admin reviews and resolves requests (`/api/admin/flag-requests`).
- Messaging:
  - User-to-NGO and NGO-to-user messaging (`/api/messages/*`) with conversation threads and unread counts.
- Admin flow:
  - NGO verification/rejection.
  - Flags moderation and resolution.
  - Broadcast notifications and analytics endpoints.

## Database Design (PostgreSQL)

### ID Strategy
- `id BIGSERIAL` is the internal relational primary key.
- `external_id TEXT UNIQUE` is the API-facing stable ID.
- `source_doc JSONB` stores full API payload compatibility.
- `created_at` and `updated_at` are maintained on all core tables.

### Main Tables
- `users_rel`
- `ngos_rel`
- `categories_rel`
- `campaigns_rel`
- `volunteer_opportunities_rel`
- `volunteer_applications_rel`
- `donations_rel`
- `certificates_rel`
- `messages_rel`
- `notifications_rel`
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

### Core Relationships
- Campaigns belong to NGOs.
- Donations link users, campaigns, and NGOs.
- Volunteer applications link users, opportunities, and NGOs.
- Certificates link to donation or volunteer-completion records.
- Requests, messages, notifications, and flags link to user/admin actors.

### Query Semantics
- Route-level filtering and update behavior has been moved toward explicit PostgreSQL logic.
- SQL joins and JSONB expressions are used where route filters need richer selection.
- Mongo-style query/update operators are not used in route handlers for the newer Postgres-native paths.

## Setup

### Prerequisites
1. Node.js LTS
2. PostgreSQL 14+
3. npm

### Backend Env (`backend/.env`)

```env
PORT=5001
POSTGRES_URL=postgresql://<user>:<password>@localhost:5432/ngo_connect
JWT_SECRET=<strong-secret>
GEMINI_API_KEY=<optional>
PAYMENT_GATEWAY_PROVIDER=mock
# Optional for Razorpay
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
# Optional outbound webhook delivery
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

### Frontend Env (`frontend/.env`)

```env
REACT_APP_API_URL=http://localhost:5001/api
```

### Install + Run

```bash
# backend
cd backend
npm install
npm run db:relational-schema
npm run seed
npm run dev

# frontend (new terminal)
cd ../frontend
npm install
npm start
```

`npm run seed` performs a deadlock-safe full relational reset (`TRUNCATE ... RESTART IDENTITY CASCADE` on all `*_rel` tables) before inserting fresh sample data.
It now also seeds each NGO with:
- `members` (name, role, tasks completed, contribution summary, tasks list, randomly assigned campaign mappings with campaign IDs/titles, and badges)
- `teamStrengthList` (role-wise member counts and contribution summaries)
- NGO dashboard-friendly member metadata used by the `Members & Team List` panel
- task-based monthly badges, including `Member of the Month (...)` for top task performers in each NGO

### Command Reference

```bash
# Backend
cd backend
npm run dev
npm run start
npm run seed
npm run smoke
npm run scenario:flood
npm run scenario:roles
npm run smoke:webhook
npm run smoke:webhook:worker
npm run webhook:worker:tick
npm run webhook:cleanup
npm run db:relational-schema
npm run db:migrate:webhooks
npm run db:migrate:innovation

# Frontend
cd frontend
npm start
npm run build
npm test
```

### Research Paper Pipeline (IEEE)

Updated paper assets are generated with Python and compiled with LaTeX:

```bash
# from repo root
python3 generate_paper_figures.py
python3 generate_paper.py
pdflatex -interaction=nonstopmode ngo_connect_paper.tex
pdflatex -interaction=nonstopmode ngo_connect_paper.tex
```

Outputs:
- `ngo_connect_paper.tex` (updated IEEE paper source)
- `ngo_connect_paper.pdf` (compiled paper)
- `figures/paper_metrics.json` (source-derived metrics)
- generated diagrams/charts in `figures/`:
  - `system_architecture.png`
  - `endpoint_distribution.png`
  - `innovation_feature_matrix.png`
  - `payment_sequence.png`
  - `webhook_lifecycle.png`
  - `smoke_latency_breakdown.png`
  - `scalability_latency.png`

### GitHub Update Workflow

```bash
# from repo root
git add README.md generate_paper.py generate_paper_figures.py ngo_connect_paper.tex ngo_connect_paper.pdf figures/
git commit -m "Update IEEE research paper, diagrams, and README pipeline"
git push origin <your-branch>
```

### API Smoke Test

With the backend running and a seeded database, run:

```bash
cd backend
npm run smoke
npm run smoke:webhook
npm run smoke:webhook:worker
npm run webhook:worker:tick
npm run webhook:cleanup
npm run db:migrate:innovation
npm run scenario:flood
npm run scenario:roles
```

Apply Phase 5 webhook migration without resetting all tables:

```bash
cd backend
npm run db:migrate:webhooks
```

Optional: override API base and credentials via env vars:
- `API_BASE` (default: `http://localhost:5001/api`)
- `SMOKE_USER_EMAIL`, `SMOKE_NGO_EMAIL`, `SMOKE_ADMIN_EMAIL` (passwords also supported)

Optional flood scenario sizing env vars:
- `FLOOD_USER_COUNT`
- `FLOOD_NGO_COUNT`
- `FLOOD_CAMPAIGNS_PER_NGO`
- `FLOOD_OPPORTUNITIES_PER_NGO`
- `FLOOD_WISHLIST_ITEMS_PER_NGO`
- `FLOOD_SHIFTS_PER_NGO`
- `FLOOD_MEMBERS_PER_ROLE`

## Analytics Notes
- `Open Rate` / `Click Rate` depend on engagement events captured via:
  - `POST /api/notifications/:id/open`
- `Email Delivery` depends on SMTP runtime configuration in `backend/.env`:
  - `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, optional `MAIL_FROM`
- If SMTP is missing, dashboard may show:
  - non-zero `attempts`
  - zero `sent`
  - `Email Delivery = 0.0%`

## Seed Credentials (Local)
- Admin: `admin@ngoconnect.org` / `password123`
- User: `rahul@example.com` / `password123`
- NGO: `akshayapatra@ngo.org` / `password123`

## API Surface Summary
- Authentication and profile: `/api/auth`, `/api/users`
- NGO and campaigns: `/api/ngos`, `/api/campaigns`
- NGO team members (NGO-auth only): `/api/ngos/me/members` (returns tasks, campaign assignments, and badges)
- Donations, volunteering, certificates: `/api/donations`, `/api/volunteering`, `/api/certificates`
- Communication and operations: `/api/messages`, `/api/notifications`, `/api/requests`
- Platform admin and intelligence: `/api/admin`, `/api/ai`, `/api/categories`
- Innovation and trust: `/api/innovation`, `/api/ngos/:id/transparency`
- Campaign update analytics and tracking:
  - `/api/campaigns/:id/updates`
  - `/api/campaigns/:id/updates/analytics`
  - `/api/campaigns/ngo/campaign-updates/analytics`
  - `/api/notifications/:id/open`
- Webhook operations:
  - `/api/admin/webhooks`
  - `/api/admin/webhooks/metrics`
  - `/api/admin/webhooks/export`
  - `/api/admin/webhooks/cleanup`
  - `/api/admin/webhooks/:id/retry`
  - `/api/admin/webhooks/worker/status`
  - `/api/admin/webhooks/worker/run`

## Troubleshooting
- `404` on donation/payment endpoints:
  - Confirm frontend uses `REACT_APP_API_URL=http://localhost:5001/api`.
  - Confirm backend is running on port `5001`.
- DB connection failures:
  - Verify `POSTGRES_URL` and ensure PostgreSQL is running.
  - Re-run `npm run db:relational-schema` and `npm run seed`.
- Auth failures:
  - Ensure `JWT_SECRET` is set and stable across backend restarts.
  - Re-login after backend auth changes.

## Notes
- Legacy Mongo/Mongoose runtime dependencies are not required for the current backend runtime.
- If old `MONGO_*` variables exist in local env files, they are not used by the active server code.
