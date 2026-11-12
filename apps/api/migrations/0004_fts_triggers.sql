-- 0004_fts_triggers.sql

-- Add prev_state column to reviews_log for undo capability
ALTER TABLE reviews_log ADD COLUMN prev_state TEXT;

-- Triggers to synchronize sources_fts
CREATE TRIGGER IF NOT EXISTS sources_ai AFTER INSERT ON sources WHEN new.deleted = 0 BEGIN
  INSERT INTO sources_fts(id, name, author, content_text)
  VALUES (new.id, new.name, coalesce(new.author, ''), coalesce(new.content_html, ''));
END;

CREATE TRIGGER IF NOT EXISTS sources_ad AFTER DELETE ON sources BEGIN
  DELETE FROM sources_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS sources_au AFTER UPDATE ON sources BEGIN
  DELETE FROM sources_fts WHERE id = old.id;
  INSERT INTO sources_fts(id, name, author, content_text)
  SELECT new.id, new.name, coalesce(new.author, ''), coalesce(new.content_html, '')
  WHERE new.deleted = 0;
END;

-- Triggers to synchronize highlights_fts
CREATE TRIGGER IF NOT EXISTS highlights_ai AFTER INSERT ON highlights WHEN new.deleted = 0 BEGIN
  INSERT INTO highlights_fts(id, content, note)
  VALUES (new.id, new.content, coalesce(new.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS highlights_ad AFTER DELETE ON highlights BEGIN
  DELETE FROM highlights_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS highlights_au AFTER UPDATE ON highlights BEGIN
  DELETE FROM highlights_fts WHERE id = old.id;
  INSERT INTO highlights_fts(id, content, note)
  SELECT new.id, new.content, coalesce(new.note, '')
  WHERE new.deleted = 0;
END;

-- Populate FTS tables with existing data
INSERT OR IGNORE INTO sources_fts(id, name, author, content_text)
SELECT id, name, coalesce(author, ''), coalesce(content_html, '')
FROM sources
WHERE deleted = 0;

INSERT OR IGNORE INTO highlights_fts(id, content, note)
SELECT id, content, coalesce(note, '')
FROM highlights
WHERE deleted = 0;

