import type { BusinessSnapshot, Capabilities, Role } from '@pirata/contracts/index';
import { can, isOfficeRole } from '@pirata/contracts/permissions';
import type { Sqlite } from '../db/database.js';
import { Repositories } from './repositories.js';
import { revision } from './commands.js';
/** Role filters are the guarantee for money and hidden facts; the web only hides what the server already removed. */
export function readSnapshot(db:Sqlite,ownerId:string,capabilities:Capabilities,now=Date.now(),userId=ownerId,role:Role='owner'):BusinessSnapshot {
  return db.transaction(()=>{
    const r=new Repositories(db,ownerId,()=>true,userId),tasks=r.list('tasks'),followUps=r.list('lead_follow_ups');
    const costs=can(role,'money.costs'),sales=can(role,'money.sales'),hiddenFacts=can(role,'facts.hidden'),office=isOfficeRole(role);
    return {currentUser:r.team().find(p=>p.id===userId),team:r.team(),runningTimers:r.listTimers(),dailyGoals:r.list('daily_goals'),taskTemplates:r.list('task_templates'),attachments:r.list('attachments').map(({storageKey:_,previewKey:__,...a})=>{void _;void __;return a;}),activity:r.list('activity').slice(-500),projectNotes:r.list('project_notes'),shoppingItems:r.list('shopping_items'),cleanupObligations:r.list('cleanup_obligations'),cleanupSnoozes:r.list('cleanup_snoozes'),settings:r.settings(),schemaVersion:2 as const,timezone:'America/New_York' as const,currency:'USD' as const,revision:revision(db,ownerId),serverNow:now,capabilities,
      clients:r.list('clients'),
      projects:r.list('projects').map(p=>sales?p:{...p,salesPriceCents:null,materialsPriceCents:null,laborPriceCents:null,salesNote:''}),
      tasks,objectives:r.list('objectives').sort((a,b)=>a.date.localeCompare(b.date)||a.rank-b.rank||a.id.localeCompare(b.id)),
      schedule:r.list('schedule_blocks').map(b=>({...b,title:b.taskId?tasks.find(t=>t.id===b.taskId)!.title:b.title})).sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute||a.id.localeCompare(b.id)),
      timeEntries:r.list('time_entries'),runningTimer:r.getTimer(),expenses:costs?r.list('expenses'):[],materials:r.list('materials'),materialRequirements:r.list('material_requirements'),materialAdjustments:r.list('material_adjustments'),equipment:r.list('equipment'),maintenance:r.list('maintenance_items'),leads:r.list('leads').map(l=>({...l,followUps:followUps.filter(f=>f.leadId===l.id)})),
      // update 2026-09-25 slices
      dayAssignments:r.list('day_assignments'),taskQuestions:r.list('task_questions'),projectTemplates:r.list('project_templates'),
      workShifts:office?r.list('work_shifts'):r.list('work_shifts').filter(s=>s.userId===userId),payRates:costs?r.list('pay_rates'):[],dayNotes:r.list('day_notes'),
      projectFacts:hiddenFacts?r.list('project_facts'):r.list('project_facts').filter(f=>f.workerVisible===1),attachmentTags:r.list('attachment_tags'),attachmentComments:r.list('attachment_comments'),
      toolSignOuts:r.list('tool_sign_outs'),equipmentReports:r.list('equipment_reports')};
  })();
}
