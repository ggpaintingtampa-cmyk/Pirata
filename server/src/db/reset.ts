import Database from 'better-sqlite3';
import { realpathSync } from 'node:fs';
import { checkIntegrity } from './backup.js';
import { migrations, type Sqlite } from './database.js';

export const RESET_TABLES = ['clients','projects','tasks','objectives','schedule_blocks','time_entries','running_timers','expenses','materials','material_requirements','material_adjustments','equipment','maintenance_items','leads','lead_follow_ups','daily_goals','task_templates','attachments','activity','project_notes','shopping_items','cleanup_obligations','cleanup_snoozes','day_assignments','task_questions','day_notes','project_templates','project_facts','work_shifts','tool_sign_outs','equipment_reports','attachment_tags','attachment_comments','translations','translation_source_locales','task_requirements','batch_operations'];
export const PRESERVED_TABLES = ['schema_versions','owners','team_members','sessions','auth_rate_limits','command_receipts','business_settings','ai_settings','pay_rates','translation_settings','translation_glossary','integration_tokens'];
const allTables = [...RESET_TABLES,...PRESERVED_TABLES,'data_revisions','ai_usage'].sort();
const rows = (db:Sqlite,table:string) => JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());

/** Offline operator action only. The API and backup writers must be stopped first. */
export function resetBusinessRecords(db:Sqlite, expectedRevision:number, backupPath:string) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expected revision.');
  if (realpathSync(db.name) === realpathSync(backupPath)) throw new Error('A distinct verified backup is required.');
  const saved = new Database(backupPath,{readonly:true,fileMustExist:true});
  try {
    checkIntegrity(saved);
    return db.transaction(()=>{
      const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(r=>r.name);
      if (JSON.stringify(tables)!==JSON.stringify(allTables)) throw new Error('Unreviewed tables; reset refused.');
      const schema=db.prepare('SELECT version,checksum FROM schema_versions ORDER BY version').all();
      if (JSON.stringify(schema)!==JSON.stringify(migrations().map(({version,checksum})=>({version,checksum}))) || migrations().length!==6) throw new Error('Unreviewed schema; reset refused.');
      const revisions=db.prepare('SELECT revision FROM data_revisions').all() as {revision:number}[];
      if (revisions.length!==1 || revisions[0].revision!==expectedRevision || expectedRevision===Number.MAX_SAFE_INTEGER) throw new Error('Revision changed; reset refused.');
      // Compare privately: no account, credential or business values reach output.
      for (const table of allTables) if (rows(db,table)!==rows(saved,table)) throw new Error('Backup differs from current database; reset refused.');
      const originalSchema=JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all());
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='adjustment_no_delete'").get() as {sql:string}|undefined;
      if (!trigger) throw new Error('Expected immutable-history guard missing.');
      // A complete owner-authorized reset is the only operation that clears immutable
      // adjustments. Restore the exact guard in the same atomic transaction.
      db.pragma('defer_foreign_keys = ON');
      db.exec('DROP TRIGGER adjustment_no_delete');
      for (const table of RESET_TABLES) db.prepare(`DELETE FROM ${table}`).run();
      db.exec(trigger.sql);
      // Keep billed usage and allowance accounting; invalidate old Ask proposals/content.
      db.prepare('UPDATE ai_usage SET response_json=?').run(JSON.stringify({message:'Workspace reset. Start a new request.',error:true}));
      db.prepare('UPDATE data_revisions SET revision=revision+1').run();
      checkIntegrity(db);
      for (const table of PRESERVED_TABLES) if (rows(db,table)!==rows(saved,table)) throw new Error('Preserved records changed.');
      if (JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all())!==originalSchema) throw new Error('Schema changed.');
      const counts=Object.fromEntries(RESET_TABLES.map(table=>[table,(db.prepare(`SELECT count(*) n FROM ${table}`).get() as {n:number}).n]));
      if (Object.values(counts).some(n=>n!==0)) throw new Error('Reset incomplete.');
      return {revision:expectedRevision+1,counts,accountsAndSettingsPreserved:true};
    }).immediate();
  } finally {saved.close();}
}
