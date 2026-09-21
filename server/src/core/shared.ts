import type { z } from 'zod';
import { blockInputSchema, type Task } from '@pirata/contracts/index';
import type { TransactionContext } from './context.js';
import { conflict, invalid } from './errors.js';
export function assertReference(ctx:TransactionContext,table:'clients'|'projects'|'tasks'|'materials'|'equipment',id:string|null):void {if(id!==null)ctx.repo.require(table,id);}
export function setTaskBlock(ctx:TransactionContext,taskId:string,input:z.infer<typeof blockInputSchema>):{id:string;changed:boolean} {
  const b=blockInputSchema.parse(input),task=ctx.repo.require('tasks',taskId);
  const blocks=ctx.repo.list('schedule_blocks'),existing=blocks.find(x=>x.taskId===taskId);
  if(task.archivedAt)invalid('Restore this task before scheduling it.');
  const overlap=blocks.some(x=>x.id!==existing?.id&&x.date===b.date&&x.startMinute<b.endMinute&&b.startMinute<x.endMinute&&(!x.taskId||!task.assigneeId||!ctx.repo.get('tasks',x.taskId)?.assigneeId||ctx.repo.get('tasks',x.taskId)?.assigneeId===task.assigneeId));
  if(overlap&&!b.allowOverlap)conflict('This block overlaps another plan. Review and explicitly keep the overlap.','SCHEDULE_OVERLAP');
  if(existing&&existing.date===b.date&&existing.startMinute===b.startMinute&&existing.endMinute===b.endMinute&&existing.title===task.title)return {id:existing.id,changed:false};
  const record={id:existing?.id??ctx.newId(),createdAt:existing?.createdAt??ctx.serverNow,updatedAt:ctx.serverNow,date:b.date,startMinute:b.startMinute,endMinute:b.endMinute,kind:'task' as const,title:task.title,taskId};
  if(existing){const {id:_,createdAt:__,...patch}=record;void _;void __;ctx.repo.update('schedule_blocks',existing.id,patch);}else ctx.repo.insert('schedule_blocks',record);
  return {id:record.id,changed:true};
}
/** Insert the task before scheduling; caller's single transaction rolls both back. */
export function createTaskWithSchedule(ctx:TransactionContext,task:Task,schedule?:z.infer<typeof blockInputSchema>):void {assertReference(ctx,'projects',task.projectId);ctx.repo.insert('tasks',task);if(schedule)setTaskBlock(ctx,task.id,schedule);}
export function expectTimer(ctx:TransactionContext,expectedSessionId:string){const timer=ctx.repo.getTimer();if(!timer||timer.sessionId!==expectedSessionId)conflict('The active timer changed. Refresh and review.','TIMER_CONFLICT');return timer;}
export function closeTimer(ctx:TransactionContext,expectedSessionId:string):boolean {
  const timer=expectTimer(ctx,expectedSessionId);
  if(ctx.serverNow<timer.startedAt)conflict('The clock moved backward. Correct the start or discard this session.','CLOCK_CONFLICT');
  ctx.repo.removeTimer();
  if(ctx.serverNow>timer.startedAt)ctx.repo.insert('time_entries',{id:timer.sessionId,taskId:timer.taskId,source:'timer',startedAt:timer.startedAt,endedAt:ctx.serverNow,note:'',createdAt:ctx.serverNow,updatedAt:ctx.serverNow});
  return true;
}
/** Moving, reopening or restoring a child must leave its parent's displayed state truthful. */
export function reconcileParent(ctx:TransactionContext,parentId:string|null|undefined):boolean {
  if(!parentId)return false;
  const parent=ctx.repo.require('tasks',parentId),children=ctx.repo.list('tasks').filter(child=>child.parentTaskId===parentId&&!child.archivedAt);
  if(!children.length||parent.archivedAt)return false;
  const next=children.every(child=>child.status==='done')&&!ctx.repo.listTimers().some(timer=>timer.taskId===parent.id)?'done':parent.status==='done'?'open':parent.status;
  if(next===parent.status)return false;
  ctx.repo.update('tasks',parent.id,{status:next,updatedAt:ctx.serverNow});return true;
}
export function setTaskStatus(ctx:TransactionContext,taskId:string,status:Task['status'],expectedSessionId:string|null):boolean {
  const task=ctx.repo.require('tasks',taskId),timer=ctx.repo.getTimer();
  if(task.archivedAt)invalid('Restore this task before changing its completion.');
  const children=ctx.repo.list('tasks').filter(child=>child.parentTaskId===taskId&&!child.archivedAt);
  const affected=new Set([taskId,...(status==='done'?children.map(child=>child.id):[])]);
  // A shared checklist must never make somebody else's still-running timer invisible.
  if(status!=='open'&&ctx.repo.listTimers().some(active=>affected.has(active.taskId)&&active.sessionId!==timer?.sessionId))conflict('A teammate is timing this work. Ask them to pause their timer before completing it.','TEAM_TIMER_ACTIVE');
  let changed=false;
  if(timer&&affected.has(timer.taskId)&&status!=='open'){if(!expectedSessionId)conflict('Confirm the active timer before changing status.','TIMER_CONFLICT');closeTimer(ctx,expectedSessionId);changed=true;}
  else if(expectedSessionId!==null)conflict('The observed task timer is no longer active.','TIMER_CONFLICT');
  if(task.status!==status){ctx.repo.update('tasks',taskId,{status,updatedAt:ctx.serverNow});changed=true;}
  if(status==='done')for(const child of children)if(child.status!=='done'){ctx.repo.update('tasks',child.id,{status:'done',updatedAt:ctx.serverNow});changed=true;}
  if(reconcileParent(ctx,task.parentTaskId))changed=true;
  return changed;
}
export function assertQuantity(unit:'gal'|'piece',quantity:number):void {if(!Number.isSafeInteger(quantity)||(unit==='piece'&&quantity%100!==0))invalid('Enter a safe integer quantity in hundredths; pieces must be whole.');}
