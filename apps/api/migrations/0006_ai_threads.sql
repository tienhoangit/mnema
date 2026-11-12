-- 0006_ai_threads.sql - Multi-turn Ask AI threads and messages

CREATE TABLE IF NOT EXISTS ai_threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created ON ai_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_threads_highlight ON ai_threads(highlight_id);
