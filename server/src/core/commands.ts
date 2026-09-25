import { createHash, randomUUID } from 'node:crypto';
import { mutationRequestSchema, mutationResultSchema, type MutationRequest, type MutationResult } from '@pirata/contracts/index';
import type { Sqlite } from '../db/database.js';
import { Repositories } from './repositories.js';
import { ApiError } from './errors.js';
import { COMMAND_CAPABILITY, can, type Role } from '@pirata/contracts/permissions';
import { invokeHandler, type HandlerResult, type PartialHandlers } from './context.js';
export function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
export function revision(db:Sqlite,ownerId:string):number {const row=db.prepare('SELECT revision FROM data_revisions WHERE owner_id=?').get(ownerId) as {revision:number}|undefined;if(!row)throw new ApiError(401,'UNAUTHENTICATED','Sign in required.');return row.revision;}
export function executeCommand(db:Sqlite,ownerId:string,input:MutationRequest,handlers:PartialHandlers,now:()=>number=Date.now,userId=ownerId,role:Role='owner'):MutationResult {
  const request=mutationRequestSchema.parse(input);
  const capability=COMMAND_CAPABILITY[request.command.type];
  if(capability&&!can(role,capability))throw new ApiError(403,'FORBIDDEN','You do not have permission for this action.');
  const fingerprint=createHash('sha256').update(canonical(request)).digest('hex');
  return db.transaction(()=>{
    const previous=db.prepare('SELECT fingerprint,result_json,user_id FROM command_receipts WHERE owner_id=? AND request_id=?').get(ownerId,request.requestId) as {fingerprint:string;result_json:string;user_id:string}|undefined;
    if(previous){if(previous.user_id!==userId)throw new ApiError(403,'FORBIDDEN','This receipt belongs to another person.');if(previous.fingerprint!==fingerprint)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This request ID was already used for a different request.');return mutationResultSchema.parse(JSON.parse(previous.result_json));}
    const current=revision(db,ownerId);
    if(request.baseRevision!==current)throw new ApiError(409,'REVISION_CONFLICT','Data changed on another device. Refresh and review.',{currentRevision:current});
    const serverNow=now();
    let active=true;let change:HandlerResult;
    const before=(db.prepare('SELECT total_changes() AS count').get() as {count:number}).count;
    try{change=invokeHandler(handlers,{ownerId,userId,role,serverNow,revision:current,repo:new Repositories(db,ownerId,()=>active&&db.inTransaction,userId),newId:randomUUID},request.command);}finally{active=false;}
    const wrote=(db.prepare('SELECT total_changes() AS count').get() as {count:number}).count>before;
    if(change.changed!==wrote)throw new Error('Handler changed flag does not match actual writes');
    if(change.changed&&!request.command.type.startsWith('expense.')&&!request.command.type.startsWith('record.')&&!['update.post','settings.update','equipment.use'].includes(request.command.type)){ // record.* (Trash) writes its own descriptive activity row
      const r=new Repositories(db,ownerId),task=change.result.kind==='task'&&change.result.id?r.get('tasks',change.result.id):undefined;
      r.insert('activity',{id:randomUUID(),createdAt:serverNow,updatedAt:serverNow,userId,projectId:task?.projectId??('projectId' in request.command?request.command.projectId:null)??null,taskId:task?.id??null,kind:request.command.type,body:request.command.type.replaceAll('.',' ') + (task?' · '+task.title:'')});
    }
    const next=current+(change.changed?1:0);
    const result=mutationResultSchema.parse({requestId:request.requestId,revision:next,serverNow,...change});
    if(change.changed)db.prepare('UPDATE data_revisions SET revision=? WHERE owner_id=?').run(next,ownerId);
    db.prepare('INSERT INTO command_receipts (owner_id,request_id,fingerprint,result_json,created_at,user_id) VALUES (?,?,?,?,?,?)').run(ownerId,request.requestId,fingerprint,JSON.stringify(result),serverNow,userId);
    return result;
  }).immediate();
}
