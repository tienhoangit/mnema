-- 0001_initial.sql

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  type TEXT NOT NULL DEFAULT 'article',
  url TEXT,
  image_url TEXT,
  content_html TEXT,
  reading_status TEXT NOT NULL DEFAULT 'inbox',
  progress REAL DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  reading_time INTEGER DEFAULT 0,
  metadata TEXT,
  deleted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  note TEXT,
  color TEXT DEFAULT 'yellow',
  location TEXT,
  favorite INTEGER DEFAULT 0,
  is_in_review_queue INTEGER DEFAULT 1,
  review_count INTEGER DEFAULT 0,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  next_review_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#115e59',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS highlight_tags (
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, tag_id)
);

CREATE TABLE IF NOT EXISTS reviews_log (
  id TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS streak (
  id TEXT PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_active_date TEXT
);

INSERT OR IGNORE INTO streak (id, current_streak, longest_streak, last_active_date)
VALUES ('default', 0, 0, NULL);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(reading_status, deleted);
CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_highlights_source ON highlights(source_id, deleted);
CREATE INDEX IF NOT EXISTS idx_highlights_review ON highlights(is_in_review_queue, next_review_at, deleted);
CREATE INDEX IF NOT EXISTS idx_highlights_favorite ON highlights(favorite, deleted);
