BEGIN;

CREATE OR REPLACE FUNCTION safe_timestamptz(value_text text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value_text IS NULL OR btrim(value_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN value_text::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION safe_numeric(value_text text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value_text IS NULL OR btrim(value_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN value_text::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION safe_int(value_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value_text IS NULL OR btrim(value_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN value_text::integer;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION safe_bool(value_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value_text IS NULL OR btrim(value_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN value_text::boolean;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION jsonb_text_array(input jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(value), ARRAY[]::text[])
  FROM jsonb_array_elements_text(COALESCE(input, '[]'::jsonb)) AS t(value);
$$;

DROP TABLE IF EXISTS opportunity_applicants_rel CASCADE;
DROP TABLE IF EXISTS campaign_volunteer_registrations_rel CASCADE;
DROP TABLE IF EXISTS campaign_volunteers_rel CASCADE;
DROP TABLE IF EXISTS ngo_categories_rel CASCADE;
DROP TABLE IF EXISTS certificates_rel CASCADE;
DROP TABLE IF EXISTS volunteer_applications_rel CASCADE;
DROP TABLE IF EXISTS donations_rel CASCADE;
DROP TABLE IF EXISTS volunteer_opportunities_rel CASCADE;
DROP TABLE IF EXISTS campaigns_rel CASCADE;
DROP TABLE IF EXISTS categories_rel CASCADE;
DROP TABLE IF EXISTS messages_rel CASCADE;
DROP TABLE IF EXISTS notifications_rel CASCADE;
DROP TABLE IF EXISTS help_requests_rel CASCADE;
DROP TABLE IF EXISTS flag_requests_rel CASCADE;
DROP TABLE IF EXISTS ai_logs_rel CASCADE;
DROP TABLE IF EXISTS ngos_rel CASCADE;
DROP TABLE IF EXISTS users_rel CASCADE;

CREATE TABLE users_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  mobile_number TEXT,
  password TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'ngo', 'admin')),
  interests TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  location TEXT,
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  availability TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE UNIQUE INDEX users_rel_email_key ON users_rel (lower(email))
WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE INDEX users_rel_role_idx ON users_rel (role);

CREATE TABLE ngos_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  password TEXT,
  role TEXT,
  category TEXT,
  categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  description TEXT,
  about TEXT,
  registration_id TEXT,
  helpline_number TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  address TEXT,
  geographies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  offices TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  primary_sectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  secondary_sectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  socials JSONB NOT NULL DEFAULT '{}'::jsonb,
  registration JSONB NOT NULL DEFAULT '{}'::jsonb,
  address_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  financials JSONB NOT NULL DEFAULT '{}'::jsonb,
  programs JSONB NOT NULL DEFAULT '[]'::jsonb,
  testimonials JSONB NOT NULL DEFAULT '[]'::jsonb,
  leadership JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE UNIQUE INDEX ngos_rel_email_key ON ngos_rel (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX ngos_rel_verified_active_idx ON ngos_rel (verified, is_active);
CREATE INDEX ngos_rel_category_idx ON ngos_rel (category);

CREATE TABLE categories_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_by_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE UNIQUE INDEX categories_rel_name_key ON categories_rel (lower(name))
WHERE name IS NOT NULL AND btrim(name) <> '';

CREATE TABLE campaigns_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  image TEXT,
  gallery TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  video_url TEXT,
  category TEXT,
  location TEXT,
  area TEXT,
  coordinates_lat DOUBLE PRECISION,
  coordinates_lng DOUBLE PRECISION,
  goal_amount NUMERIC(14,2),
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  volunteers_needed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  highlights TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  timeline_start_date TIMESTAMPTZ,
  timeline_end_date TIMESTAMPTZ,
  beneficiary_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  coordinator JSONB NOT NULL DEFAULT '{}'::jsonb,
  recognitions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updates TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  testimonials JSONB NOT NULL DEFAULT '[]'::jsonb,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX campaigns_rel_ngo_idx ON campaigns_rel (ngo_id);
CREATE INDEX campaigns_rel_category_idx ON campaigns_rel (category);

CREATE TABLE volunteer_opportunities_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT,
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  commitment TEXT,
  date_start_date TIMESTAMPTZ,
  date_end_date TIMESTAMPTZ,
  spots INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX volunteer_opportunities_rel_ngo_idx ON volunteer_opportunities_rel (ngo_id);

CREATE TABLE donations_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES campaigns_rel(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_method TEXT NOT NULL DEFAULT 'upi',
  donor_name TEXT,
  donor_email TEXT,
  donor_phone TEXT,
  message TEXT,
  payment_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_id TEXT,
  gateway_provider TEXT,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  payment_verified_at TIMESTAMPTZ,
  receipt_number TEXT,
  receipt_issued_at TIMESTAMPTZ,
  certificate_approval_status TEXT NOT NULL DEFAULT 'not_requested',
  certificate_approval_requested_at TIMESTAMPTZ,
  certificate_approval_reviewed_at TIMESTAMPTZ,
  certificate_approval_note TEXT,
  certificate_approved_by_ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  certificate_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE UNIQUE INDEX donations_rel_receipt_key ON donations_rel (receipt_number) WHERE receipt_number IS NOT NULL;
CREATE INDEX donations_rel_user_idx ON donations_rel (user_id);
CREATE INDEX donations_rel_campaign_idx ON donations_rel (campaign_id);
CREATE INDEX donations_rel_ngo_idx ON donations_rel (ngo_id);

CREATE TABLE volunteer_applications_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  opportunity_id BIGINT REFERENCES volunteer_opportunities_rel(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  preferred_activities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  availability TEXT,
  motivation TEXT,
  assigned_task TEXT,
  status TEXT NOT NULL DEFAULT 'applied',
  certificate_approval_status TEXT NOT NULL DEFAULT 'not_requested',
  certificate_approval_requested_at TIMESTAMPTZ,
  certificate_approval_reviewed_at TIMESTAMPTZ,
  certificate_approval_note TEXT,
  certificate_approved_by_ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  activity_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  applied_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  certificate_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE UNIQUE INDEX volunteer_applications_rel_user_opp_key ON volunteer_applications_rel (user_id, opportunity_id) WHERE user_id IS NOT NULL AND opportunity_id IS NOT NULL;
CREATE INDEX volunteer_applications_rel_ngo_idx ON volunteer_applications_rel (ngo_id);

CREATE TABLE certificates_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES campaigns_rel(id) ON DELETE SET NULL,
  donation_id BIGINT REFERENCES donations_rel(id) ON DELETE SET NULL,
  volunteer_application_id BIGINT REFERENCES volunteer_applications_rel(id) ON DELETE SET NULL,
  certificate_type TEXT NOT NULL DEFAULT 'donation',
  title TEXT NOT NULL DEFAULT 'Certificate',
  certificate_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE UNIQUE INDEX certificates_rel_number_key ON certificates_rel (certificate_number)
WHERE certificate_number IS NOT NULL AND btrim(certificate_number) <> '';
CREATE INDEX certificates_rel_user_idx ON certificates_rel (user_id);

ALTER TABLE donations_rel
  ADD CONSTRAINT donations_rel_certificate_id_fkey
  FOREIGN KEY (certificate_id)
  REFERENCES certificates_rel(id)
  ON DELETE SET NULL;

ALTER TABLE volunteer_applications_rel
  ADD CONSTRAINT volunteer_applications_rel_certificate_id_fkey
  FOREIGN KEY (certificate_id)
  REFERENCES certificates_rel(id)
  ON DELETE SET NULL;

CREATE TABLE messages_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  from_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  to_ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX messages_rel_to_ngo_idx ON messages_rel (to_ngo_id, created_at DESC);

CREATE TABLE notifications_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'all',
  created_by_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX notifications_rel_audience_idx ON notifications_rel (audience, created_at DESC);

CREATE TABLE help_requests_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  ngo_id BIGINT REFERENCES ngos_rel(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  age INTEGER,
  location TEXT,
  help_type TEXT NOT NULL DEFAULT '',
  description TEXT,
  mobile_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX help_requests_rel_user_idx ON help_requests_rel (user_id, created_at DESC);
CREATE INDEX help_requests_rel_ngo_idx ON help_requests_rel (ngo_id, created_at DESC);

CREATE TABLE flag_requests_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  target_name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  resolved_by_user_id BIGINT REFERENCES users_rel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX flag_requests_rel_target_idx ON flag_requests_rel (target_type, target_id);

CREATE TABLE ai_logs_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  log_type TEXT,
  payload JSONB,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);
CREATE INDEX ai_logs_rel_type_idx ON ai_logs_rel (log_type, created_at DESC);

CREATE TABLE ngo_categories_rel (
  ngo_id BIGINT NOT NULL REFERENCES ngos_rel(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ngo_id, category_name)
);
CREATE INDEX ngo_categories_rel_category_idx ON ngo_categories_rel (category_name);

CREATE TABLE campaign_volunteers_rel (
  campaign_id BIGINT NOT NULL REFERENCES campaigns_rel(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX campaign_volunteers_rel_user_idx ON campaign_volunteers_rel (user_id);

CREATE TABLE campaign_volunteer_registrations_rel (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES campaigns_rel(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  preferred_activities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  availability TEXT,
  motivation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX campaign_volunteer_registrations_rel_campaign_idx ON campaign_volunteer_registrations_rel (campaign_id, created_at DESC);

CREATE TABLE opportunity_applicants_rel (
  opportunity_id BIGINT NOT NULL REFERENCES volunteer_opportunities_rel(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users_rel(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, user_id)
);
CREATE INDEX opportunity_applicants_rel_user_idx ON opportunity_applicants_rel (user_id);

COMMIT;
