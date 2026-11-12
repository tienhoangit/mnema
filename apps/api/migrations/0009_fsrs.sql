-- 0009_fsrs.sql: Add nullable FSRS scheduling columns to highlights for seamless SM-2 -> FSRS migration

ALTER TABLE highlights ADD COLUMN fsrs_state INTEGER;
ALTER TABLE highlights ADD COLUMN fsrs_stability REAL;
ALTER TABLE highlights ADD COLUMN fsrs_difficulty REAL;
ALTER TABLE highlights ADD COLUMN fsrs_reps INTEGER;
ALTER TABLE highlights ADD COLUMN fsrs_lapses INTEGER;
ALTER TABLE highlights ADD COLUMN fsrs_last_review TEXT;

