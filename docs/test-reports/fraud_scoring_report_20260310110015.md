# Fraud Scoring Test Report

- Generated At: 2026-03-10T11:00:15.556Z
- Threshold: 50
- Total: 6
- Passed: 6
- Failed: 0

## Cases

- FRAUD-001 | PASS | Old verified NGO with normal campaign stays unflagged
- FRAUD-002 | PASS | Missing verification docs alone adds 40 and is not flagged
- FRAUD-003 | PASS | Missing docs + very new NGO crosses threshold
- FRAUD-004 | PASS | Suspicious keywords + unrealistic goal hits exact threshold
- FRAUD-005 | PASS | Invalid createdAt is treated as unknown-risk and string goal is parsed
- FRAUD-006 | PASS | Non-array verification docs are treated as missing
