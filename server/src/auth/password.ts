import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Sqlite } from '../db/database.js';
// OWASP Argon2id minimum: m=19 MiB, t=2, p=1. Explicitly pinned and verified.
export const PASSWORD_OPTIONS={type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1,hashLength:32} as const;
export function validatePassword(password:string):void {if(password.length<15||password.length>128)throw new Error('Use a password between 15 and 128 characters.');}
export async function hashPassword(password:string):Promise<string>{validatePassword(password);return argon2.hash(password,PASSWORD_OPTIONS);}
export async function verifyPassword(hash:string,password:string):Promise<boolean>{if(password.length>128)return false;try{return await argon2.verify(hash,password);}catch{return false;}}
export async function setOwnerPassword(db:Sqlite,password:string,mode:'setup'|'recover',now=Date.now()):Promise<string> {
  const hash=await hashPassword(password);
  return db.transaction(()=>{
    const owner=db.prepare('SELECT id FROM owners').get() as {id:string}|undefined;
    if(mode==='setup'&&owner)throw new Error('Owner already exists. Use recovery.');
    if(mode==='recover'&&!owner)throw new Error('No owner exists. Use setup.');
    const id=owner?.id??randomUUID();
    if(owner){db.prepare('UPDATE owners SET password_hash=?,updated_at=? WHERE id=?').run(hash,now,id);}
    else{db.prepare('INSERT INTO owners (id,password_hash,created_at,updated_at) VALUES (?,?,?,?)').run(id,hash,now,now);db.prepare('INSERT INTO data_revisions (owner_id) VALUES (?)').run(id);}
    db.prepare('DELETE FROM sessions').run();db.prepare('DELETE FROM auth_rate_limits').run();return id;
  }).immediate();
}
