-- v4 (2026-09-29): visitor analytics for Ariv's dashboard.
-- Run once in the Supabase SQL editor. Safe to re-run. Additive only.

-- 1. Page visits, link clicks and call starts (first-party; no raw IPs, no cookies).
CREATE TABLE IF NOT EXISTS site_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,             -- visit | click | call_start
  visitor_id TEXT,                -- random id from the visitor's browser (null in EEA/UK/CH or with GPC/DNT)
  session_id TEXT,                -- the call, for call_start and in-call clicks
  label TEXT,                     -- which link was clicked
  target TEXT,                    -- the clicked link's host
  path TEXT,
  referrer TEXT,                  -- host + path only, never the query string
  utm JSONB,
  language TEXT,
  country TEXT, region TEXT, city TEXT, timezone TEXT,
  device TEXT, browser TEXT, os TEXT,
  network_org TEXT, network_domain TEXT, network_asn TEXT, network_host TEXT, network_kind TEXT,
  is_owner BOOLEAN NOT NULL DEFAULT false,  -- Ariv's own browser/account
  is_bot BOOLEAN NOT NULL DEFAULT false     -- crawlers, scripts, headless test browsers
);
CREATE INDEX IF NOT EXISTS site_events_created_idx ON site_events (created_at DESC);
CREATE INDEX IF NOT EXISTS site_events_visitor_idx ON site_events (visitor_id);
CREATE INDEX IF NOT EXISTS site_events_session_idx ON site_events (session_id);
-- Server-only (service role); the public anon key can't read or write it.
ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;

-- 2. Per-call analytics.
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS caller_role TEXT;  -- what the caller said they do
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS hiring_for TEXT;   -- role they're hiring for, if said
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS questions TEXT[];  -- what the caller said, line by line
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS duration_s INT;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS context JSONB;     -- location, network, device, source
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS call_summaries_visitor_idx ON call_summaries (visitor_id);
