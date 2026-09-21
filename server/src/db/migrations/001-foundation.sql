-- Version 1: normalized, owner-scoped foundation. No destructive cascades.
CREATE TABLE owners (id TEXT PRIMARY KEY, singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(singleton=1), password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, owner_id TEXT REFERENCES owners(id), csrf_token TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>created_at)) STRICT;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE data_revisions (owner_id TEXT PRIMARY KEY REFERENCES owners(id), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)) STRICT;
CREATE TABLE command_receipts (owner_id TEXT NOT NULL REFERENCES owners(id), request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at INTEGER NOT NULL, PRIMARY KEY(owner_id,request_id)) STRICT;
CREATE TABLE auth_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL) STRICT;


CREATE TABLE clients (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 0 AND 100),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 0 AND 320),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  archived_at INTEGER CHECK(archived_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(owner_id,id)
) STRICT;

CREATE INDEX clients_order_idx ON clients(owner_id,created_at,id);

CREATE TABLE projects (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  client_id TEXT,
  client_name TEXT NOT NULL CHECK(length(client_name) BETWEEN 0 AND 100),
  address TEXT NOT NULL CHECK(length(address) BETWEEN 0 AND 300),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  status TEXT NOT NULL CHECK(status IN ('open','completed')),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,client_id) REFERENCES clients(owner_id,id)
) STRICT;

CREATE INDEX projects_client_id_idx ON projects(owner_id,client_id);

CREATE INDEX projects_order_idx ON projects(owner_id,created_at,id);

CREATE TABLE tasks (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  project_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes BETWEEN 1 AND 1440),
  status TEXT NOT NULL CHECK(status IN ('open','blocked','done')),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)
) STRICT;

CREATE INDEX tasks_project_id_idx ON tasks(owner_id,project_id);

CREATE INDEX tasks_order_idx ON tasks(owner_id,created_at,id);

CREATE TABLE objectives (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  date TEXT NOT NULL CHECK(length(date)=10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(date,1,4)>='0001' AND date(date,'+0 days') IS NOT NULL AND date(date,'+0 days')=date),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  task_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','partial','blocked','done')),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  rank INTEGER NOT NULL CHECK(rank BETWEEN 0 AND 2),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id),
  CHECK(status!='blocked' OR length(trim(note))>0),
  UNIQUE(owner_id,date,rank)
) STRICT;

CREATE INDEX objectives_task_id_idx ON objectives(owner_id,task_id);

CREATE INDEX objectives_order_idx ON objectives(owner_id,created_at,id);

CREATE TABLE schedule_blocks (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  date TEXT NOT NULL CHECK(length(date)=10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(date,1,4)>='0001' AND date(date,'+0 days') IS NOT NULL AND date(date,'+0 days')=date),
  start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
  kind TEXT NOT NULL CHECK(kind IN ('task','appointment','travel','supply_run','break','cleanup')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  task_id TEXT,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id),
  CHECK(end_minute>start_minute),
  CHECK((kind='task' AND task_id IS NOT NULL) OR (kind!='task' AND task_id IS NULL)),
  UNIQUE(owner_id,task_id)
) STRICT;

CREATE INDEX schedule_blocks_task_id_idx ON schedule_blocks(owner_id,task_id);

CREATE INDEX schedule_blocks_order_idx ON schedule_blocks(owner_id,created_at,id);

CREATE TABLE time_entries (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  task_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('timer','manual')),
  started_at INTEGER CHECK(started_at BETWEEN 0 AND 9007199254740991),
  ended_at INTEGER CHECK(ended_at BETWEEN 0 AND 9007199254740991),
  date TEXT CHECK(date IS NULL OR (length(date)=10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(date,1,4)>='0001' AND date(date,'+0 days') IS NOT NULL AND date(date,'+0 days')=date)),
  duration_seconds INTEGER CHECK(duration_seconds BETWEEN 60 AND 86400),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id),
  CHECK((source='timer' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at>started_at AND date IS NULL AND duration_seconds IS NULL) OR (source='manual' AND started_at IS NULL AND ended_at IS NULL AND date IS NOT NULL AND duration_seconds IS NOT NULL AND duration_seconds%60=0))
) STRICT;

CREATE INDEX time_entries_task_id_idx ON time_entries(owner_id,task_id);

CREATE INDEX time_entries_order_idx ON time_entries(owner_id,created_at,id);

CREATE TABLE running_timers (owner_id TEXT PRIMARY KEY REFERENCES owners(id), session_id TEXT NOT NULL CHECK(length(session_id) BETWEEN 1 AND 100), task_id TEXT NOT NULL, started_at INTEGER NOT NULL CHECK(started_at BETWEEN 0 AND 9007199254740991), FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id), UNIQUE(owner_id,session_id)) STRICT;

CREATE TABLE expenses (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  purchase_date TEXT NOT NULL CHECK(length(purchase_date)=10 AND purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(purchase_date,1,4)>='0001' AND date(purchase_date,'+0 days') IS NOT NULL AND date(purchase_date,'+0 days')=purchase_date),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK(category IN ('materials','tools','fuel','maintenance','other')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991),
  project_id TEXT,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)
) STRICT;

CREATE INDEX expenses_project_id_idx ON expenses(owner_id,project_id);

CREATE INDEX expenses_order_idx ON expenses(owner_id,created_at,id);

CREATE TABLE materials (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  product TEXT NOT NULL CHECK(length(product) BETWEEN 0 AND 160),
  color TEXT NOT NULL CHECK(length(color) BETWEEN 0 AND 160),
  finish TEXT NOT NULL CHECK(length(finish) BETWEEN 0 AND 160),
  unit TEXT NOT NULL CHECK(unit IN ('gal','piece')),
  stock_minor INTEGER NOT NULL CHECK(stock_minor BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(owner_id,id),
  CHECK(unit!='piece' OR stock_minor%100=0)
) STRICT;

CREATE INDEX materials_order_idx ON materials(owner_id,created_at,id);

CREATE TABLE material_requirements (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  material_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  needed_minor INTEGER NOT NULL CHECK(needed_minor BETWEEN 0 AND 9007199254740991),
  reserved_minor INTEGER NOT NULL CHECK(reserved_minor BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,material_id) REFERENCES materials(owner_id,id),
  FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id),
  CHECK(reserved_minor<=needed_minor),
  UNIQUE(owner_id,material_id,project_id)
) STRICT;

CREATE INDEX material_requirements_material_id_idx ON material_requirements(owner_id,material_id);

CREATE INDEX material_requirements_project_id_idx ON material_requirements(owner_id,project_id);

CREATE INDEX material_requirements_order_idx ON material_requirements(owner_id,created_at,id);

CREATE TABLE material_adjustments (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  material_id TEXT NOT NULL,
  delta_minor INTEGER NOT NULL CHECK(delta_minor BETWEEN -9007199254740991 AND 9007199254740991),
  reason TEXT NOT NULL CHECK(reason IN ('restock','usage','correction')),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,material_id) REFERENCES materials(owner_id,id),
  CHECK(delta_minor!=0)
) STRICT;

CREATE INDEX material_adjustments_material_id_idx ON material_adjustments(owner_id,material_id);

CREATE INDEX material_adjustments_order_idx ON material_adjustments(owner_id,created_at,id);

CREATE TABLE equipment (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000),
  archived_at INTEGER CHECK(archived_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(owner_id,id)
) STRICT;

CREATE INDEX equipment_order_idx ON equipment(owner_id,created_at,id);

CREATE TABLE maintenance_items (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  equipment_id TEXT,
  equipment_name TEXT NOT NULL CHECK(length(equipment_name) BETWEEN 1 AND 160),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  due_date TEXT NOT NULL CHECK(length(due_date)=10 AND due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(due_date,1,4)>='0001' AND date(due_date,'+0 days') IS NOT NULL AND date(due_date,'+0 days')=due_date),
  completed_at INTEGER CHECK(completed_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id)
) STRICT;

CREATE INDEX maintenance_items_equipment_id_idx ON maintenance_items(owner_id,equipment_id);

CREATE INDEX maintenance_items_order_idx ON maintenance_items(owner_id,created_at,id);

CREATE TABLE leads (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 0 AND 100),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 0 AND 320),
  work_description TEXT NOT NULL CHECK(length(work_description) BETWEEN 1 AND 160),
  next_follow_up_date TEXT CHECK(next_follow_up_date IS NULL OR (length(next_follow_up_date)=10 AND next_follow_up_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(next_follow_up_date,1,4)>='0001' AND date(next_follow_up_date,'+0 days') IS NOT NULL AND date(next_follow_up_date,'+0 days')=next_follow_up_date)),
  converted_client_id TEXT,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,converted_client_id) REFERENCES clients(owner_id,id)
) STRICT;

CREATE INDEX leads_converted_client_id_idx ON leads(owner_id,converted_client_id);

CREATE INDEX leads_order_idx ON leads(owner_id,created_at,id);

CREATE TABLE lead_follow_ups (
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  lead_id TEXT NOT NULL,
  at INTEGER NOT NULL CHECK(at BETWEEN 0 AND 9007199254740991),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 1 AND 1000),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,lead_id) REFERENCES leads(owner_id,id)
) STRICT;

CREATE INDEX lead_follow_ups_lead_id_idx ON lead_follow_ups(owner_id,lead_id);

CREATE INDEX lead_follow_ups_order_idx ON lead_follow_ups(owner_id,created_at,id);


CREATE TRIGGER timer_open_insert BEFORE INSERT ON running_timers BEGIN
 SELECT CASE WHEN (SELECT status FROM tasks WHERE owner_id=NEW.owner_id AND id=NEW.task_id)!='open' THEN RAISE(ABORT,'timer task must be open') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM time_entries WHERE owner_id=NEW.owner_id AND id=NEW.session_id) THEN RAISE(ABORT,'session already closed') END;
END;
CREATE TRIGGER timer_open_update BEFORE UPDATE ON running_timers BEGIN
 SELECT CASE WHEN (SELECT status FROM tasks WHERE owner_id=NEW.owner_id AND id=NEW.task_id)!='open' THEN RAISE(ABORT,'timer task must be open') END;
END;
CREATE TRIGGER task_running_status BEFORE UPDATE OF status ON tasks WHEN NEW.status!='open' AND EXISTS(SELECT 1 FROM running_timers WHERE owner_id=NEW.owner_id AND task_id=NEW.id) BEGIN SELECT RAISE(ABORT,'close timer before task'); END;
CREATE TRIGGER closed_not_running BEFORE INSERT ON time_entries WHEN EXISTS(SELECT 1 FROM running_timers WHERE owner_id=NEW.owner_id AND session_id=NEW.id) BEGIN SELECT RAISE(ABORT,'close active session first'); END;
CREATE TRIGGER material_reservations BEFORE UPDATE OF stock_minor ON materials WHEN NEW.stock_minor<(SELECT COALESCE(SUM(reserved_minor),0) FROM material_requirements WHERE owner_id=NEW.owner_id AND material_id=NEW.id) BEGIN SELECT RAISE(ABORT,'stock below reservations'); END;
CREATE TRIGGER material_unit_history BEFORE UPDATE OF unit ON materials WHEN NEW.unit!=OLD.unit AND (OLD.stock_minor!=0 OR EXISTS(SELECT 1 FROM material_adjustments WHERE owner_id=OLD.owner_id AND material_id=OLD.id) OR EXISTS(SELECT 1 FROM material_requirements WHERE owner_id=OLD.owner_id AND material_id=OLD.id)) BEGIN SELECT RAISE(ABORT,'unit has history'); END;
CREATE TRIGGER adjustment_piece BEFORE INSERT ON material_adjustments WHEN NEW.delta_minor%100!=0 AND (SELECT unit FROM materials WHERE owner_id=NEW.owner_id AND id=NEW.material_id)='piece' BEGIN SELECT RAISE(ABORT,'whole pieces required'); END;
CREATE TRIGGER adjustment_immutable BEFORE UPDATE ON material_adjustments BEGIN SELECT RAISE(ABORT,'immutable adjustment'); END;
CREATE TRIGGER adjustment_no_delete BEFORE DELETE ON material_adjustments BEGIN SELECT RAISE(ABORT,'immutable adjustment'); END;


CREATE TRIGGER requirement_insert BEFORE INSERT ON material_requirements BEGIN
 SELECT CASE WHEN (SELECT unit FROM materials WHERE owner_id=NEW.owner_id AND id=NEW.material_id)='piece' AND (NEW.needed_minor%100!=0 OR NEW.reserved_minor%100!=0) THEN RAISE(ABORT,'whole pieces required') END;
 SELECT CASE WHEN NEW.reserved_minor+(SELECT COALESCE(SUM(reserved_minor),0) FROM material_requirements WHERE owner_id=NEW.owner_id AND material_id=NEW.material_id )>(SELECT stock_minor FROM materials WHERE owner_id=NEW.owner_id AND id=NEW.material_id) THEN RAISE(ABORT,'reservations exceed stock') END;
END;

CREATE TRIGGER requirement_update BEFORE UPDATE ON material_requirements BEGIN
 SELECT CASE WHEN (SELECT unit FROM materials WHERE owner_id=NEW.owner_id AND id=NEW.material_id)='piece' AND (NEW.needed_minor%100!=0 OR NEW.reserved_minor%100!=0) THEN RAISE(ABORT,'whole pieces required') END;
 SELECT CASE WHEN NEW.reserved_minor+(SELECT COALESCE(SUM(reserved_minor),0) FROM material_requirements WHERE owner_id=NEW.owner_id AND material_id=NEW.material_id AND id!=OLD.id)>(SELECT stock_minor FROM materials WHERE owner_id=NEW.owner_id AND id=NEW.material_id) THEN RAISE(ABORT,'reservations exceed stock') END;
END;
