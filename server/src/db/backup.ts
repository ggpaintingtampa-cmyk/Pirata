import Database from 'better-sqlite3';
import { chmodSync, closeSync, mkdirSync, openSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Sqlite } from './database.js';
import { migrate } from './database.js';
export function checkIntegrity(db:Sqlite):void {if(db.pragma('integrity_check',{simple:true})!=='ok'||(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Backup integrity check failed.');}
/** SQLite Online Backup API includes committed WAL content; destination must be new. */
export async function backup(db:Sqlite,destination:string):Promise<void> {
  const path=resolve(destination);mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const fd=openSync(path,'wx',0o600);closeSync(fd);
  try{await db.backup(path);chmodSync(path,0o600);const copy=new Database(path,{readonly:true,fileMustExist:true});try{checkIntegrity(copy);}finally{copy.close();}}
  catch(error){unlinkSync(path);throw error;}
}
/** Never overwrites the source or a live DB; validates a new private scratch copy. */
export async function restoreToScratch(source:string,destination:string):Promise<void> {
  if(realpathSync(source)===resolve(destination))throw new Error('Restore requires a distinct new scratch path.');
  const db=new Database(source,{readonly:true,fileMustExist:true});
  try{checkIntegrity(db);await backup(db,destination);}finally{db.close();}
  const restored=new Database(destination);try{restored.pragma('foreign_keys=ON');migrate(restored);checkIntegrity(restored);}finally{restored.close();}
}
