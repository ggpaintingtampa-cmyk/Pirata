-- Version 3 (update 2026-09-25): four roles, three-level tasks with completion records, day lists, questions,
-- day notes, project lifecycle + sales fields + facts, work shifts + pay rates, material requests, tool sign-outs,
-- broken reports, per-user cleanup cycles, nested templates, file tags + comments, user locale.

-- team_members: roles + locale (rebuild; a CHECK constraint cannot change in place)
CREATE TABLE team_members_new (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE, role TEXT NOT NULL CHECK(role IN ('owner','manager','sales','worker')), password_hash TEXT NOT NULL, disabled_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, locale TEXT NOT NULL DEFAULT 'en' CHECK(locale IN ('en','es')), UNIQUE(owner_id,id)) STRICT;
INSERT INTO team_members_new (id,owner_id,name,username,role,password_hash,disabled_at,created_at,updated_at) SELECT id,owner_id,name,username,CASE role WHEN 'employee' THEN 'worker' ELSE role END,password_hash,disabled_at,created_at,updated_at FROM team_members;
DROP TRIGGER owners_team_insert;
DROP TRIGGER owners_team_password;
DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;
CREATE TRIGGER owners_team_insert AFTER INSERT ON owners BEGIN INSERT INTO team_members (id,owner_id,name,username,role,password_hash,disabled_at,created_at,updated_at) VALUES (NEW.id,NEW.id,'Owner',CASE WHEN EXISTS(SELECT 1 FROM team_members WHERE username='owner') THEN 'owner-'||NEW.id ELSE 'owner' END,'owner',NEW.password_hash,NULL,NEW.created_at,NEW.updated_at); END;
CREATE TRIGGER owners_team_password AFTER UPDATE OF password_hash ON owners BEGIN UPDATE team_members SET password_hash=NEW.password_hash,updated_at=NEW.updated_at WHERE id=NEW.id; END;

-- tasks: description, order, completion record (depth <= 3 is enforced in code)
ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK(length(description) BETWEEN 0 AND 300);
ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 100000);
ALTER TABLE tasks ADD COLUMN completed_at INTEGER CHECK(completed_at IS NULL OR completed_at BETWEEN 0 AND 9007199254740991);
ALTER TABLE tasks ADD COLUMN completed_by TEXT REFERENCES team_members(id);
UPDATE tasks SET completed_at=updated_at WHERE status='done';
UPDATE tasks SET position=(SELECT count(*) FROM tasks t2 WHERE t2.owner_id=tasks.owner_id AND coalesce(t2.parent_task_id,'')=coalesce(tasks.parent_task_id,'') AND coalesce(t2.project_id,'')=coalesce(tasks.project_id,'') AND (t2.created_at<tasks.created_at OR (t2.created_at=tasks.created_at AND t2.id<tasks.id)));

-- day lists (replace daily_goals; daily_goals stays but is no longer written by the app)
CREATE TABLE day_assignments (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, date TEXT NOT NULL CHECK(length(date)=10), project_id TEXT NOT NULL, task_id TEXT, user_id TEXT REFERENCES team_members(id), position INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id), FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id), CHECK(task_id IS NOT NULL OR user_id IS NOT NULL)) STRICT;
CREATE INDEX day_assignments_date_idx ON day_assignments(owner_id,date);
INSERT INTO day_assignments (id,owner_id,created_at,updated_at,date,project_id,task_id,user_id,position,created_by) SELECT g.id,g.owner_id,g.created_at,g.updated_at,g.date,t.project_id,g.task_id,g.user_id,g.position,g.user_id FROM daily_goals g JOIN tasks t ON t.owner_id=g.owner_id AND t.id=g.task_id WHERE t.project_id IS NOT NULL;

CREATE TABLE task_questions (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, task_id TEXT NOT NULL, project_id TEXT NOT NULL, asked_by TEXT NOT NULL REFERENCES team_members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), answered_at INTEGER, answered_by TEXT REFERENCES team_members(id), answer TEXT NOT NULL DEFAULT '' CHECK(length(answer) BETWEEN 0 AND 2000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)) STRICT;
CREATE TABLE day_notes (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), date TEXT NOT NULL CHECK(length(date)=10), body TEXT NOT NULL CHECK(length(body) BETWEEN 0 AND 4000), PRIMARY KEY(owner_id,id), UNIQUE(owner_id,user_id,date)) STRICT;

-- templates: nested tree JSON (titles stays for the old flat templates)
ALTER TABLE task_templates ADD COLUMN tree TEXT CHECK(tree IS NULL OR json_valid(tree));
CREATE TABLE project_templates (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160), note TEXT NOT NULL DEFAULT '', tree TEXT NOT NULL CHECK(json_valid(tree)), created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id)) STRICT;

-- projects: lifecycle + sales fields (rebuild)
CREATE TABLE projects_new (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  client_id TEXT,
  client_name TEXT NOT NULL CHECK(length(client_name) BETWEEN 0 AND 100),
  address TEXT NOT NULL CHECK(length(address) BETWEEN 0 AND 300),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  status TEXT NOT NULL CHECK(status IN ('draft','sold','scheduled','completed')),
  start_date TEXT CHECK(start_date IS NULL OR length(start_date)=10),
  end_date TEXT CHECK(end_date IS NULL OR length(end_date)=10),
  sales_price_cents INTEGER CHECK(sales_price_cents IS NULL OR sales_price_cents BETWEEN 0 AND 9007199254740991),
  materials_price_cents INTEGER CHECK(materials_price_cents IS NULL OR materials_price_cents BETWEEN 0 AND 9007199254740991),
  labor_price_cents INTEGER CHECK(labor_price_cents IS NULL OR labor_price_cents BETWEEN 0 AND 9007199254740991),
  sales_note TEXT NOT NULL DEFAULT '' CHECK(length(sales_note) BETWEEN 0 AND 4000),
  sales_rep_id TEXT REFERENCES team_members(id),
  review_note TEXT NOT NULL DEFAULT '' CHECK(length(review_note) BETWEEN 0 AND 1000),
  sold_at INTEGER,
  scheduled_at INTEGER,
  completed_at INTEGER,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,client_id) REFERENCES clients(owner_id,id)
) STRICT;
INSERT INTO projects_new (id,owner_id,created_at,updated_at,name,client_id,client_name,address,note,status) SELECT id,owner_id,created_at,updated_at,name,client_id,client_name,address,note,CASE status WHEN 'open' THEN 'scheduled' ELSE status END FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;
CREATE INDEX projects_client_id_idx ON projects(owner_id,client_id);
CREATE INDEX projects_order_idx ON projects(owner_id,created_at,id);

CREATE TABLE project_facts (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, project_id TEXT NOT NULL, key TEXT NOT NULL CHECK(key IN ('client_phone','gate_code','address','paint','store_job_name','client_company','company_contact','custom')), label TEXT NOT NULL CHECK(length(label) BETWEEN 0 AND 80), value TEXT NOT NULL CHECK(length(value) BETWEEN 0 AND 1000), worker_visible INTEGER NOT NULL DEFAULT 1 CHECK(worker_visible IN (0,1)), position INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)) STRICT;

-- work hours and pay
CREATE TABLE pay_rates (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), kind TEXT NOT NULL CHECK(kind IN ('hourly','daily')), amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 0 AND 9007199254740991), effective_from TEXT NOT NULL CHECK(length(effective_from)=10), created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), UNIQUE(owner_id,user_id,effective_from)) STRICT;
CREATE TABLE work_shifts (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), project_id TEXT NOT NULL, date TEXT NOT NULL CHECK(length(date)=10), kind TEXT NOT NULL CHECK(kind IN ('hours','day')), start_minute INTEGER CHECK(start_minute IS NULL OR start_minute BETWEEN 0 AND 1439), end_minute INTEGER CHECK(end_minute IS NULL OR end_minute BETWEEN 1 AND 1440), break_minutes INTEGER NOT NULL DEFAULT 0 CHECK(break_minutes BETWEEN 0 AND 600), days_minor INTEGER CHECK(days_minor IS NULL OR days_minor IN (25,50,75,100,150,200)), minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440), note TEXT NOT NULL DEFAULT '' CHECK(length(note) BETWEEN 0 AND 1000), status TEXT NOT NULL CHECK(status IN ('submitted','approved','rejected')), submitted_by TEXT NOT NULL REFERENCES team_members(id), approved_by TEXT REFERENCES team_members(id), approved_at INTEGER, decision_note TEXT NOT NULL DEFAULT '' CHECK(length(decision_note) BETWEEN 0 AND 1000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id), CHECK((kind='hours' AND start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute>start_minute AND days_minor IS NULL) OR (kind='day' AND days_minor IS NOT NULL AND start_minute IS NULL AND end_minute IS NULL))) STRICT;
CREATE INDEX work_shifts_date_idx ON work_shifts(owner_id,date);
CREATE INDEX work_shifts_user_idx ON work_shifts(owner_id,user_id);

-- material requests (shopping_items keeps its name; the UI calls them material requests)
ALTER TABLE shopping_items ADD COLUMN quantity TEXT NOT NULL DEFAULT '' CHECK(length(quantity) BETWEEN 0 AND 80);
ALTER TABLE shopping_items ADD COLUMN task_id TEXT;
ALTER TABLE shopping_items ADD COLUMN for_user_id TEXT REFERENCES team_members(id);
ALTER TABLE shopping_items ADD COLUMN received_at INTEGER;
ALTER TABLE shopping_items ADD COLUMN received_by TEXT REFERENCES team_members(id);
ALTER TABLE shopping_items ADD COLUMN archived_at INTEGER;
UPDATE shopping_items SET received_at=checked_at WHERE checked_at IS NOT NULL;

-- tools
ALTER TABLE equipment ADD COLUMN requires_sign_out INTEGER NOT NULL DEFAULT 0 CHECK(requires_sign_out IN (0,1));
ALTER TABLE equipment ADD COLUMN status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','broken'));
CREATE TABLE tool_sign_outs (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, equipment_id TEXT NOT NULL, taken_by TEXT NOT NULL REFERENCES team_members(id), taken_at INTEGER NOT NULL, project_id TEXT, returned_at INTEGER, returned_by TEXT REFERENCES team_members(id), note TEXT NOT NULL DEFAULT '' CHECK(length(note) BETWEEN 0 AND 1000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id), CHECK(returned_at IS NULL OR returned_at>=taken_at)) STRICT;
CREATE UNIQUE INDEX tool_sign_outs_open ON tool_sign_outs(owner_id,equipment_id) WHERE returned_at IS NULL;
CREATE TABLE equipment_reports (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, equipment_id TEXT NOT NULL, reported_by TEXT NOT NULL REFERENCES team_members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), attachment_id TEXT, resolved_at INTEGER, resolved_by TEXT REFERENCES team_members(id), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id), FOREIGN KEY(owner_id,attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
ALTER TABLE cleanup_obligations ADD COLUMN completed_by TEXT REFERENCES team_members(id);
DROP INDEX cleanup_open_cycle;
CREATE UNIQUE INDEX cleanup_open_cycle ON cleanup_obligations(owner_id,equipment_id,user_id) WHERE completed_at IS NULL;

-- files
CREATE TABLE attachment_tags (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attachment_id TEXT NOT NULL, tag TEXT NOT NULL CHECK(length(tag) BETWEEN 1 AND 40), created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), UNIQUE(owner_id,attachment_id,tag), FOREIGN KEY(owner_id,attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
CREATE TABLE attachment_comments (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attachment_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
