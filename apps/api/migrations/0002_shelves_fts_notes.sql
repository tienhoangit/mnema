-- 0002_shelves_fts_notes.sql

-- Shelves / Collections
CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#115e59',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_shelves (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, shelf_id)
);

-- Daily reading activity log for GitHub-style Calendar Heatmap
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  activity_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  action_type TEXT NOT NULL,   -- 'read_article', 'created_highlight', 'completed_review'
  source_id TEXT,
  highlight_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(activity_date);
CREATE INDEX IF NOT EXISTS idx_source_shelves_shelf ON source_shelves(shelf_id);

-- Full Text Search virtual tables
CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
  id UNINDEXED,
  name,
  author,
  content_text,
  tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5(
  id UNINDEXED,
  content,
  note,
  tokenize = 'unicode61'
);

-- Prepopulate default shelves
INSERT OR IGNORE INTO shelves (id, name, color, description)
VALUES 
  ('shelf-tech', 'Technology & AI', '#0284c7', 'Articles on tech, coding, and artificial intelligence'),
  ('shelf-books', 'Favorite Books', '#d97706', 'High-impact books and long reads'),
  ('shelf-philosophy', 'Philosophy & Mindset', '#059669', 'Mental models and timeless wisdom');

