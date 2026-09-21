import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Sqlite} from '../db/database.js';
import {ApiError} from '../core/errors.js';
import {hashPassword} from './password.js';
import {checkMutation,requireSession,requireOwner} from './sessions.js';
import {Repositories} from '../core/repositories.js';
const password=z.string().min(15,'Use at least 15 characters.').max(128);
export function registerTeam(app:FastifyInstance,{db,origin,now}:{db:Sqlite;origin:string;now:()=>number}){
 app.get('/api/v1/admin/team',async req=>{const s=requireOwner(db,req,now());return {team:new Repositories(db,s.owner_id).team()};});
 app.post('/api/v1/admin/team',async req=>{
  const s=requireOwner(db,req,now());checkMutation(req,s,origin);
  const c=z.object({name:z.string().trim().min(1).max(100),username:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,39}$/),password}).strict().parse(req.body);
  const hash=await hashPassword(c.password);
  return db.transaction(()=>{requireOwner(db,req,now());if((db.prepare("SELECT count(*) n FROM team_members WHERE owner_id=? AND role='employee' AND disabled_at IS NULL").get(s.owner_id) as {n:number}).n>=4)throw new ApiError(409,'TEAM_LIMIT','Disable an employee before adding another. Up to four employees may have access.');
   const id=randomUUID(),at=now();db.prepare("INSERT INTO team_members VALUES (?,?,?,?,'employee',?,NULL,?,?)").run(id,s.owner_id,c.name,c.username,hash,at,at);db.prepare('UPDATE data_revisions SET revision=revision+1 WHERE owner_id=?').run(s.owner_id);return {id};
  }).immediate();
 });
 app.post('/api/v1/admin/team/:id',async req=>{
  const s=requireOwner(db,req,now());checkMutation(req,s,origin);const {id}=z.object({id:z.string()}).parse(req.params);
  const c=z.object({password:password.optional(),disabled:z.boolean().optional(),name:z.string().trim().min(1).max(100).optional()}).strict().parse(req.body);
  const hash=c.password?await hashPassword(c.password):null;
  return db.transaction(()=>{requireOwner(db,req,now());const m=db.prepare('SELECT role,disabled_at FROM team_members WHERE owner_id=? AND id=?').get(s.owner_id,id) as {role:string;disabled_at:number|null}|undefined;
   if(!m||m.role==='owner')throw new ApiError(400,'INVALID_MEMBER','Choose an employee. Owner password recovery uses the secure server command.');
   if(c.disabled===false&&m.disabled_at!==null&&(db.prepare("SELECT count(*) n FROM team_members WHERE owner_id=? AND role='employee' AND disabled_at IS NULL").get(s.owner_id) as {n:number}).n>=4)throw new ApiError(409,'TEAM_LIMIT','Up to four employees may have access.');
   if(c.disabled===true){const repo=new Repositories(db,s.owner_id,()=>true,id),timer=repo.getTimer();if(timer){const endedAt=now();if(endedAt<timer.startedAt)throw new ApiError(409,'CLOCK_CONFLICT','Correct the active timer start before disabling access.');repo.removeTimer();if(endedAt>timer.startedAt)repo.insert('time_entries',{id:timer.sessionId,taskId:timer.taskId,source:'timer',startedAt:timer.startedAt,endedAt,note:'Timer stopped when access was disabled by the owner.',createdAt:endedAt,updatedAt:endedAt,userId:id});}}
   if(hash)db.prepare('UPDATE team_members SET password_hash=?,updated_at=? WHERE id=?').run(hash,now(),id);
   if(c.name)db.prepare('UPDATE team_members SET name=?,updated_at=? WHERE id=?').run(c.name,now(),id);
   if(c.disabled!==undefined)db.prepare('UPDATE team_members SET disabled_at=?,updated_at=? WHERE id=?').run(c.disabled?now():null,now(),id);
   if(hash||c.disabled)db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   db.prepare('UPDATE data_revisions SET revision=revision+1 WHERE owner_id=?').run(s.owner_id);return {ok:true};
  }).immediate();
 });
 app.get('/api/v1/me',async req=>{const s=requireSession(db,req,now());return new Repositories(db,s.owner_id).team().find(m=>m.id===s.user_id);});
}
