-- 0005_core_parity.sql
-- Migration for Screvi Core Parity: Email Digest, Newsletter Inbox, RSS Feeds, Public Shares, Semantic Embeddings, Integrations

CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  digest_enabled INTEGER NOT NULL DEFAULT 0,
  digest_email TEXT,
  digest_hour_utc INTEGER NOT NULL DEFAULT 8,
  digest_count INTEGER NOT NULL DEFAULT 5,
  resend_api_key TEXT,
  from_email TEXT,
  last_digest_sent_date TEXT,
  last_digest_sent_at TEXT,
  newsletter_secret TEXT,
  telegram_bot_token TEXT,
  telegram_webhook_secret TEXT,
  telegram_allowed_chat_id TEXT,
  notion_token TEXT,
  notion_database_id TEXT,
  gemini_api_key TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO user_settings (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rss_feeds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  site_url TEXT,
  last_fetched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public_shares (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL, -- 'highlight' | 'source'
  target_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_shares_slug ON public_shares(slug, is_active);
CREATE INDEX IF NOT EXISTS idx_public_shares_target ON public_shares(target_type, target_id, is_active);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL DEFAULT 'highlight', -- 'highlight' | 'source'
  embedding TEXT NOT NULL,
  model TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_embeddings_type_model ON embeddings(target_type, model);
