BEGIN;

CREATE TABLE IF NOT EXISTS webhook_deliveries_rel (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  target_url TEXT,
  delivery_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER,
  failure_reason TEXT,
  next_retry_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_rel_status_idx
  ON webhook_deliveries_rel (status, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_rel_event_idx
  ON webhook_deliveries_rel (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_rel_retry_idx
  ON webhook_deliveries_rel (next_retry_at) WHERE next_retry_at IS NOT NULL;

COMMIT;
