-- 0003_screvi_full_features.sql

-- Add reading statuses: 'want_to_read', 'reading', 'read', 'inbox', 'later', 'archive'
-- Add source notes to sources
ALTER TABLE sources ADD COLUMN source_notes TEXT;

-- Custom Review sessions log
CREATE TABLE IF NOT EXISTS custom_reviews (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  highlight_ids TEXT NOT NULL, -- JSON array of highlight IDs
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Library Tools execution log
CREATE TABLE IF NOT EXISTS tools_log (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  affected_count INTEGER NOT NULL DEFAULT 0,
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

