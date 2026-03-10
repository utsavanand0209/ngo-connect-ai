# Fraud Scoring Full Updated Report

## Scope
This report documents where fraud scoring is used, what was tested, fixes applied, and current status.

## Where Fraud Scoring Is Used
- API endpoint: `POST /api/ai/fraud-score` in `backend/src/routes/ai.js`.
- Architecture docs references:
  - `DESIGN_AND_ARCHITECTURE.md` (AI features section and API table).
- Current app wiring:
  - The scoring is currently backend-driven and can be called by admin/internal workflows or via API clients.

## Fixes Applied
1. Extracted scoring logic to reusable utility: `backend/src/utils/fraudScore.js`.
2. Added input validation in route:
   - Returns `400` if `ngoId` is missing.
3. Improved edge-case handling:
   - Invalid/missing `createdAt` is treated as risk (`newOrUnknownAccount`).
   - Non-array `verificationDocs` is treated as missing verification docs.
   - String campaign goals are converted safely to numbers.
4. Route response now includes diagnostics:
   - `{ score, flagged, threshold, checks }`

## Test Cases Added
Automated suite: `backend/scripts/fraudScoringTest.js`

Covered scenarios:
- Verified old NGO with normal goals (no flag).
- Missing verification docs only.
- Missing docs + new account (flagged).
- Suspicious keywords + unrealistic goal at threshold.
- Invalid account creation date + string goal parsing.
- Non-array verification docs handling.

## Execution
Command run:
- `cd backend && npm run test:fraud`

Outcome:
- `6/6` passed.

Generated artifacts:
- `docs/test-reports/fraud_scoring_report_20260310100041.json`
- `docs/test-reports/fraud_scoring_report_20260310100041.md`

## Current Status
- Fraud scoring logic is validated and deterministic for the covered heuristic conditions.
- No failing test case in the new fraud suite.
- Endpoint now returns clearer diagnostics for UI/admin consumption and debugging.
