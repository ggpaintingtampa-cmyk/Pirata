import { createHash } from 'node:crypto';
import { importInputSchema, importRequestSchema, type ImportInput, type ImportRequest } from '@pirata/contracts/import';
import { snapshotSchema, mutationResultSchema, type BusinessSnapshot, type Capabilities } from '@pirata/contracts/index';
import { toLegacyState } from '@pirata/contracts/compatibility';
import { ApiError } from '../core/errors.js';
import { canonical, revision } from '../core/commands.js';
import { Repositories, TABLES } from '../core/repositories.js';
import type { Sqlite } from '../db/database.js';
const ready:Capabilities={'clients-projects':'ready','tasks-time':'ready',planning:'ready',spending:'ready',inventory:'ready'};
export function convertLegacy(input:ImportInput,now:number):BusinessSnapshot {
  const {state:s,timerChoice}=importInputSchema.parse(input);
  const pairs=s.materialRequirements.map(r=>JSON.stringify([r.materialId,r.projectId]));
  if(new Set(pairs).size!==pairs.length)throw new ApiError(400,'IMPORT_CONFLICT','Multiple requirements for one material and project cannot be imported. Resolve them in a copy of the export; the original is unchanged.');
  if(timerChoice==='carry'&&s.runningTimer&&s.runningTimer.startedAt>now)throw new ApiError(400,'CLOCK_BACKWARD','The active start is in the future. Correct it in the original demo or explicitly discard the active session on import.');
  const arrays=[s.projects,s.tasks,s.objectives,s.schedule,s.timeEntries,s.expenses,s.materials,s.materialRequirements,s.materialAdjustments,s.maintenance,s.leads,...s.leads.map(l=>l.followUps)];
  if(arrays.reduce((n,a)=>n+a.length,0)>10000)throw new ApiError(413,'TOO_LARGE','Import is limited to 10,000 records.');
  const base=(record:{id:string;createdAt?:number},i:number)=>({id:record.id,createdAt:record.createdAt??Math.max(0,now-10000+i),updatedAt:now});
  const objectives=[...s.objectives].sort((a,b)=>a.date.localeCompare(b.date)||a.rank-b.rank||s.objectives.indexOf(a)-s.objectives.indexOf(b));
  const ranks=new Map<string,number>();
  const snapshot=snapshotSchema.parse({schemaVersion:2,timezone:s.timezone,currency:s.currency,revision:0,serverNow:now,capabilities:ready,
    clients:s.projects.map((p,i)=>({...base({id:'legacy-client-'+i},i),name:p.clientName,phone:'',email:'',note:'Imported from project '+p.name+'. Separate identity retained; matching names were not merged.',archivedAt:null})),
    projects:s.projects.map((p,i)=>({...p,...base(p,i),clientId:'legacy-client-'+i,address:'',note:''})),
    tasks:s.tasks.map((t,i)=>({...t,...base(t,i)})),
    objectives:objectives.map((o,i)=>{const rank=ranks.get(o.date)??0;ranks.set(o.date,rank+1);return {...o,...base(o,i),rank};}),
    schedule:s.schedule.map((b,i)=>({...b,...base(b,i)})),
    timeEntries:s.timeEntries.map((e,i)=>({...e,...base(e,i)})),runningTimer:timerChoice==='carry'?s.runningTimer:null,
    expenses:s.expenses.map((e,i)=>({...e,...base(e,i)})),materials:s.materials.map((m,i)=>({...m,...base(m,i)})),
    materialRequirements:s.materialRequirements.map((r,i)=>({...r,...base(r,i)})),materialAdjustments:s.materialAdjustments.map((a,i)=>({...a,...base(a,i)})),
    equipment:s.maintenance.map((m,i)=>({...base({id:'legacy-equipment-'+i},i),name:m.equipmentName,note:'Imported from maintenance '+m.title+'. Separate identity retained.',archivedAt:null})),
    maintenance:s.maintenance.map((m,i)=>({...m,...base(m,i),equipmentId:'legacy-equipment-'+i})),
    leads:s.leads.map((l,i)=>({...l,...base(l,i),convertedClientId:null,followUps:l.followUps.map((f,j)=>({...f,...base({id:`legacy-followup-${i}-${j}`},j),leadId:l.id}))}))
  });
  toLegacyState(snapshot); // Shared relationship/stock/timer checks, not just a cast.
  return snapshot;
}
function assertEmpty(repo:Repositories){if(repo.getTimer()||TABLES.some(t=>repo.list(t).length))throw new ApiError(409,'WORKSPACE_NOT_EMPTY','Import requires an empty workspace. Existing business records will not be replaced.');}
export function previewImport(db:Sqlite,ownerId:string,input:ImportInput,now:number){
  const snapshot=convertLegacy(input,now);
  return db.transaction(()=>{assertEmpty(new Repositories(db,ownerId));return {baseRevision:revision(db,ownerId),activeTimer:snapshot.runningTimer!==null,counts:Object.fromEntries(Object.entries(snapshot).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,(v as unknown[]).length])),warnings:['Demo exports may contain fabricated sample people, projects, purchases and work. Review these records before treating them as business history.','A separate client is created for each legacy project and separate equipment for each maintenance record. Names are never used to merge identities.','Objective ordering is retained and ranks are normalized. Follow-up IDs are mapped per lead. Missing creation times are recorded at import.','The original browser storage and file are never changed.']};})();
}
export function executeImport(db:Sqlite,ownerId:string,input:ImportRequest,now:number){
  const request=importRequestSchema.parse(input);
  const fingerprint=createHash('sha256').update(canonical({operation:'import-v1',...request})).digest('hex');
  return db.transaction(()=>{
    const previous=db.prepare('SELECT fingerprint,result_json FROM command_receipts WHERE owner_id=? AND request_id=?').get(ownerId,request.requestId) as {fingerprint:string;result_json:string}|undefined;
    if(previous){if(previous.fingerprint!==fingerprint)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This request ID was already used.');return mutationResultSchema.parse(JSON.parse(previous.result_json));}
    const current=revision(db,ownerId);
    if(current!==request.baseRevision)throw new ApiError(409,'REVISION_CONFLICT','Workspace changed. Preview again before importing.',{currentRevision:current});
    const repo=new Repositories(db,ownerId);assertEmpty(repo);
    const s=convertLegacy({state:request.state,timerChoice:request.timerChoice},now);
    for(const c of s.clients)repo.insert('clients',c);
    for(const p of s.projects)repo.insert('projects',p);
    for(const t of s.tasks)repo.insert('tasks',t);
    for(const o of s.objectives)repo.insert('objectives',o);
    for(const b of s.schedule)repo.insert('schedule_blocks',b);
    for(const e of s.timeEntries)repo.insert('time_entries',e);
    for(const e of s.expenses)repo.insert('expenses',e);
    for(const m of s.materials)repo.insert('materials',m);
    for(const r of s.materialRequirements)repo.insert('material_requirements',r);
    for(const a of s.materialAdjustments)repo.insert('material_adjustments',a);
    for(const e of s.equipment)repo.insert('equipment',e);
    for(const m of s.maintenance)repo.insert('maintenance_items',m);
    for(const {followUps,...lead} of s.leads){repo.insert('leads',lead);for(const f of followUps)repo.insert('lead_follow_ups',f);}
    if(s.runningTimer)repo.insertTimer(s.runningTimer);
    const result=mutationResultSchema.parse({requestId:request.requestId,revision:current+1,serverNow:now,changed:true,result:{kind:'import-v1'}});
    db.prepare('UPDATE data_revisions SET revision=? WHERE owner_id=?').run(result.revision,ownerId);
    db.prepare('INSERT INTO command_receipts (owner_id,request_id,fingerprint,result_json,created_at) VALUES (?,?,?,?,?)').run(ownerId,request.requestId,fingerprint,JSON.stringify(result),now);
    return result;
  }).immediate();
}
