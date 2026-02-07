# PostgreSQL Database Design

## Design Summary
Runtime now uses normalized relational tables (`*_rel`) directly.

Each core table follows this pattern:
- `id BIGSERIAL PRIMARY KEY` (integer key)
- `external_id TEXT UNIQUE NOT NULL` (API-facing legacy id)
- typed relational columns for querying/reporting
- `source_doc JSONB` for compatibility with existing route payload shape
- `created_at`, `updated_at`

## Core Tables
- `users_rel`
- `ngos_rel`
- `categories_rel`
- `campaigns_rel`
- `volunteer_opportunities_rel`
- `donations_rel`
- `volunteer_applications_rel`
- `certificates_rel`
- `messages_rel`
- `notifications_rel`
- `help_requests_rel`
- `flag_requests_rel`
- `ai_logs_rel`

## Join Tables
- `ngo_categories_rel`
- `campaign_volunteers_rel`
- `campaign_volunteer_registrations_rel`
- `opportunity_applicants_rel`

## Key Relational Links
- `campaigns_rel.ngo_id -> ngos_rel.id`
- `donations_rel.user_id -> users_rel.id`
- `donations_rel.ngo_id -> ngos_rel.id`
- `donations_rel.campaign_id -> campaigns_rel.id`
- `volunteer_applications_rel.user_id -> users_rel.id`
- `volunteer_applications_rel.ngo_id -> ngos_rel.id`
- `volunteer_applications_rel.opportunity_id -> volunteer_opportunities_rel.id`
- `certificates_rel.user_id -> users_rel.id`
- `certificates_rel.ngo_id -> ngos_rel.id`
- `certificates_rel.donation_id -> donations_rel.id`
- `certificates_rel.volunteer_application_id -> volunteer_applications_rel.id`

## Setup Flow
1. `npm run db:relational-schema`
2. `npm run seed` (optional sample data)
3. `npm run dev`

## Operational Notes
- Runtime models use `external_id` for stable API-facing identifiers.
- PostgreSQL integer `id` is the canonical relational key.
