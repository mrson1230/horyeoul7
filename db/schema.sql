-- PostgreSQL schema for Apartment Shared Work Log
-- Automatically created on server startup when DATABASE_URL or POSTGRES_URL is configured.

CREATE TABLE IF NOT EXISTS apartments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  office_name TEXT NOT NULL,
  company_id TEXT NOT NULL UNIQUE,
  company_password TEXT NOT NULL,
  admin_password TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workers_apartment ON workers (apartment_id);

CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_role TEXT NOT NULL,
  work_date TEXT NOT NULL,
  location TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  photo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_logs_apartment_date ON work_logs (apartment_id, work_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notices_apartment ON notices (apartment_id, is_pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS handovers (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_role TEXT NOT NULL,
  target_shift TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_by TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_handovers_apartment ON handovers (apartment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_banners (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  event_location TEXT NOT NULL DEFAULT '',
  contact_info TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_banners_apartment ON event_banners (apartment_id, is_active DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions (last_seen_at);

CREATE TABLE IF NOT EXISTS external_ads (
  apartment_id TEXT PRIMARY KEY REFERENCES apartments(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'inquiry',
  sponsor_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '',
  contact_info TEXT NOT NULL DEFAULT '',
  adsense_client_id TEXT NOT NULL DEFAULT '',
  adsense_slot_id TEXT NOT NULL DEFAULT '',
  adfit_unit_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS global_ad_slot (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'inquiry',
  sponsor_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '',
  contact_info TEXT NOT NULL DEFAULT '',
  adsense_client_id TEXT NOT NULL DEFAULT '',
  adsense_slot_id TEXT NOT NULL DEFAULT '',
  adfit_unit_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);


