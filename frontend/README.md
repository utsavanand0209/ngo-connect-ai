# NGO Connect Frontend

React client for NGO-Connect. It provides role-based experiences for users, NGOs, and admins and consumes backend APIs from the `services/api.js` layer.

## Phase Progress (Current)

### Phase 3
- Campaign details page supports NGO-authored campaign updates.
- User notification cards now track click engagement before navigation.

### Phase 4
- NGO dashboard includes aggregate campaign update analytics across all campaigns.
- Added frontend API helpers:
  - `getCampaignUpdateAnalytics(campaignId)`
  - `getNgoCampaignUpdateAnalytics()`
  - `trackNotificationEngagement(notificationId, { action })`

### Phase 5
- Admin dashboard now includes:
  - webhook delivery summary cards
  - dead-letter queue table
  - replay action for failed webhook deliveries
- Added frontend API helpers:
  - `getAdminWebhookDeliveries(params)`
  - `retryAdminWebhookDelivery(deliveryId, data)`

### Phase 6
- Admin dashboard now shows webhook worker state (`enabled/disabled`) and supports manual run.
- Dead-letter table now shows `next retry` scheduling.
- Added frontend API helpers:
  - `getAdminWebhookWorkerStatus()`
  - `runAdminWebhookWorkerTick()`

### Phase 7
- Admin dashboard now shows webhook metrics window summary and per-event performance.
- Added webhook export action for CSV download.
- Added frontend API helpers:
  - `getAdminWebhookMetrics(params)`
  - `exportAdminWebhooks(params)`

### Phase 8
- Admin dashboard now supports webhook retention cleanup (dry-run and purge actions).
- Added frontend API helper:
  - `runAdminWebhookCleanup(data)`

### Phase 9
- Worker runtime state (last tick telemetry) is displayed in admin dashboard for operations visibility.

### Phase 10
- Added Innovation Center page:
  - `/innovation-center`
- Added navigation entry for user/ngo roles.
- Added frontend API helpers for:
  - giving circles
  - in-kind wishlists
  - volunteer shifts/logs
  - donor CRM segments/notes
  - impact updates
  - corporate matching
  - emergency feed
  - endorsements
  - gamification
- NGO profile now displays computed transparency score from backend.
- NGO dashboard `Members & Team List` now shows seeded member campaign assignments and task-based badges, including `Member of the Month`.
- Innovation Center now supports emergency campaign contributions with payment method fields (UPI/card/netbanking) and gateway checkout.
- Innovation Center now supports giving-circle contributions with payment method fields (UPI/card) and gateway checkout before contribution recording.
- Innovation Center now displays completed-state locks for giving circles and wishlist needs (shows `Need Completed` and disables further inputs).

## Frontend Architecture

### Stack
- React 18
- React Router v6
- Axios
- Tailwind CSS
- Recharts
- Leaflet (`react-leaflet`, `leaflet-routing-machine`)

### App Structure

```
frontend/src/
├── App.js                 # route graph
├── components/            # shared UI + route guards
│   ├── ProtectedRoute.js
│   ├── UserRoute.js
│   └── AdminRoute.js
├── pages/                 # page-level features
│   ├── admin pages
│   ├── ngo pages
│   ├── user pages
│   └── Map/NgoMap.js
├── services/
│   └── api.js             # axios client + endpoint helpers
└── utils/
```

### Routing Model
- Public routes: home, login/register, NGO list/profile, campaign list/details.
- Auth routes: dashboard, profile, messaging, recommendations.
- Innovation route: `/innovation-center` (authenticated user/ngo).
- User-only routes: donate, volunteer campaigns/opportunities, insights.
- Admin-only routes: verification, analytics, requests, categories, notifications, moderation.

### Feature Highlights
- Donations: initiate/confirm flow, receipts, and NGO certificate approval.
- Volunteering:
  - Volunteer opportunities (apply, complete, NGO certificate approve).
  - Campaign volunteering (submit details, NGO approve/reject, certificate issuance).
- Support Requests: users submit help requests to a selected NGO; NGOs manage request status in their dashboard inbox; admin sees snapshot summary.
- Messaging: threaded user <-> NGO conversations with unread counts.
- Moderation: user-submitted flag requests for NGOs/campaigns and admin review workflow.
- Campaign update intelligence:
  - NGO-side delivery and engagement insight panels.
  - Campaign-level and NGO-aggregate update analytics views.
- Webhook operations:
  - Admin dead-letter visibility and replay controls in `AdminDashboard`.
  - Worker status/run, metrics, export, and cleanup controls in `AdminDashboard`.
- Innovation operations:
  - User: giving circles, in-kind pledges, emergency feed, gamification, endorsements.
  - NGO: wishlist operations, impact posting, donor CRM segmentation + messaging.

### Innovation Feature Flow (Frontend)
- Emergency contributions and giving-circle contributions both use the shared gateway utility in `src/utils/paymentGateway.js`.
- Contribution UI captures amount + payment method details, validates client-side, then launches gateway checkout.
- Only after gateway confirmation does the frontend write the innovation-specific record:
  - emergency: donation confirmation updates campaign totals directly.
  - giving circle: `/innovation/giving-circles/:id/contribute` is called after successful payment confirmation.
- Completed needs are rendered as `Need Completed` and contribution inputs/buttons are disabled.

### Data Access Model
- `api.js` configures a single Axios instance.
- JWT token from `localStorage` is automatically attached to requests.
- Endpoint helper functions are grouped by domain (donations, volunteering, certificates, categories, help requests, etc.).

## Environment

Create `frontend/.env`:

```env
REACT_APP_API_URL=http://localhost:5001/api
```

If not set, frontend defaults to `http://localhost:5001/api`.

## Commands

```bash
npm install
npm start
npm run build
npm test
```

## Run With Backend

1. Start backend on `http://localhost:5001`
2. Seed backend data (`cd ../backend && npm run seed`) to load NGO members/team-strength demo data (including random campaign assignments and monthly top-task badges for the NGO dashboard team list modal)
3. Start frontend on `http://localhost:3000`
4. Ensure API URL points to backend `/api` base

## Common Issues
- `404` for API calls:
  - Check `REACT_APP_API_URL`.
  - Verify backend is running and route exists.
- Auth redirects to login:
  - Token may be expired/invalid; re-login.
- Map not rendering:
  - Confirm Leaflet CSS/assets are loaded by app build.
