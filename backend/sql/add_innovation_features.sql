BEGIN;

CREATE TABLE IF NOT EXISTS giving_circles_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  owner_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES campaigns_rel(id) ON DELETE SET NULL,
  goal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS giving_circles_rel_owner_idx ON giving_circles_rel (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS giving_circles_rel_campaign_idx ON giving_circles_rel (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS giving_circles_rel_status_idx ON giving_circles_rel (status, created_at DESC);

CREATE TABLE IF NOT EXISTS circle_members_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  circle_id BIGINT NOT NULL REFERENCES giving_circles_rel(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL,
  UNIQUE (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS circle_members_rel_circle_idx ON circle_members_rel (circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS circle_members_rel_user_idx ON circle_members_rel (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS circle_contributions_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  circle_id BIGINT NOT NULL REFERENCES giving_circles_rel(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  contribution_status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
ALTER TABLE circle_contributions_rel
  ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS circle_contributions_rel_circle_idx ON circle_contributions_rel (circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS circle_contributions_rel_user_idx ON circle_contributions_rel (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wishlist_items_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES campaigns_rel(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL DEFAULT '',
  quantity_needed INTEGER NOT NULL DEFAULT 1,
  quantity_fulfilled INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',
  emergency BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS wishlist_items_rel_ngo_idx ON wishlist_items_rel (ngo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wishlist_items_rel_campaign_idx ON wishlist_items_rel (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wishlist_items_rel_emergency_idx ON wishlist_items_rel (emergency, created_at DESC);

CREATE TABLE IF NOT EXISTS in_kind_pledges_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  wishlist_item_id BIGINT NOT NULL REFERENCES wishlist_items_rel(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  quantity_pledged INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pledged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS in_kind_pledges_rel_item_idx ON in_kind_pledges_rel (wishlist_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS in_kind_pledges_rel_user_idx ON in_kind_pledges_rel (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS volunteer_shifts_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  opportunity_id BIGINT REFERENCES volunteer_opportunities_rel(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES campaigns_rel(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  slots INTEGER NOT NULL DEFAULT 1,
  reminder_before_hours INTEGER NOT NULL DEFAULT 24,
  emergency BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS volunteer_shifts_rel_ngo_idx ON volunteer_shifts_rel (ngo_id, start_at);
CREATE INDEX IF NOT EXISTS volunteer_shifts_rel_campaign_idx ON volunteer_shifts_rel (campaign_id, start_at);
CREATE INDEX IF NOT EXISTS volunteer_shifts_rel_opportunity_idx ON volunteer_shifts_rel (opportunity_id, start_at);
CREATE INDEX IF NOT EXISTS volunteer_shifts_rel_emergency_idx ON volunteer_shifts_rel (emergency, start_at);

CREATE TABLE IF NOT EXISTS volunteer_shift_signups_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  shift_id BIGINT NOT NULL REFERENCES volunteer_shifts_rel(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'signed_up',
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL,
  UNIQUE (shift_id, user_id)
);
CREATE INDEX IF NOT EXISTS volunteer_shift_signups_rel_shift_idx ON volunteer_shift_signups_rel (shift_id, created_at DESC);
CREATE INDEX IF NOT EXISTS volunteer_shift_signups_rel_user_idx ON volunteer_shift_signups_rel (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS volunteer_logs_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  shift_signup_id BIGINT REFERENCES volunteer_shift_signups_rel(id) ON DELETE SET NULL,
  shift_id BIGINT REFERENCES volunteer_shifts_rel(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_by_ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS volunteer_logs_rel_ngo_idx ON volunteer_logs_rel (ngo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS volunteer_logs_rel_user_idx ON volunteer_logs_rel (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS volunteer_logs_rel_status_idx ON volunteer_logs_rel (approval_status, created_at DESC);

CREATE TABLE IF NOT EXISTS donor_notes_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT NOT NULL REFERENCES ngos_rel(id) ON DELETE CASCADE,
  donor_user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL DEFAULT '',
  created_by_ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS donor_notes_rel_ngo_donor_idx ON donor_notes_rel (ngo_id, donor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS donor_segments_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT NOT NULL REFERENCES ngos_rel(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL DEFAULT '',
  segment_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS donor_segments_rel_ngo_idx ON donor_segments_rel (ngo_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS donor_segments_rel_ngo_name_key ON donor_segments_rel (ngo_id, lower(segment_name));

CREATE TABLE IF NOT EXISTS donor_segment_members_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  segment_id BIGINT NOT NULL REFERENCES donor_segments_rel(id) ON DELETE CASCADE,
  donor_user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL,
  UNIQUE (segment_id, donor_user_id)
);
CREATE INDEX IF NOT EXISTS donor_segment_members_rel_segment_idx ON donor_segment_members_rel (segment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS donor_segment_members_rel_user_idx ON donor_segment_members_rel (donor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS impact_updates_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES campaigns_rel(id) ON DELETE SET NULL,
  donation_id BIGINT REFERENCES donations_rel(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  amount_utilized NUMERIC(14,2) NOT NULL DEFAULT 0,
  beneficiaries_reached INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS impact_updates_rel_campaign_idx ON impact_updates_rel (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS impact_updates_rel_ngo_idx ON impact_updates_rel (ngo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS impact_updates_rel_donation_idx ON impact_updates_rel (donation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS corporate_profiles_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  owner_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL DEFAULT '',
  match_ratio NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  cap_per_employee NUMERIC(14,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS corporate_profiles_rel_owner_idx ON corporate_profiles_rel (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS corporate_employee_links_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  corporate_profile_id BIGINT NOT NULL REFERENCES corporate_profiles_rel(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  employee_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL,
  UNIQUE (corporate_profile_id, user_id)
);
CREATE INDEX IF NOT EXISTS corporate_employee_links_rel_profile_idx ON corporate_employee_links_rel (corporate_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS corporate_employee_links_rel_user_idx ON corporate_employee_links_rel (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS corporate_matches_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  corporate_profile_id BIGINT REFERENCES corporate_profiles_rel(id) ON DELETE SET NULL,
  donation_id BIGINT REFERENCES donations_rel(id) ON DELETE SET NULL,
  employee_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  matched_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  approved_by_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS corporate_matches_rel_profile_idx ON corporate_matches_rel (corporate_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS corporate_matches_rel_employee_idx ON corporate_matches_rel (employee_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS corporate_matches_rel_status_idx ON corporate_matches_rel (status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_rewards_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT '',
  badge_key TEXT,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS user_rewards_rel_user_idx ON user_rewards_rel (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_rewards_rel_badge_idx ON user_rewards_rel (badge_key, created_at DESC);

CREATE TABLE IF NOT EXISTS volunteer_endorsements_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  application_id BIGINT REFERENCES volunteer_applications_rel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS volunteer_endorsements_rel_user_idx ON volunteer_endorsements_rel (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS volunteer_endorsements_rel_ngo_idx ON volunteer_endorsements_rel (ngo_id, created_at DESC);

COMMIT;
