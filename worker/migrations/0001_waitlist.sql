CREATE TABLE IF NOT EXISTS waitlist_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_source_page TEXT,
  first_landing_path TEXT,
  first_placement TEXT,
  first_utm_source TEXT,
  first_utm_medium TEXT,
  first_utm_campaign TEXT,
  first_utm_content TEXT,
  first_utm_term TEXT,
  first_request_origin TEXT,
  first_request_referrer_origin TEXT,
  last_source_page TEXT,
  last_landing_path TEXT,
  last_placement TEXT,
  last_utm_source TEXT,
  last_utm_medium TEXT,
  last_utm_campaign TEXT,
  last_utm_content TEXT,
  last_utm_term TEXT,
  last_request_origin TEXT,
  last_request_referrer_origin TEXT,
  signup_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waitlist_rate_limits (
  bucket_start INTEGER NOT NULL,
  client_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket_start, client_key)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_last_seen_at
  ON waitlist_signups (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_last_seen_at
  ON waitlist_rate_limits (last_seen_at);
