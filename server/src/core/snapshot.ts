import type { BusinessSnapshot, Capabilities, Role, TeamMember, TrashEntry, TrashKind } from '@pirata/contracts/index';
import { can, isOfficeRole } from '@pirata/contracts/permissions';
import type { Sqlite } from '../db/database.js';
import { Repositories, type DeletionMark } from './repositories.js';
import { revision } from './commands.js';
import { TRASH_TABLE } from '../modules/trash/tables.js';
/** Top-level Trash entries for the owner and managers: what was deleted, by whom, and how many rows come back with it. */
function trashEntries(r:Repositories,team:TeamMember[]):TrashEntry[] {
  const kinds=Object.keys(TRASH_TABLE) as TrashKind[];
  const rows=kinds.flatMap(kind=>r.listDeleted(TRASH_TABLE[kind]).map(row=>({kind,row:row as unknown as Record<string,unknown>&DeletionMark})));
  const cascaded=new Map<string,number>();
  for(const {row} of rows)if(row.deletedWith)cascaded.set(row.deletedWith,(cascaded.get(row.deletedWith)??0)+1);
  const text=(value:unknown)=>typeof value==='string'?value:'';
  const person=(id:unknown)=>team.find(member=>member.id===id)?.name??'—';
  const equipmentName=(id:unknown)=>r.get('equipment',String(id))?.name??r.getDeleted('equipment',String(id))?.name??'—';
  const projectName=(id:unknown)=>typeof id==='string'?(r.get('projects',id)?.name??r.getDeleted('projects',id)?.name??'—'):'';
  const label=(kind:TrashKind,row:Record<string,unknown>):[string,string]=>{
    switch(kind){
      case 'project':return [text(row.name),text(row.clientName)||text(row.address)];
      case 'task':return [text(row.title),projectName(row.projectId)];
      case 'expense':return [text(row.description),text(row.purchaseDate)+' · $'+(Number(row.amountCents)/100).toFixed(2)];
      case 'materialRequest':return [text(row.title)+(row.quantity?' × '+text(row.quantity):''),projectName(row.projectId)];
      case 'toolSignOut':return [equipmentName(row.equipmentId),person(row.takenBy)];
      case 'question':return [text(row.body).slice(0,80),person(row.askedBy)];
      case 'shift':return [text(row.date)+' · '+person(row.userId),projectName(row.projectId)];
      case 'maintenance':return [text(row.title),text(row.equipmentName)];
      case 'equipmentReport':return [text(row.body).slice(0,80),equipmentName(row.equipmentId)];
      case 'projectNote':return [text(row.title),projectName(row.projectId)];
      default:return [text(row.name),''];
    }
  };
  return rows.filter(({row})=>!row.deletedWith).map(({kind,row})=>{const [entry,detail]=label(kind,row);return {kind,id:String(row.id),label:entry,detail,deletedAt:row.deletedAt,deletedBy:row.deletedBy,cascaded:cascaded.get(kind+':'+String(row.id))??0};}).sort((a,b)=>b.deletedAt-a.deletedAt||a.id.localeCompare(b.id));
}
/** Role filters are the guarantee for money and hidden facts; the web only hides what the server already removed.
 * Deleted records (migration 004) are absent from every collection, and rows that only make sense with them are hidden too. */
export function readSnapshot(db:Sqlite,ownerId:string,capabilities:Capabilities,now=Date.now(),userId=ownerId,role:Role='owner'):BusinessSnapshot {
  return db.transaction(()=>{
    const r=new Repositories(db,ownerId,()=>true,userId),team=r.team();
    const costs=can(role,'money.costs'),sales=can(role,'money.sales'),hiddenFacts=can(role,'facts.hidden'),office=isOfficeRole(role);
    const clients=r.list('clients'),projects=r.list('projects'),tasks=r.list('tasks'),equipment=r.list('equipment'),materials=r.list('materials'),leads=r.list('leads'),followUps=r.list('lead_follow_ups');
    const ids=(rows:{id:string}[])=>new Set(rows.map(row=>row.id));
    const clientIds=ids(clients),projectIds=ids(projects),taskIds=ids(tasks),equipmentIds=ids(equipment),materialIds=ids(materials);
    const liveTask=(id:string|null|undefined)=>id==null||taskIds.has(id),liveProject=(id:string|null|undefined)=>id==null||projectIds.has(id),liveEquipment=(id:string|null|undefined)=>id==null||equipmentIds.has(id);
    const attachments=r.list('attachments').filter(a=>a.parentType==='task'?taskIds.has(a.parentId):a.parentType==='project'?projectIds.has(a.parentId):clientIds.has(a.parentId)),attachmentIds=ids(attachments);
    const cleanupObligations=r.list('cleanup_obligations').filter(o=>equipmentIds.has(o.equipmentId)),obligationIds=ids(cleanupObligations);
    return {currentUser:team.find(p=>p.id===userId),team,runningTimers:r.listTimers(),dailyGoals:r.list('daily_goals').filter(g=>taskIds.has(g.taskId)),taskTemplates:r.list('task_templates'),attachments:attachments.map(({storageKey:_,previewKey:__,...a})=>{void _;void __;return a;}),activity:r.list('activity').slice(-500),projectNotes:r.list('project_notes').filter(n=>projectIds.has(n.projectId)),shoppingItems:r.list('shopping_items').filter(i=>liveProject(i.projectId)&&liveTask(i.taskId)),cleanupObligations,cleanupSnoozes:r.list('cleanup_snoozes').filter(s=>obligationIds.has(s.obligationId)),settings:r.settings(),schemaVersion:2 as const,timezone:'America/New_York' as const,currency:'USD' as const,revision:revision(db,ownerId),serverNow:now,capabilities,
      clients,
      projects:projects.map(p=>sales?p:{...p,salesPriceCents:null,materialsPriceCents:null,laborPriceCents:null,salesNote:''}),
      tasks,objectives:r.list('objectives').map(o=>liveTask(o.taskId)?o:{...o,taskId:null}).sort((a,b)=>a.date.localeCompare(b.date)||a.rank-b.rank||a.id.localeCompare(b.id)),
      schedule:r.list('schedule_blocks').filter(b=>liveTask(b.taskId)).map(b=>({...b,title:b.taskId?tasks.find(t=>t.id===b.taskId)!.title:b.title})).sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute||a.id.localeCompare(b.id)),
      timeEntries:r.list('time_entries').filter(e=>taskIds.has(e.taskId)),runningTimer:r.getTimer(),expenses:costs?r.list('expenses'):[],materials,materialRequirements:r.list('material_requirements').filter(q=>materialIds.has(q.materialId)&&projectIds.has(q.projectId)),materialAdjustments:r.list('material_adjustments').filter(a=>materialIds.has(a.materialId)),equipment,maintenance:r.list('maintenance_items').filter(m=>liveEquipment(m.equipmentId)),leads:leads.map(l=>({...l,followUps:followUps.filter(f=>f.leadId===l.id)})),
      // update 2026-09-25 slices
      dayAssignments:r.list('day_assignments').filter(d=>projectIds.has(d.projectId)&&liveTask(d.taskId)),taskQuestions:r.list('task_questions').filter(q=>taskIds.has(q.taskId)),projectTemplates:r.list('project_templates'),
      workShifts:office?r.list('work_shifts'):r.list('work_shifts').filter(s=>s.userId===userId),payRates:costs?r.list('pay_rates'):[],dayNotes:r.list('day_notes'),
      projectFacts:(hiddenFacts?r.list('project_facts'):r.list('project_facts').filter(f=>f.workerVisible===1)).filter(f=>projectIds.has(f.projectId)),attachmentTags:r.list('attachment_tags').filter(t=>attachmentIds.has(t.attachmentId)),attachmentComments:r.list('attachment_comments').filter(c=>attachmentIds.has(c.attachmentId)),
      toolSignOuts:r.list('tool_sign_outs').filter(s=>equipmentIds.has(s.equipmentId)),equipmentReports:r.list('equipment_reports').filter(e=>equipmentIds.has(e.equipmentId)),
      // update 2026-09-29 slices
      taskRequirements:r.list('task_requirements').filter(q=>taskIds.has(q.taskId)).sort((a,b)=>a.position-b.position||a.createdAt-b.createdAt||a.id.localeCompare(b.id)),translationGlossary:r.list('translation_glossary'),translationEpoch:r.translationEpoch(),
      ...(can(role,'records.delete')?{trash:trashEntries(r,team),batchOperations:r.list('batch_operations')}:{})};
  })();
}
