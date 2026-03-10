# NGO-Connect Full Validation Report

Date: 2026-03-09

## Scope Completed

- End-to-end backend smoke coverage for user, NGO, and admin flows.
- Webhook delivery + auto-retry smoke flows.
- Role-based website route checks (public, user, NGO, admin) using Playwright traversal.
- Scenario workflow:
  - created 3 NGOs
  - verified 2 NGOs
  - rejected 1 NGO
  - submitted 3 flag requests
  - approved 2 requests
  - rejected 1 request
- Filesystem cleanup for root-level document/image clutter into organized folders.

## Automated Runs

- `backend`: `npm run smoke` -> PASS
- `backend`: `npm run smoke:webhook` -> PASS
- `backend`: `npm run smoke:webhook:worker` -> PASS
- `frontend`: `npm run build` -> PASS
- `frontend`: `CI=true npm test -- --watchAll=false` -> No tests found (exit code 1)
- `playwright`: `node scripts/linkedin/capture_screenshots.mjs` -> 35/35 routes captured successfully

## Bug Found And Fixed

### Issue

Newly registered NGOs were not reliably visible in admin pending-verification queue.

### Root Cause

- NGO registration payload did not explicitly store `verified: false`.
- Pending endpoint filtered only `verified === false`, so records with missing `verified` were skipped.

### Fix

- Updated NGO registration defaults to include `verified`, `flagged`, and `isActive`.
- Updated admin pending registration endpoint to treat `verified !== true` as pending.

## Key Artifacts

- Scenario report:
  - `docs/test-reports/role_workflow_report_20260309102129.json`
  - `docs/test-reports/role_workflow_report_20260309102129.md`
- Screenshot index:
  - `docs/linkedin/screenshots_index.md`

## Filesystem Organization Changes

- Moved loose root docs to `docs/organized/documents/`
- Moved loose root images to `docs/organized/images/`
- Updated presentation generator output path to `docs/organized/documents/NGO_Connect_Architecture_Presentation.pptx`
