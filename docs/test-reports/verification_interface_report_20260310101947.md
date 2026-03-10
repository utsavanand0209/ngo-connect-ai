# Admin Verification Interface Scenario Report

- Run ID: `20260310101947`
- Timestamp: `2026-03-10T10:19:47.442Z`
- API Base: `http://localhost:5002/api`
- Status: **PASSED**

## Scenario
- NGO ID: 6466cd4d-97fe-4618-94de-fa0bf1de5062
- NGO Email: verification.scenario.20260310101947@example.com

## Assertions
- Registered NGO appears in queue with pending status.
- Checklist enforcement blocks verification for incomplete NGO profile.
- Rejection endpoint stores rejected status with feedback.
- NGO resubmission returns status to pending.
- Admin verification succeeds after checklist conditions are met.
- Verification history contains rejected and approved decisions.
- Admin + NGO notifications are generated for verification decisions.

## Steps
- PASS | Login as admin (161ms)
- PASS | Register scenario NGO (96ms)
- PASS | Login as scenario NGO (78ms)
- PASS | Load admin verification queue (11ms)
- PASS | Verify with checklist enforcement before docs (expected fail) (3ms)
- PASS | Reject NGO with reason and suggestions (10ms)
- PASS | NGO uploads verification document (resubmission) (9ms)
- PASS | Verify NGO after resubmission (112ms)
- PASS | Queue includes verification history entries (11ms)
- PASS | Notifications are accessible for admin and NGO (6ms)
