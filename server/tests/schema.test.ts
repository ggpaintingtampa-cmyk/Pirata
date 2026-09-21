import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setOwnerPassword } from '../src/auth/password.js';
import { Repositories, TABLES } from '../src/core/repositories.js';
import { backup, checkIntegrity, restoreToScratch } from '../src/db/backup.js';
import { migrate, migrations, openDatabase, type Sqlite } from '../src/db/database.js';

const NOW = 1_790_000_000_000;
const record = (id:string) => ({id,createdAt:NOW,updatedAt:NOW});
let directory:string;
let databasePath:string;
let db:Sqlite;
let ownerId:string;
let repo:Repositories;

function seedRelationships() {
  repo.insert('clients',{...record('client'),name:'Test Client',phone:'',email:'',note:'',archivedAt:null});
  repo.insert('projects',{...record('project'),name:'Test Project',clientId:'client',clientName:'Test Client',address:'',note:'',status:'open'});
  repo.insert('tasks',{...record('task'),projectId:'project',title:'Paint',estimatedMinutes:60,status:'open',note:''});
  repo.insert('objectives',{...record('objective'),date:'2026-09-17',title:'Finish',taskId:'task',status:'open',note:'',rank:0});
  repo.insert('schedule_blocks',{...record('block'),date:'2026-09-17',startMinute:540,endMinute:600,kind:'task',title:'Paint',taskId:'task'});
  repo.insert('time_entries',{...record('manual'),taskId:'task',source:'manual',date:'2026-09-17',durationSeconds:60,note:''});
  repo.insert('expenses',{...record('expense'),purchaseDate:'2026-09-17',description:'Paint',category:'materials',amountCents:8460,projectId:'project'});
  repo.insert('materials',{...record('material'),name:'Paint',product:'',color:'',finish:'',unit:'gal',stockMinor:1000});
  repo.insert('material_requirements',{...record('requirement'),materialId:'material',projectId:'project',neededMinor:500,reservedMinor:100});
  repo.insert('material_adjustments',{...record('opening'),materialId:'material',deltaMinor:1000,reason:'correction',note:'Opening fixture stock'});
  repo.insert('equipment',{...record('equipment'),name:'Sprayer',note:'',archivedAt:null});
  repo.insert('maintenance_items',{...record('maintenance'),equipmentId:'equipment',equipmentName:'Sprayer',title:'Clean',dueDate:'2026-09-17',completedAt:null});
  repo.insert('leads',{...record('lead'),name:'Test Lead',phone:'',email:'',workDescription:'Paint',nextFollowUpDate:'2026-09-17',convertedClientId:'client'});
  repo.insert('lead_follow_ups',{...record('follow-up'),leadId:'lead',at:NOW,note:'Test follow-up'});
}

beforeEach(async () => {
  directory=mkdtempSync(join(tmpdir(),'pirata-schema-'));
  databasePath=join(directory,'business.sqlite');
  db=openDatabase(databasePath,{create:true});
  ownerId=await setOwnerPassword(db,'Isolated schema fixture password','setup',NOW);
  repo=new Repositories(db,ownerId);
  seedRelationships();
});
afterEach(() => {
  if(db?.open)db.close();
  if(directory)rmSync(directory,{recursive:true,force:true});
});

describe('normalized SQLite foundation',() => {
  it('creates every business table, records migrations, and enables durable private storage',() => {
    const names=(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(r=>r.name);
    expect(names).toEqual(expect.arrayContaining([...TABLES,'owners','sessions','data_revisions','command_receipts','running_timers','schema_versions']));
    expect(db.prepare('SELECT version,checksum FROM schema_versions ORDER BY version').all()).toEqual(migrations().map(({version,checksum})=>({version,checksum})));
    expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
    expect(db.pragma('journal_mode',{simple:true})).toBe('wal');
    expect(db.pragma('busy_timeout',{simple:true})).toBeGreaterThanOrEqual(5000);
    expect(db.pragma('synchronous',{simple:true})).toBe(2);
    expect(statSync(databasePath).mode & 0o777).toBe(0o600);
    expect(()=>checkIntegrity(db)).not.toThrow();
  });

  it('permits only one owner and rejects a second normal bootstrap row',() => {
    expect(()=>db.prepare('INSERT INTO owners (id,password_hash,created_at,updated_at) VALUES (?,?,?,?)').run('second','test-only',NOW,NOW)).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM owners').get()).toEqual({count:1});
  });

  it('enforces owner-scoped foreign keys and hides another owner’s records',() => {
    // Deliberately bypass ONLY the singleton CHECK in this isolated fixture to
    // exercise composite ownership FKs with two real parents. Restore it before
    // checking any business behavior; production bootstrap cannot do this.
    db.pragma('ignore_check_constraints = ON');
    try {db.prepare('INSERT INTO owners VALUES (?,?,?,?,?)').run('other-owner',2,'test-only',NOW,NOW);}
    finally {db.pragma('ignore_check_constraints = OFF');}
    const other=new Repositories(db,'other-owner');
    expect(other.list('clients')).toEqual([]);
    expect(other.get('projects','project')).toBeUndefined();
    expect(()=>other.require('projects','project')).toThrow();
    expect(()=>other.insert('projects',{...record('other-project'),name:'Other',clientId:'client',clientName:'',address:'',note:'',status:'open'})).toThrow(/FOREIGN KEY/);
    expect(()=>other.insert('tasks',{...record('other-task'),projectId:'project',title:'Other',estimatedMinutes:1,status:'open',note:''})).toThrow(/FOREIGN KEY/);
    expect(()=>other.insert('material_requirements',{...record('other-requirement'),projectId:'project',materialId:'material',neededMinor:1,reservedMinor:0})).toThrow(/FOREIGN KEY/);
    expect(repo.get('projects','project')?.clientId).toBe('client');
  });

  it('preserves all relationships and timestamps across close and reopen',() => {
    const before=TABLES.map(table=>repo.list(table));
    db.close();db=openDatabase(databasePath);repo=new Repositories(db,ownerId);
    expect(TABLES.map(table=>repo.list(table))).toEqual(before);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('rejects unsafe, fractional and out-of-range integer values',() => {
    for(const amountCents of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1])expect(()=>repo.update('expenses','expense',{amountCents})).toThrow();
    expect(()=>repo.update('expenses','expense',{amountCents:Number.MAX_SAFE_INTEGER})).not.toThrow();
    for(const estimatedMinutes of [-1,1441,1.5])expect(()=>repo.update('tasks','task',{estimatedMinutes})).toThrow();
    expect(()=>repo.update('tasks','task',{updatedAt:-1})).toThrow();
    expect(()=>repo.update('tasks','task',{updatedAt:Number.MAX_SAFE_INTEGER+1})).toThrow();
    expect(()=>db.prepare('UPDATE data_revisions SET revision=?').run(Number.MAX_SAFE_INTEGER+1)).toThrow();
    expect(()=>repo.update('time_entries','manual',{durationSeconds:61})).toThrow();
  });

  it('requires valid objective ranks, at most three per date and a blocked explanation',() => {
    const objective=repo.require('objectives','objective');
    repo.insert('objectives',{...objective,...record('objective-1'),rank:1,status:'done'});
    repo.insert('objectives',{...objective,...record('objective-2'),rank:2});
    expect(()=>repo.insert('objectives',{...objective,...record('fourth'),rank:3})).toThrow();
    expect(()=>repo.insert('objectives',{...objective,...record('duplicate-rank'),rank:2})).toThrow();
    expect(()=>repo.update('objectives','objective',{status:'blocked',note:'  '})).toThrow();
    expect(()=>repo.update('objectives','objective',{status:'blocked',note:'Waiting for paint'})).not.toThrow();
  });

  it('enforces one task block, positive same-day intervals, and task linkage',() => {
    const block=repo.require('schedule_blocks','block');
    expect(()=>repo.insert('schedule_blocks',{...block,...record('duplicate-block')})).toThrow();
    for(const endMinute of [539,540,1441])expect(()=>repo.update('schedule_blocks','block',{endMinute})).toThrow();
    expect(()=>repo.update('schedule_blocks','block',{startMinute:-1})).toThrow();
    expect(()=>repo.update('schedule_blocks','block',{taskId:null})).toThrow();
    expect(()=>repo.update('schedule_blocks','block',{kind:'travel'})).toThrow();
    repo.update('schedule_blocks','block',{startMinute:0,endMinute:1440});
    expect(repo.require('schedule_blocks','block').endMinute).toBe(1440);
  });

  it('enforces one active timer and keeps active sessions distinct from closed entries',() => {
    repo.insertTimer({sessionId:'active-session',taskId:'task',startedAt:NOW});
    expect(()=>repo.insertTimer({sessionId:'second-session',taskId:'task',startedAt:NOW})).toThrow();
    expect(()=>repo.update('tasks','task',{status:'done'})).toThrow();
    expect(()=>repo.insert('time_entries',{...record('active-session'),taskId:'task',source:'timer',startedAt:NOW,endedAt:NOW+1,note:''})).toThrow();
    repo.removeTimer();
    repo.insert('time_entries',{...record('active-session'),taskId:'task',source:'timer',startedAt:NOW,endedAt:NOW+1,note:''});
    expect(()=>repo.insertTimer({sessionId:'active-session',taskId:'task',startedAt:NOW})).toThrow();
    repo.update('tasks','task',{status:'blocked'});
    expect(()=>repo.insertTimer({sessionId:'new-session',taskId:'task',startedAt:NOW})).toThrow();
    expect(()=>repo.insert('time_entries',{...record('zero'),taskId:'task',source:'timer',startedAt:NOW,endedAt:NOW,note:''})).toThrow();
  });

  it('enforces reservation totals and releases physical stock only through explicit removal',() => {
    repo.insert('projects',{...repo.require('projects','project'),...record('project-2')});
    repo.insert('material_requirements',{...record('requirement-2'),projectId:'project-2',materialId:'material',neededMinor:1000,reservedMinor:900});
    expect(()=>repo.update('material_requirements','requirement',{reservedMinor:101})).toThrow();
    expect(()=>repo.update('materials','material',{stockMinor:999})).toThrow();
    expect(()=>repo.update('material_requirements','requirement',{reservedMinor:501})).toThrow();
    expect(()=>repo.update('material_requirements','requirement',{reservedMinor:-1})).toThrow();
    repo.update('projects','project-2',{status:'completed'});
    expect(repo.require('material_requirements','requirement-2').reservedMinor).toBe(900);
    repo.remove('material_requirements','requirement-2');
    expect(()=>repo.update('materials','material',{stockMinor:100})).not.toThrow();
  });

  it('requires whole pieces for stock, reservations and adjustment history',() => {
    const piece={...repo.require('materials','material'),...record('pieces'),unit:'piece' as const,stockMinor:1000};
    repo.insert('materials',piece);
    expect(()=>repo.update('materials','pieces',{stockMinor:101})).toThrow();
    expect(()=>repo.insert('material_requirements',{...record('piece-need'),materialId:'pieces',projectId:'project',neededMinor:101,reservedMinor:0})).toThrow();
    expect(()=>repo.insert('material_requirements',{...record('piece-reserved'),materialId:'pieces',projectId:'project',neededMinor:200,reservedMinor:1})).toThrow();
    expect(()=>repo.insert('material_adjustments',{...record('piece-adjustment'),materialId:'pieces',deltaMinor:1,reason:'correction',note:''})).toThrow();
    expect(()=>repo.update('materials','material',{unit:'piece'})).toThrow();
  });

  it('rejects a competing connection’s stale reservation against committed stock',() => {
    repo.insert('projects',{...repo.require('projects','project'),...record('project-2')});
    const competing=openDatabase(databasePath);
    try {
      const other=new Repositories(competing,ownerId);
      expect(other.require('materials','material').stockMinor-other.require('material_requirements','requirement').reservedMinor).toBe(900);
      db.transaction(()=>repo.update('material_requirements','requirement',{neededMinor:1000,reservedMinor:900})).immediate();
      expect(()=>competing.transaction(()=>other.insert('material_requirements',{...record('competing-reservation'),materialId:'material',projectId:'project-2',neededMinor:900,reservedMinor:900})).immediate()).toThrow(/reservations exceed stock/);
      expect(repo.list('material_requirements')).toHaveLength(1);
      expect(repo.require('material_requirements','requirement').reservedMinor).toBe(900);
    } finally {competing.close();}
  });

  it('keeps adjustment history immutable and rolls back stock if history insert fails',() => {
    const before=repo.require('materials','material');
    expect(()=>repo.update('material_adjustments','opening',{note:'overwrite'})).toThrow();
    expect(()=>db.prepare('DELETE FROM material_adjustments WHERE owner_id=?').run(ownerId)).toThrow();
    expect(()=>db.transaction(()=>{
      repo.update('materials','material',{stockMinor:1300});
      repo.insert('material_adjustments',{...record('opening'),materialId:'material',deltaMinor:300,reason:'restock',note:''});
    }).immediate()).toThrow();
    expect(repo.require('materials','material')).toEqual(before);
    expect(repo.list('material_adjustments')).toHaveLength(1);
  });

  it('prevents destructive parent deletion while historical relationships exist',() => {
    for(const [table,id] of [['clients','client'],['projects','project'],['tasks','task'],['equipment','equipment'],['leads','lead']]) {
      expect(()=>db.prepare(`DELETE FROM ${table} WHERE owner_id=? AND id=?`).run(ownerId,id)).toThrow(/FOREIGN KEY/);
    }
    repo.update('equipment','equipment',{archivedAt:NOW+1});
    expect(repo.require('maintenance_items','maintenance').equipmentName).toBe('Sprayer');
  });
});

const dateColumns=[['objectives','date'],['schedule_blocks','date'],['time_entries','date'],['expenses','purchase_date'],['maintenance_items','due_date'],['leads','next_follow_up_date']] as const;
describe('calendar constraints at the SQLite boundary',() => {
  it.each(['2026-13-01','2026-00-01','2026-01-32','2026-02-30','2025-02-29','1900-02-29','0000-01-01','2026-9-17','not-a-date'])('rejects %s in every business date column',invalid => {
    for(const [table,column] of dateColumns)expect(()=>db.prepare(`UPDATE ${table} SET ${column}=? WHERE owner_id=?`).run(invalid,ownerId),`${table}.${column}`).toThrow();
  });
  it.each(['2024-02-29','2000-02-29','2026-02-28','0001-01-01','9999-12-31'])('accepts real calendar date %s',valid => {
    for(const [table,column] of dateColumns)expect(()=>db.prepare(`UPDATE ${table} SET ${column}=? WHERE owner_id=?`).run(valid,ownerId),`${table}.${column}`).not.toThrow();
  });
  it('allows no lead reminder but requires dates for manual entries and dated records',() => {
    repo.update('leads','lead',{nextFollowUpDate:null});
    expect(repo.require('leads','lead').nextFollowUpDate).toBeNull();
    for(const [table,column] of dateColumns.filter(([table])=>table!=='leads'))expect(()=>db.prepare(`UPDATE ${table} SET ${column}=NULL WHERE owner_id=?`).run(ownerId)).toThrow();
    repo.insert('time_entries',{...record('timer-history'),taskId:'task',source:'timer',startedAt:NOW,endedAt:NOW+1000,note:''});
    expect(repo.require('time_entries','timer-history').source).toBe('timer');
  });
});

describe('safe forward migrations and backup recovery',() => {
  it('refuses unknown unversioned schemas without resetting existing records',() => {
    const path=join(directory,'unknown.sqlite');
    const unknown=new Database(path);
    unknown.exec("CREATE TABLE valuable_data (value TEXT); INSERT INTO valuable_data VALUES ('preserve-me')");unknown.close();
    expect(()=>openDatabase(path)).toThrow(/Unknown database schema/);
    const original=new Database(path);
    try {expect(original.prepare('SELECT value FROM valuable_data').get()).toEqual({value:'preserve-me'});expect(original.prepare("SELECT name FROM sqlite_master WHERE name='schema_versions'").get()).toBeUndefined();}
    finally {original.close();}
  });

  it('refuses modified or future migration metadata without touching business data',() => {
    const before=repo.list('clients');
    db.prepare('UPDATE schema_versions SET checksum=? WHERE version=1').run('unknown-checksum');
    expect(()=>migrate(db)).toThrow(/Unknown or modified schema/);
    expect(repo.list('clients')).toEqual(before);
    db.prepare('UPDATE schema_versions SET checksum=? WHERE version=1').run(migrations()[0]!.checksum);
    db.prepare('INSERT INTO schema_versions VALUES (?,?,?)').run(migrations().length+1,'future-schema',NOW);
    expect(()=>migrate(db)).toThrow(/Unknown or modified schema/);
    expect(repo.list('clients')).toEqual(before);
  });

  it('rolls back all statements and metadata from a failed next migration',() => {
    const before=db.prepare('SELECT * FROM schema_versions').all();
    const steps=migrations();
    expect(()=>migrate(db,[...steps,{version:steps.length+1,checksum:'test-failing-step',sql:"CREATE TABLE partial_migration (id INTEGER); INSERT INTO clients (id) VALUES ('invalid')"}])).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='partial_migration'").get()).toBeUndefined();
    expect(db.prepare('SELECT * FROM schema_versions').all()).toEqual(before);
    expect(repo.require('clients','client').name).toBe('Test Client');
    expect(()=>migrate(db)).not.toThrow();
  });

  it('leaves a fresh database recoverable when its first migration fails',() => {
    const fresh=openDatabase(join(directory,'fresh.sqlite'),{create:true,applyMigrations:false});
    try {
      expect(()=>migrate(fresh,[{version:1,checksum:'test-first-failure',sql:'CREATE TABLE partial (id INTEGER); INVALID SQL'}])).toThrow();
      expect(fresh.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
      expect(()=>migrate(fresh)).not.toThrow();
    } finally {fresh.close();}
  });

  it('backs up committed WAL state and restores all relationships plus the active timer privately',async () => {
    db.pragma('wal_autocheckpoint=0');
    repo.insertTimer({sessionId:'live-session',taskId:'task',startedAt:NOW});
    db.prepare('UPDATE data_revisions SET revision=7 WHERE owner_id=?').run(ownerId);
    expect(statSync(databasePath+'-wal').size).toBeGreaterThan(0);
    const backupPath=join(directory,'backups','snapshot.sqlite');
    await backup(db,backupPath);
    const scratchPath=join(directory,'restored','scratch.sqlite');
    await restoreToScratch(backupPath,scratchPath);
    const restored=openDatabase(scratchPath);
    try {
      const recovered=new Repositories(restored,ownerId);
      expect(TABLES.map(table=>recovered.list(table))).toEqual(TABLES.map(table=>repo.list(table)));
      expect(recovered.getTimer()).toEqual({sessionId:'live-session',taskId:'task',startedAt:NOW});
      expect(restored.prepare('SELECT revision FROM data_revisions WHERE owner_id=?').get(ownerId)).toEqual({revision:7});
      expect(()=>checkIntegrity(restored)).not.toThrow();
      expect(statSync(backupPath).mode & 0o777).toBe(0o600);
      expect(statSync(scratchPath).mode & 0o777).toBe(0o600);
      recovered.update('clients','client',{name:'Scratch edit'});
      expect(repo.require('clients','client').name).toBe('Test Client');
    } finally {restored.close();}
    await expect(backup(db,backupPath)).rejects.toThrow();
    await expect(restoreToScratch(backupPath,backupPath)).rejects.toThrow();
    await expect(restoreToScratch(backupPath,databasePath)).rejects.toThrow();
    expect(repo.getTimer()?.sessionId).toBe('live-session');
  });
});
