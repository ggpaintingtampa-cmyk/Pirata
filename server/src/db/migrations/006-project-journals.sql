-- Journal entries reuse project-note ownership, translation, backup and trash support.
-- Every existing note retains its original data and remains a regular note.
ALTER TABLE project_notes ADD COLUMN note_kind TEXT NOT NULL DEFAULT 'note' CHECK (note_kind IN ('note', 'journal'));
