-- Update 2026-09-29. Additive only: new tables, nullable or defaulted columns. No historical value is rewritten.
-- Every column added to a table that readSnapshot returns is also listed in its DTO schema in packages/contracts,
-- because the web client parses the snapshot with strict schemas (template `version` below).

-- P13: translation cache. One row per (record, field, target language); the source hash decides freshness.
CREATE TABLE translations (
  owner_id TEXT NOT NULL REFERENCES owners(id),
  record_kind TEXT NOT NULL CHECK(length(record_kind) BETWEEN 1 AND 40),
  record_id TEXT NOT NULL CHECK(length(record_id) BETWEEN 1 AND 100),
  field TEXT NOT NULL CHECK(length(field) BETWEEN 1 AND 80),
  target_locale TEXT NOT NULL CHECK(target_locale IN ('en','es')),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
  source_locale TEXT NOT NULL CHECK(source_locale IN ('en','es','mixed','unknown')),
  text TEXT NOT NULL CHECK(length(text) BETWEEN 0 AND 8000),
  status TEXT NOT NULL CHECK(status IN ('ready','corrected','failed')),
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 80),
  glossary_version INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 100),
  corrected_by TEXT REFERENCES team_members(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,record_kind,record_id,field,target_locale)
) STRICT;
CREATE INDEX translations_record_idx ON translations(owner_id,record_kind,record_id);
-- P13: a stated source language for one field when detection was wrong or unsure.
CREATE TABLE translation_source_locales (
  owner_id TEXT NOT NULL REFERENCES owners(id),
  record_kind TEXT NOT NULL CHECK(length(record_kind) BETWEEN 1 AND 40),
  record_id TEXT NOT NULL CHECK(length(record_id) BETWEEN 1 AND 100),
  field TEXT NOT NULL CHECK(length(field) BETWEEN 1 AND 80),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
  locale TEXT NOT NULL CHECK(locale IN ('en','es')),
  set_by TEXT NOT NULL REFERENCES team_members(id), created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,record_kind,record_id,field)
) STRICT;
-- P13: owner-reviewed trade glossary. Saving a row bumps translation_settings.glossary_version and cache_epoch.
CREATE TABLE translation_glossary (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100), owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  en TEXT NOT NULL CHECK(length(en) BETWEEN 1 AND 80), es TEXT NOT NULL CHECK(length(es) BETWEEN 1 AND 80),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) BETWEEN 0 AND 300), created_by TEXT NOT NULL REFERENCES team_members(id),
  deleted_at INTEGER, deleted_by TEXT REFERENCES team_members(id), deleted_with TEXT,
  PRIMARY KEY(owner_id,id)
) STRICT;
CREATE UNIQUE INDEX translation_glossary_en ON translation_glossary(owner_id,en COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE translation_settings (
  owner_id TEXT PRIMARY KEY REFERENCES owners(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  provider TEXT NOT NULL DEFAULT 'openai' CHECK(provider IN ('openai','none')),
  model TEXT NOT NULL DEFAULT '' CHECK(length(model) BETWEEN 0 AND 100),
  daily_requests INTEGER NOT NULL DEFAULT 0 CHECK(daily_requests BETWEEN 0 AND 10000),
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_budget_cents BETWEEN 0 AND 100000),
  input_cents_per_million INTEGER NOT NULL DEFAULT 0 CHECK(input_cents_per_million BETWEEN 0 AND 100000),
  output_cents_per_million INTEGER NOT NULL DEFAULT 0 CHECK(output_cents_per_million BETWEEN 0 AND 100000),
  glossary_version INTEGER NOT NULL DEFAULT 0,
  cache_epoch INTEGER NOT NULL DEFAULT 0,
  backfill_cursor TEXT
) STRICT;
-- Separate allowances per AI feature. Existing rows are Ask.
ALTER TABLE ai_usage ADD COLUMN kind TEXT NOT NULL DEFAULT 'ask' CHECK(kind IN ('ask','order','translation'));
-- P02: materials, tools and preparation notes copied from a template into a task. Cascades with the task into the Trash.
CREATE TABLE task_requirements (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100), owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('material','tool','note')),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  material_id TEXT, equipment_id TEXT,
  quantity TEXT NOT NULL DEFAULT '' CHECK(length(quantity) BETWEEN 0 AND 80),
  unit TEXT NOT NULL DEFAULT '' CHECK(length(unit) BETWEEN 0 AND 20),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) BETWEEN 0 AND 1000),
  position INTEGER NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1000),
  source_template_id TEXT, source_template_version INTEGER,
  deleted_at INTEGER, deleted_by TEXT REFERENCES team_members(id), deleted_with TEXT,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id),
  FOREIGN KEY(owner_id,material_id) REFERENCES materials(owner_id,id),
  FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id)
) STRICT;
CREATE INDEX task_requirements_task_idx ON task_requirements(owner_id,task_id);
-- P02: templates become editable; the version travels into copied requirements.
ALTER TABLE task_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE project_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
-- P03/P09/P12: audit of batch operations. The summary holds counts and ids only, never text.
CREATE TABLE batch_operations (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100), owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id),
  kind TEXT NOT NULL CHECK(kind IN ('task.bulkCopy','record.bulkDelete','record.bulkRestore','task.applyOrder')),
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  PRIMARY KEY(owner_id,id)
) STRICT;
-- P10: server-to-server credentials for the Camino work feed. The plaintext is shown once and never stored.
CREATE TABLE integration_tokens (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100), owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  subject_user_id TEXT NOT NULL REFERENCES team_members(id),
  scopes TEXT NOT NULL CHECK(json_valid(scopes)),
  created_by TEXT NOT NULL REFERENCES team_members(id),
  last_used_at INTEGER, revoked_at INTEGER,
  PRIMARY KEY(owner_id,id)
) STRICT;
