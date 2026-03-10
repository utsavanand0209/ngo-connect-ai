# Admin Verification Interface Scenario Report

- Run ID: `20260310110015`
- Timestamp: `2026-03-10T11:00:15.564Z`
- API Base: `http://localhost:5001/api`
- Status: **PASSED**

## Scenario
- NGO ID: c9a3d206-c14d-4559-afc1-dda1bab68e98
- NGO Email: verification.scenario.20260310110015@example.com

## Assertions
- Registered NGO appears in queue with pending status.
- Checklist enforcement blocks verification for incomplete NGO profile.
- Rejection endpoint stores rejected status with feedback.
- NGO resubmission returns status to pending.
- Admin verification succeeds after checklist conditions are met.
- Verification history contains rejected and approved decisions.
- Admin + NGO notifications are generated for verification decisions.

## Steps
- PASS | Login as admin (410ms)
- PASS | Register scenario NGO (352ms)
- PASS | Login as scenario NGO (155ms)
- PASS | Load admin verification queue (19ms)
- PASS | Verify with checklist enforcement before docs (expected fail) (79ms)
- PASS | Reject NGO with reason and suggestions (85ms)
- PASS | NGO uploads verification document (resubmission) (11ms)
- PASS | Verify NGO after resubmission (6ms)
- PASS | Queue includes verification history entries (82ms)
- PASS | Notifications are accessible for admin and NGO (5ms)
