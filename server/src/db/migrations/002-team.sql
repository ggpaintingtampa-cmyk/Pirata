-- Version 2: one business, separate people. Preserve every existing business identity.
CREATE TABLE team_members (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE, role TEXT NOT NULL CHECK(role IN ('owner','employee')), password_hash TEXT NOT NULL, disabled_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner_id,id)) STRICT;
INSERT INTO team_members SELECT id,id,'Owner','owner','owner',password_hash,NULL,created_at,updated_at FROM owners;
CREATE TRIGGER owners_team_insert AFTER INSERT ON owners BEGIN INSERT INTO team_members VALUES(NEW.id,NEW.id,'Owner',CASE WHEN EXISTS(SELECT 1 FROM team_members WHERE username='owner') THEN 'owner-'||NEW.id ELSE 'owner' END,'owner',NEW.password_hash,NULL,NEW.created_at,NEW.updated_at); END;
CREATE TRIGGER owners_team_password AFTER UPDATE OF password_hash ON owners BEGIN UPDATE team_members SET password_hash=NEW.password_hash,updated_at=NEW.updated_at WHERE id=NEW.id; END;
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES team_members(id);
UPDATE sessions SET user_id=owner_id WHERE owner_id IS NOT NULL;
ALTER TABLE command_receipts ADD COLUMN user_id TEXT;
UPDATE command_receipts SET user_id=owner_id;
DROP TRIGGER timer_open_insert;
DROP TRIGGER timer_open_update;
DROP TRIGGER task_running_status;
DROP TRIGGER closed_not_running;
CREATE TABLE tasks_new (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  project_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes BETWEEN 0 AND 1440),
  status TEXT NOT NULL CHECK(status IN ('open','blocked','done')),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  parent_task_id TEXT,
  assignee_id TEXT,
  assignment_explicit INTEGER NOT NULL DEFAULT 0 CHECK(assignment_explicit IN (0,1)),
  archived_at INTEGER,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,parent_task_id) REFERENCES tasks(owner_id,id),
  FOREIGN KEY(owner_id,assignee_id) REFERENCES team_members(owner_id,id),
  FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)
) STRICT;

INSERT INTO tasks_new (id,owner_id,created_at,updated_at,project_id,title,estimated_minutes,status,note,assignee_id) SELECT id,owner_id,created_at,updated_at,project_id,title,estimated_minutes,status,note,owner_id FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_project_id_idx ON tasks(owner_id,project_id);
CREATE INDEX tasks_order_idx ON tasks(owner_id,created_at,id);
CREATE INDEX tasks_parent_idx ON tasks(owner_id,parent_task_id);
CREATE TABLE timers_new (owner_id TEXT NOT NULL REFERENCES owners(id),user_id TEXT NOT NULL REFERENCES team_members(id),session_id TEXT NOT NULL UNIQUE,task_id TEXT NOT NULL,started_at INTEGER NOT NULL CHECK(started_at BETWEEN 0 AND 9007199254740991),PRIMARY KEY(owner_id,user_id),FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id)) STRICT;
INSERT INTO timers_new SELECT owner_id,owner_id,session_id,task_id,started_at FROM running_timers;
DROP TABLE running_timers;
ALTER TABLE timers_new RENAME TO running_timers;
ALTER TABLE time_entries ADD COLUMN user_id TEXT REFERENCES team_members(id);
UPDATE time_entries SET user_id=owner_id;
ALTER TABLE equipment ADD COLUMN cleaning_minutes INTEGER;
ALTER TABLE equipment ADD COLUMN max_cleaning_delay_minutes INTEGER;
CREATE TABLE business_settings (owner_id TEXT PRIMARY KEY REFERENCES owners(id),workday_end_minute INTEGER NOT NULL DEFAULT 1020 CHECK(workday_end_minute BETWEEN 0 AND 1439)) STRICT;
CREATE TABLE ai_settings (owner_id TEXT PRIMARY KEY REFERENCES owners(id),enabled INTEGER NOT NULL DEFAULT 0,model TEXT NOT NULL DEFAULT '',daily_requests INTEGER NOT NULL DEFAULT 0,monthly_budget_cents INTEGER NOT NULL DEFAULT 0,input_cents_per_million INTEGER NOT NULL DEFAULT 0,output_cents_per_million INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE ai_usage (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES owners(id),user_id TEXT NOT NULL REFERENCES team_members(id),created_at INTEGER NOT NULL,status TEXT NOT NULL,reserved_cents INTEGER NOT NULL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,cost_cents INTEGER NOT NULL DEFAULT 0,response_json TEXT,UNIQUE(owner_id,id)) STRICT;
CREATE TABLE daily_goals (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,date TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES team_members(id),task_id TEXT NOT NULL,position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 2),PRIMARY KEY(owner_id,id),FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id),UNIQUE(owner_id,date,user_id,position),UNIQUE(owner_id,date,user_id,task_id)) STRICT;
CREATE TABLE task_templates (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,name TEXT NOT NULL,titles TEXT NOT NULL CHECK(json_valid(titles)),PRIMARY KEY(owner_id,id)) STRICT;
CREATE TABLE attachments (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,parent_type TEXT NOT NULL CHECK(parent_type IN ('task','project','client')),parent_id TEXT NOT NULL,name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,storage_key TEXT NOT NULL UNIQUE,preview_key TEXT,removed_at INTEGER,uploaded_by TEXT NOT NULL REFERENCES team_members(id),PRIMARY KEY(owner_id,id)) STRICT;
CREATE TABLE activity (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES team_members(id),project_id TEXT,task_id TEXT,kind TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner_id,id)) STRICT;
CREATE TABLE project_notes (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,project_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,product TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '',color_code TEXT NOT NULL DEFAULT '',finish TEXT NOT NULL DEFAULT '',quantity TEXT NOT NULL DEFAULT '',store TEXT NOT NULL DEFAULT '',label_attachment_id TEXT,created_by TEXT NOT NULL REFERENCES team_members(id),PRIMARY KEY(owner_id,id),FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id),FOREIGN KEY(owner_id,label_attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
CREATE TABLE shopping_items (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,project_id TEXT,source_note_id TEXT,checked_at INTEGER,created_by TEXT NOT NULL REFERENCES team_members(id),PRIMARY KEY(owner_id,id),FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id),FOREIGN KEY(owner_id,source_note_id) REFERENCES project_notes(owner_id,id)) STRICT;
CREATE TABLE cleanup_obligations (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,equipment_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES team_members(id),task_id TEXT,first_used_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,due_at INTEGER NOT NULL,cleaning_minutes INTEGER NOT NULL,completed_at INTEGER,CHECK(due_at<=deadline_at),PRIMARY KEY(owner_id,id),FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id),FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id)) STRICT;
CREATE TABLE cleanup_snoozes (id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES owners(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,obligation_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES team_members(id),from_due_at INTEGER NOT NULL,to_due_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id),FOREIGN KEY(owner_id,obligation_id) REFERENCES cleanup_obligations(owner_id,id)) STRICT;
CREATE UNIQUE INDEX cleanup_open_cycle ON cleanup_obligations(owner_id,equipment_id) WHERE completed_at IS NULL;

CREATE TRIGGER timer_open_insert BEFORE INSERT ON running_timers BEGIN
 SELECT CASE WHEN (SELECT status FROM tasks WHERE owner_id=NEW.owner_id AND id=NEW.task_id)!='open' THEN RAISE(ABORT,'timer task must be open') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM time_entries WHERE owner_id=NEW.owner_id AND id=NEW.session_id) THEN RAISE(ABORT,'session already closed') END;
END;
CREATE TRIGGER timer_open_update BEFORE UPDATE ON running_timers BEGIN
 SELECT CASE WHEN (SELECT status FROM tasks WHERE owner_id=NEW.owner_id AND id=NEW.task_id)!='open' THEN RAISE(ABORT,'timer task must be open') END;
END;
CREATE TRIGGER task_running_status BEFORE UPDATE OF status ON tasks WHEN NEW.status!='open' AND EXISTS(SELECT 1 FROM running_timers WHERE owner_id=NEW.owner_id AND task_id=NEW.id) BEGIN SELECT RAISE(ABORT,'close timer before task'); END;
CREATE TRIGGER closed_not_running BEFORE INSERT ON time_entries WHEN EXISTS(SELECT 1 FROM running_timers WHERE owner_id=NEW.owner_id AND session_id=NEW.id) BEGIN SELECT RAISE(ABORT,'close active session first'); END;
