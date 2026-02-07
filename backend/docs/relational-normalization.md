# Relational Normalization (PostgreSQL)

## Status
Phase 2 cutover is complete.

- Runtime reads/writes now target normalized `*_rel` tables.
- Primary keys are integer (`BIGSERIAL id`).
- Legacy/API ids are preserved in `external_id`.
- Old compatibility doc tables (`users`, `ngos`, etc.) are removed.

## Why This Design
- Integer PKs improve join/index efficiency.
- Foreign keys enforce data integrity.
- Typed columns support reliable analytics and filtering.
- `source_doc` preserves compatibility during incremental route refactors.

## Main Commands
```bash
npm run db:relational-schema
npm run seed
npm run dev
```
