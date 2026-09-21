import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export type Sqlite = Database.Database;
export interface Migration {version:number;sql:string;checksum:string}
// Both src and dist live one level beneath server; SQL remains a reviewed source artifact.
const migrationDirectory = fileURLToPath(new URL('../../src/db/migrations/',import.meta.url));
export function migrations():Migration[] {
  return readdirSync(migrationDirectory).filter(f=>/^\d{3}-.+\.sql$/.test(f)).sort().map(f=>{const sql=readFileSync(resolve(migrationDirectory,f),'utf8');return {version:Number(f.slice(0,3)),sql,checksum:createHash('sha256').update(sql).digest('hex')};});
}
export function migrate(db:Sqlite, steps=migrations()):void {
  const hasVersion = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'").get();
  if (!hasVersion && (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length || Number(db.pragma('user_version',{simple:true}))!==0)) throw new Error('Unknown database schema; refusing to modify it.');
  const existing=hasVersion ? db.prepare('SELECT version,checksum FROM schema_versions ORDER BY version').all() as {version:number;checksum:string}[]:[];
  if(existing.some((v,i)=>v.version!==i+1||steps[i]?.version!==v.version||steps[i]?.checksum!==v.checksum)||existing.length>steps.length) throw new Error('Unknown or modified schema version; restore/review required.');
  if(steps.some((s,i)=>s.version!==i+1))throw new Error('Migrations must be contiguous.');
  // SQLite's documented table rebuild procedure disables FK enforcement outside the transaction.
  // The complete graph is checked before commit; restore enforcement even after failure.
  db.pragma('foreign_keys = OFF');
  try { db.transaction(()=>{
    db.exec('CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT');
    for(const step of steps.slice(existing.length)){
      db.exec(step.sql);
      db.prepare('INSERT INTO schema_versions VALUES (?,?,?)').run(step.version,step.checksum,Date.now());
    }
    if((db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Migration relationship validation failed.');
  }).immediate(); } finally { db.pragma('foreign_keys = ON'); }
}
export function openDatabase(path:string,{create=false,applyMigrations=true}:{create?:boolean;applyMigrations?:boolean}={}):Sqlite {
  if(!existsSync(path)&&!create)throw new Error('Database does not exist. Run migrate explicitly.');
  if(create)mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new Database(path,{fileMustExist:!create});
  try {
    chmodSync(path,0o600);
    db.pragma('foreign_keys = ON');db.pragma('busy_timeout = 5000');
    if(applyMigrations)migrate(db);
    db.pragma('journal_mode = WAL');db.pragma('synchronous = FULL');
    return db;
  }catch(error){db.close();throw error;}
}
