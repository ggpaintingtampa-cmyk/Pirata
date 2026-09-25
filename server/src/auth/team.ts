import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {ROLES,ROLE_CAPS,type Role} from '@pirata/contracts/permissions';
import type {Sqlite} from '../db/database.js';
import {ApiError} from '../core/errors.js';
import {hashPassword} from './password.js';
import {checkMutation,requireSession,requireOwner} from './sessions.js';
import {Repositories} from '../core/repositories.js';
const password=z.string().min(15,'Use at least 15 characters.').max(128);
const roleSchema=z.enum(ROLES);
const ROLE_LABEL:Record<Role,string>={owner:'owners',manager:'managers',sales:'sales reps',worker:'workers'};
/** Active accounts per role (2 owners, 5 managers, 5 sales, 10 workers); `except` ignores one member when re-enabling or changing role. */
function assertCapacity(db:Sqlite,ownerId:string,role:Role,except:string|null=null):void {
 const n=(db.prepare('SELECT count(*) n FROM team_members WHERE owner_id=? AND CASE role WHEN \'employee\' THEN \'worker\' ELSE role END=? AND disabled_at IS NULL AND id IS NOT ?').get(ownerId,role,except) as {n:number}).n;
 if(n>=ROLE_CAPS[role])throw new ApiError(409,'TEAM_LIMIT',`Up to ${ROLE_CAPS[role]} ${ROLE_LABEL[role]} may have access. Disable one before adding another.`);
}
export function registerTeam(app:FastifyInstance,{db,origin,now}:{db:Sqlite;origin:string;now:()=>number}){
 app.get('/api/v1/admin/team',async req=>{const s=requireOwner(db,req,now());return {team:new Repositories(db,s.owner_id).team()};});
 app.post('/api/v1/admin/team',async req=>{
  const s=requireOwner(db,req,now());checkMutation(req,s,origin);
  const c=z.object({name:z.string().trim().min(1).max(100),username:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,39}$/),password,role:roleSchema.default('worker')}).strict().parse(req.body);
  const hash=await hashPassword(c.password);
  return db.transaction(()=>{requireOwner(db,req,now());assertCapacity(db,s.owner_id,c.role);
   const id=randomUUID(),at=now();db.prepare('INSERT INTO team_members (id,owner_id,name,username,role,password_hash,disabled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,NULL,?,?)').run(id,s.owner_id,c.name,c.username,c.role,hash,at,at);db.prepare('UPDATE data_revisions SET revision=revision+1 WHERE owner_id=?').run(s.owner_id);return {id};
  }).immediate();
 });
 app.post('/api/v1/admin/team/:id',async req=>{
  const s=requireOwner(db,req,now());checkMutation(req,s,origin);const {id}=z.object({id:z.string()}).parse(req.params);
  const c=z.object({password:password.optional(),disabled:z.boolean().optional(),name:z.string().trim().min(1).max(100).optional(),role:roleSchema.optional()}).strict().parse(req.body);
  const hash=c.password?await hashPassword(c.password):null;
  return db.transaction(()=>{requireOwner(db,req,now());const m=db.prepare('SELECT CASE role WHEN \'employee\' THEN \'worker\' ELSE role END AS role,disabled_at FROM team_members WHERE owner_id=? AND id=?').get(s.owner_id,id) as {role:Role;disabled_at:number|null}|undefined;
   // The primary owner (id = business id) is recovered only by the server command; other owners are ordinary members.
   if(!m||id===s.owner_id)throw new ApiError(400,'INVALID_MEMBER','Choose a team member. Owner password recovery uses the secure server command.');
   const role=c.role??m.role,enabling=c.disabled===false&&m.disabled_at!==null,active=c.disabled===undefined?m.disabled_at===null:!c.disabled;
   if(enabling||(c.role&&c.role!==m.role&&active))assertCapacity(db,s.owner_id,role,id);
   if(c.disabled===true){const repo=new Repositories(db,s.owner_id,()=>true,id),timer=repo.getTimer();if(timer){const endedAt=now();if(endedAt<timer.startedAt)throw new ApiError(409,'CLOCK_CONFLICT','Correct the active timer start before disabling access.');repo.removeTimer();if(endedAt>timer.startedAt)repo.insert('time_entries',{id:timer.sessionId,taskId:timer.taskId,source:'timer',startedAt:timer.startedAt,endedAt,note:'Timer stopped when access was disabled by the owner.',createdAt:endedAt,updatedAt:endedAt,userId:id});}}
   if(hash)db.prepare('UPDATE team_members SET password_hash=?,updated_at=? WHERE id=?').run(hash,now(),id);
   if(c.name)db.prepare('UPDATE team_members SET name=?,updated_at=? WHERE id=?').run(c.name,now(),id);
   if(c.role&&c.role!==m.role)db.prepare('UPDATE team_members SET role=?,updated_at=? WHERE id=?').run(c.role,now(),id);
   if(c.disabled!==undefined)db.prepare('UPDATE team_members SET disabled_at=?,updated_at=? WHERE id=?').run(c.disabled?now():null,now(),id);
   if(hash||c.disabled||(c.role&&c.role!==m.role))db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   db.prepare('UPDATE data_revisions SET revision=revision+1 WHERE owner_id=?').run(s.owner_id);return {ok:true};
  }).immediate();
 });
 app.get('/api/v1/me',async req=>{const s=requireSession(db,req,now());return new Repositories(db,s.owner_id).team().find(m=>m.id===s.user_id);});
}
