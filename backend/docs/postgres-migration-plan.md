# PostgreSQL Runtime Plan

## Goal
Keep NGO Connect fully PostgreSQL-backed with no legacy document-database dependencies.

## Architecture
- Runtime tables: `*_rel`
- Primary key: `id BIGSERIAL` (integer)
- API-facing key: `external_id TEXT UNIQUE`
- Full document payload: `source_doc JSONB`
- Join tables for many-to-many relations (`campaign_volunteers_rel`, `opportunity_applicants_rel`, etc.)

## Operational Steps
1. Apply schema:
```bash
npm run db:relational-schema
```
2. Seed sample data:
```bash
npm run seed
```
3. Start API:
```bash
npm run dev
```

## Notes
- Integer `id` is the canonical relational key.
- `external_id` remains stable for API references.
