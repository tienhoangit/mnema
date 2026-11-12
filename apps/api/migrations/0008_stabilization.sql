-- 0008_stabilization.sql
-- Stabilization indexes, independent Telegram review tracking, and vector cleanup

-- Lookup & deduplication indexes
CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url) WHERE url IS NOT NULL AND deleted = 0;
CREATE INDEX IF NOT EXISTS idx_sources_name_type ON sources(name, type) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_highlights_source_content ON highlights(source_id, content) WHERE deleted = 0;

-- Track Telegram daily SM-2 review delivery independently from email digest
ALTER TABLE user_settings ADD COLUMN last_telegram_review_date TEXT;

-- Clean up any orphaned embedding rows from previously permanently-deleted highlights
DELETE FROM embeddings
WHERE target_type = 'highlight'
  AND id NOT IN (SELECT id FROM highlights);

