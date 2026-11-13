-- 0010_fts_ascii.sql
-- Recreate FTS5 tables with *_ascii columns and remove_diacritics 2 for Vietnamese accent-insensitive search

DROP TRIGGER IF EXISTS sources_ai;
DROP TRIGGER IF EXISTS sources_ad;
DROP TRIGGER IF EXISTS sources_au;
DROP TRIGGER IF EXISTS highlights_ai;
DROP TRIGGER IF EXISTS highlights_ad;
DROP TRIGGER IF EXISTS highlights_au;

DROP TABLE IF EXISTS sources_fts;
DROP TABLE IF EXISTS highlights_fts;

CREATE VIRTUAL TABLE sources_fts USING fts5(
  id UNINDEXED,
  name,
  author,
  content_text,
  title_ascii,
  author_ascii,
  content_ascii,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE highlights_fts USING fts5(
  id UNINDEXED,
  content,
  note,
  content_ascii,
  note_ascii,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Triggers to synchronize sources_fts
CREATE TRIGGER sources_ai AFTER INSERT ON sources WHEN new.deleted = 0 BEGIN
  INSERT INTO sources_fts(id, name, author, content_text, title_ascii, author_ascii, content_ascii)
  VALUES (
    new.id,
    new.name,
    coalesce(new.author, ''),
    coalesce(new.content_html, ''),
    replace(replace(new.name, 'đ', 'd'), 'Đ', 'D'),
    replace(replace(coalesce(new.author, ''), 'đ', 'd'), 'Đ', 'D'),
    replace(replace(coalesce(new.content_html, ''), 'đ', 'd'), 'Đ', 'D')
  );
END;

CREATE TRIGGER sources_ad AFTER DELETE ON sources BEGIN
  DELETE FROM sources_fts WHERE id = old.id;
END;

CREATE TRIGGER sources_au AFTER UPDATE ON sources BEGIN
  DELETE FROM sources_fts WHERE id = old.id;
  INSERT INTO sources_fts(id, name, author, content_text, title_ascii, author_ascii, content_ascii)
  SELECT
    new.id,
    new.name,
    coalesce(new.author, ''),
    coalesce(new.content_html, ''),
    replace(replace(new.name, 'đ', 'd'), 'Đ', 'D'),
    replace(replace(coalesce(new.author, ''), 'đ', 'd'), 'Đ', 'D'),
    replace(replace(coalesce(new.content_html, ''), 'đ', 'd'), 'Đ', 'D')
  WHERE new.deleted = 0;
END;

-- Triggers to synchronize highlights_fts
CREATE TRIGGER highlights_ai AFTER INSERT ON highlights WHEN new.deleted = 0 BEGIN
  INSERT INTO highlights_fts(id, content, note, content_ascii, note_ascii)
  VALUES (
    new.id,
    new.content,
    coalesce(new.note, ''),
    replace(replace(new.content, 'đ', 'd'), 'Đ', 'D'),
    replace(replace(coalesce(new.note, ''), 'đ', 'd'), 'Đ', 'D')
  );
END;

CREATE TRIGGER highlights_ad AFTER DELETE ON highlights BEGIN
  DELETE FROM highlights_fts WHERE id = old.id;
END;

CREATE TRIGGER highlights_au AFTER UPDATE ON highlights BEGIN
  DELETE FROM highlights_fts WHERE id = old.id;
  INSERT INTO highlights_fts(id, content, note, content_ascii, note_ascii)
  SELECT
    new.id,
    new.content,
    coalesce(new.note, ''),
    replace(replace(new.content, 'đ', 'd'), 'Đ', 'D'),
    replace(replace(coalesce(new.note, ''), 'đ', 'd'), 'Đ', 'D')
  WHERE new.deleted = 0;
END;

-- Backfill existing non-deleted sources and highlights
INSERT INTO sources_fts(id, name, author, content_text, title_ascii, author_ascii, content_ascii)
SELECT
  id,
  name,
  coalesce(author, ''),
  coalesce(content_html, ''),
  replace(replace(name, 'đ', 'd'), 'Đ', 'D'),
  replace(replace(coalesce(author, ''), 'đ', 'd'), 'Đ', 'D'),
  replace(replace(coalesce(content_html, ''), 'đ', 'd'), 'Đ', 'D')
FROM sources
WHERE deleted = 0;

INSERT INTO highlights_fts(id, content, note, content_ascii, note_ascii)
SELECT
  id,
  content,
  coalesce(note, ''),
  replace(replace(content, 'đ', 'd'), 'Đ', 'D'),
  replace(replace(coalesce(note, ''), 'đ', 'd'), 'Đ', 'D')
FROM highlights
WHERE deleted = 0;
