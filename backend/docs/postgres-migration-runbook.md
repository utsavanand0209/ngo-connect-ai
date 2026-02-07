# PostgreSQL Setup Runbook

## 1) Prechecks
- Confirm PostgreSQL is running on your target host.
- Ensure `.env` contains:
  - `POSTGRES_URL`
  - `JWT_SECRET`

## 2) Install dependencies
```bash
cd backend
npm install
```

## 3) Apply relational schema
```bash
npm run db:relational-schema
```

## 4) Seed data (optional)
```bash
npm run seed
```

## 5) Validate
- `GET /` returns API health.
- Login works for seeded user/admin/ngo.
- NGO and campaign list endpoints return data.
- Donation/volunteer history endpoints return data for known users.

## 6) Reset
If needed, rerun schema and seed commands to reset local dev data.
