import { afterEach, beforeEach, expect, it } from 'vitest';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';
import { dailyCompletion, projectCompletion } from '@pirata/contracts/progress';
import { COOKIE_NAME } from '../../../src/auth/sessions.js';
import { NOW, setup, type TestApp } from './support.js';

let f:TestApp;
beforeEach(async()=>{f=await setup();});
afterEach(async()=>{await f.close();});
async function employee(){
  const created=await f.app.inject({method:'POST',url:'/api/v1/admin/team',headers:f.auth,payload:{name:'Crew member',username:'crew',password:'fixture-employee-password'}});
  expect(created.statusCode,created.body).toBe(200);
  const pre=await f.app.inject({url:'/api/v1/session'});
  const login=await f.app.inject({method:'POST',url:'/api/v1/login',headers:{origin:f.auth.origin,'x-csrf-token':pre.json().csrfToken,cookie:COOKIE_NAME+'='+pre.cookies.find(cookie=>cookie.name===COOKIE_NAME)!.value},payload:{username:'crew',password:'fixture-employee-password'}});
  expect(login.statusCode,login.body).toBe(200);
  const auth={origin:f.auth.origin,'x-csrf-token':login.json().csrfToken as string,cookie:COOKIE_NAME+'='+login.cookies.find(cookie=>cookie.name===COOKIE_NAME)!.value};
  async function send(command:BusinessCommand){return f.post(f.envelope(command,(await f.snapshot()).revision),auth);}
  return {id:created.json().id as string,auth,send};
}
async function children(parentTaskId:string){await f.save({type:'task.batchCreate',titles:['Prepare','Paint'],projectId:null,parentTaskId,assigneeId:null});return f.repo.list('tasks').filter(task=>task.parentTaskId===parentTaskId);}
it('accepts a title alone and rapid multiline capture without inventing relationships',async()=>{
  const response=await f.app.inject({method:'POST',url:'/api/v1/commands',headers:f.auth,payload:{requestId:crypto.randomUUID(),baseRevision:0,command:{type:'task.create',title:'Capture now'}}});
  expect(response.statusCode,response.body).toBe(200);
  const task=f.repo.require('tasks',response.json().result.id);expect(task).toMatchObject({title:'Capture now',projectId:null,estimatedMinutes:0,parentTaskId:null,assigneeId:null});
  await children(task.id);expect(f.repo.list('tasks')).toHaveLength(3);expect(f.repo.list('projects')).toHaveLength(0);expect(f.repo.list('daily_goals')).toHaveLength(0);
  const child=f.repo.list('tasks').find(item=>item.parentTaskId)!;
  const tiny=await f.send({type:'task.batchCreate',titles:['Tiny step'],projectId:null,parentTaskId:child.id,assigneeId:null});expect(tiny.statusCode).toBe(200);
  expect((await f.send({type:'task.batchCreate',titles:['Too deep'],projectId:null,parentTaskId:tiny.json().result.id,assigneeId:null})).statusCode).toBe(400);
});
it('calculates equal daily/project fractions and retains deliberate goals after incidental creation',async()=>{
  const project=(await f.save({type:'project.create',name:'Doors',clientId:null,clientName:'',address:'',note:''})).result.id!;
  const ids:string[]=[];
  for(const title of ['Front doors','Back doors'])ids.push((await f.save({type:'task.create',title,projectId:project,estimatedMinutes:0,note:''})).result.id!);
  const first=await children(ids[0]);await children(ids[1]);
  await f.save({type:'dailyGoal.replace',date:'2026-09-17',userId:f.ownerId,taskIds:ids});
  await f.save({type:'task.setStatus',id:first[0].id,status:'done',expectedSessionId:null});
  expect(dailyCompletion(ids,f.repo.list('tasks'))).toBe(.25);expect(projectCompletion(project,f.repo.list('tasks'))).toBe(.25);
  await f.task('Incidental');expect(f.repo.list('daily_goals').map(goal=>goal.taskId).sort()).toEqual([...ids].sort());
  await f.save({type:'task.setStatus',id:ids[0],status:'done',expectedSessionId:null});
  expect(dailyCompletion(ids,f.repo.list('tasks'))).toBe(.5);expect(f.repo.require('tasks',first[1].id).status).toBe('done');
  await f.save({type:'task.setStatus',id:first[0].id,status:'open',expectedSessionId:null});expect(f.repo.require('tasks',ids[0]).status).toBe('open');expect(dailyCompletion(ids,f.repo.list('tasks'))).toBe(.25);
  await f.save({type:'task.batchCreate',titles:['Touch up'],projectId:project,parentTaskId:ids[0],assigneeId:null});expect(dailyCompletion(ids,f.repo.list('tasks'))).toBeCloseTo(1/6);
  expect(dailyCompletion([],f.repo.list('tasks'))).toBeNull();
});
it('inherits responsibility/project, preserves explicit overrides and rejects foreign assignments',async()=>{
  const member=await employee(),parent=await f.task(),subtasks=await children(parent);
  await f.save({type:'task.update',id:subtasks[1].id,title:'Paint',projectId:null,estimatedMinutes:0,note:'',assigneeId:f.ownerId});
  await f.save({type:'task.update',id:parent,title:'Doors',projectId:null,estimatedMinutes:0,note:'',assigneeId:member.id});
  expect(f.repo.require('tasks',subtasks[0].id).assigneeId).toBe(member.id);expect(f.repo.require('tasks',subtasks[1].id).assigneeId).toBe(f.ownerId);
  expect((await f.send({type:'task.update',id:parent,title:'Doors',projectId:null,estimatedMinutes:0,note:'',assigneeId:'outside-business'})).statusCode).toBe(400);
  expect((await f.send({type:'dailyGoal.replace',date:'2026-09-17',userId:f.ownerId,taskIds:[parent]})).statusCode).toBe(400);
  expect((await f.send({type:'dailyGoal.replace',date:'2026-02-30',userId:member.id,taskIds:[parent]})).statusCode).toBe(400);
});
it('keeps independent timers, blocks teammate completion and closes parent-child work once',async()=>{
  const member=await employee(),parent=await f.task(),subtasks=await children(parent);
  const own=(await f.save({type:'timer.start',taskId:parent})).result.id!;
  const theirs=await member.send({type:'timer.start',taskId:subtasks[0].id});expect(theirs.statusCode,theirs.body).toBe(200);
  const snapshot=(await f.app.inject({url:'/api/v1/snapshot',headers:member.auth})).json<BusinessSnapshot>();expect(snapshot.runningTimer?.taskId).toBe(subtasks[0].id);expect(snapshot.runningTimers).toHaveLength(2);
  expect((await f.send({type:'task.setStatus',id:parent,status:'done',expectedSessionId:own})).json().error.code).toBe('TEAM_TIMER_ACTIVE');
  f.clock(NOW+1000);expect((await member.send({type:'timer.pause',expectedSessionId:theirs.json().result.id})).statusCode).toBe(200);
  await f.save({type:'task.setStatus',id:parent,status:'done',expectedSessionId:own});expect(f.repo.listTimers()).toHaveLength(0);expect(f.repo.list('time_entries')).toHaveLength(2);
  expect(f.repo.list('tasks').every(task=>task.status==='done')).toBe(true);expect(new Set(f.repo.list('time_entries').map(entry=>entry.userId))).toEqual(new Set([f.ownerId,member.id]));
});
it('templates create real checklist tasks and removal is recoverable without silently changing goals',async()=>{
  const parent=await f.task(),template=(await f.save({type:'taskTemplate.save',name:'Paint sequence',titles:['Prep','Spray']})).result.id!;
  await f.save({type:'taskTemplate.apply',templateId:template,projectId:null,parentTaskId:parent});expect(f.repo.list('tasks')).toHaveLength(3);
  await f.save({type:'dailyGoal.replace',date:'2026-09-17',userId:f.ownerId,taskIds:[parent]});expect((await f.send({type:'task.archive',id:parent,archived:true})).statusCode).toBe(409);
  await f.save({type:'dailyGoal.replace',date:'2026-09-17',userId:f.ownerId,taskIds:[]});await f.save({type:'task.archive',id:parent,archived:true});expect(f.repo.list('tasks').every(task=>task.archivedAt)).toBe(true);
  await f.save({type:'task.archive',id:parent,archived:false});expect(f.repo.list('tasks').every(task=>task.archivedAt===null)).toBe(true);
});
it('permits simultaneous assigned plans but retains same-person overlap confirmation',async()=>{
  const member=await employee(),a=await f.task(),b=await f.task(),c=await f.task();
  for(const [id,assigneeId] of [[a,f.ownerId],[b,member.id],[c,f.ownerId]])await f.save({type:'task.update',id,title:id,projectId:null,estimatedMinutes:0,note:'',assigneeId});
  const block={date:'2026-09-17',startMinute:540,endMinute:600,allowOverlap:false};
  await f.save({type:'schedule.setTaskBlock',taskId:a,block});await f.save({type:'schedule.setTaskBlock',taskId:b,block});expect((await f.send({type:'schedule.setTaskBlock',taskId:c,block})).statusCode).toBe(409);
  await f.save({type:'schedule.setTaskBlock',taskId:c,block:{...block,allowOverlap:true}});expect(f.repo.list('schedule_blocks')).toHaveLength(3);
});
it('reconciles old and new parents when a child is moved or restored',async()=>{
  const first=await f.task('First parent'),second=await f.task('Second parent'),subtasks=await children(first);
  await f.save({type:'task.setStatus',id:subtasks[0].id,status:'done',expectedSessionId:null});
  await f.save({type:'task.setStatus',id:second,status:'done',expectedSessionId:null});
  await f.save({type:'task.update',id:subtasks[1].id,title:'Paint',projectId:null,estimatedMinutes:0,note:'',parentTaskId:second});
  expect(f.repo.require('tasks',first).status).toBe('done');expect(f.repo.require('tasks',second).status).toBe('open');
  await f.save({type:'task.archive',id:subtasks[1].id,archived:true});await f.save({type:'task.setStatus',id:second,status:'done',expectedSessionId:null});
  await f.save({type:'task.archive',id:subtasks[1].id,archived:false});expect(f.repo.require('tasks',second).status).toBe('open');
});
