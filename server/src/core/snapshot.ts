import type { BusinessSnapshot, Capabilities } from '@pirata/contracts/index';
import type { Sqlite } from '../db/database.js';
import { Repositories } from './repositories.js';
import { revision } from './commands.js';
export function readSnapshot(db:Sqlite,ownerId:string,capabilities:Capabilities,now=Date.now(),userId=ownerId,role:'owner'|'employee'='owner'):BusinessSnapshot {
  return db.transaction(()=>{
    const r=new Repositories(db,ownerId,()=>true,userId),tasks=r.list('tasks'),followUps=r.list('lead_follow_ups');
    return {currentUser:r.team().find(p=>p.id===userId),team:r.team(),runningTimers:r.listTimers(),dailyGoals:r.list('daily_goals'),taskTemplates:r.list('task_templates'),attachments:r.list('attachments').map(({storageKey:_,previewKey:__,...a})=>{void _;void __;return a;}),activity:r.list('activity').slice(-500),projectNotes:r.list('project_notes'),shoppingItems:r.list('shopping_items'),cleanupObligations:r.list('cleanup_obligations'),cleanupSnoozes:r.list('cleanup_snoozes'),settings:r.settings(),schemaVersion:2 as const,timezone:'America/New_York' as const,currency:'USD' as const,revision:revision(db,ownerId),serverNow:now,capabilities,
      clients:r.list('clients'),projects:r.list('projects'),tasks,objectives:r.list('objectives').sort((a,b)=>a.date.localeCompare(b.date)||a.rank-b.rank||a.id.localeCompare(b.id)),
      schedule:r.list('schedule_blocks').map(b=>({...b,title:b.taskId?tasks.find(t=>t.id===b.taskId)!.title:b.title})).sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute||a.id.localeCompare(b.id)),
      timeEntries:r.list('time_entries'),runningTimer:r.getTimer(),expenses:role==='owner'?r.list('expenses'):[],materials:r.list('materials'),materialRequirements:r.list('material_requirements'),materialAdjustments:r.list('material_adjustments'),equipment:r.list('equipment'),maintenance:r.list('maintenance_items'),leads:r.list('leads').map(l=>({...l,followUps:followUps.filter(f=>f.leadId===l.id)}))};
  })();
}
