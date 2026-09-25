import { describe, expect, it } from 'vitest';
import type { BusinessSnapshot, Task, TeamMember } from '@pirata/contracts/index';
import { defaultWorkFilters, groupWorkTasks, selectWorkTasks } from '../../src/features/work/myTasks';

const task = (id:string, values:Partial<Task>={}):Task => ({
  id, createdAt:1, updatedAt:1, projectId:null, title:id, estimatedMinutes:0,
  status:'open', note:'', assigneeId:'owner', archivedAt:null, ...values,
});
const owner:TeamMember={id:'owner',name:'Andres',username:'andre',role:'owner',disabledAt:null};
const employee:TeamMember={id:'employee',name:'Jose',username:'jose',role:'worker',disabledAt:null};
const fixture=(tasks:Task[],extra:Partial<BusinessSnapshot>={}):BusinessSnapshot=>({
  schemaVersion:2,timezone:'America/New_York',currency:'USD',revision:0,serverNow:1000,
  capabilities:{'clients-projects':'ready','tasks-time':'ready',planning:'ready',spending:'ready',inventory:'ready'},
  clients:[],projects:[],tasks,objectives:[],schedule:[],timeEntries:[],runningTimer:null,
  expenses:[],materials:[],materialRequirements:[],materialAdjustments:[],equipment:[],maintenance:[],leads:[],
  currentUser:owner,team:[employee,owner],...extra,
});
const date='2026-09-21';
describe('Work task selection',()=>{
  it('includes blocked and unassigned tasks; employees see only their own assignments',()=>{
    const s=fixture([task('own'),task('blocked',{status:'blocked'}),task('unassigned',{assigneeId:null}),task('jose',{assigneeId:employee.id}),task('archived',{archivedAt:10}),task('done',{status:'done'})]);
    expect(selectWorkTasks(s,date,defaultWorkFilters).map(t=>t.id)).toEqual(['own','blocked','unassigned','jose']);
    expect(selectWorkTasks({...s,currentUser:employee},date,defaultWorkFilters).map(t=>t.id)).toEqual(['jose']);
    expect(groupWorkTasks(s,selectWorkTasks(s,date,defaultWorkFilters)).map(g=>g.name)).toEqual(['Andres','Jose','Unassigned']);
  });
  it('keeps complete history, ordered by most recently changed',()=>{
    const s=fixture([1,2,3,4,5].map(n=>task('done-'+n,{status:'done',updatedAt:n})));
    expect(selectWorkTasks(s,date,{...defaultWorkFilters,status:'done'}).map(t=>t.id)).toEqual(['done-5','done-4','done-3','done-2','done-1']);
  });
  it('combines project, person, status and search including parent project fallback',()=>{
    const s=fixture([task('parent',{projectId:'job',title:'Doors'}),task('child',{parentTaskId:'parent',assigneeId:employee.id}),task('other')]);
    expect(selectWorkTasks(s,date,{...defaultWorkFilters,project:'job',person:employee.id,query:' doors '}).map(t=>t.id)).toEqual(['child']);
    expect(selectWorkTasks(s,date,{...defaultWorkFilters,project:'unfiled'}).map(t=>t.id)).toEqual(['other']);
  });
  it('Today uses goals and schedule, includes goal subtasks and excludes incidental or future work',()=>{
    const s=fixture([task('goal'),task('step',{parentTaskId:'goal'}),task('scheduled'),task('future'),task('incidental')],{
      dailyGoals:[{id:'g',createdAt:1,updatedAt:1,date,userId:owner.id,taskId:'goal',position:0}],
      schedule:[{id:'b',createdAt:1,updatedAt:1,date,taskId:'scheduled',kind:'task',title:'Scheduled',startMinute:540,endMinute:600},{id:'f',createdAt:1,updatedAt:1,date:'2026-09-22',taskId:'future',kind:'task',title:'Future',startMinute:540,endMinute:600}],
    });
    const before=JSON.stringify(s);
    expect(selectWorkTasks(s,date,{...defaultWorkFilters,scope:'today'}).map(t=>t.id)).toEqual(['goal','step','scheduled']);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('does not hide historical assignments and excludes children of archived parents',()=>{
    const inactive={...employee,disabledAt:50};
    const s=fixture([task('inactive',{assigneeId:employee.id}),task('unknown',{assigneeId:'old-id'}),task('archived',{archivedAt:10}),task('hidden-child',{parentTaskId:'archived'})],{team:[owner,inactive]});
    const tasks=selectWorkTasks(s,date,defaultWorkFilters);
    expect(tasks.map(t=>t.id)).toEqual(['inactive','unknown']);
    expect(groupWorkTasks(s,tasks).map(g=>g.name)).toEqual(['Jose (inactive)','Unavailable team member']);
  });
  it('includes an employee’s deliberately selected unassigned goal only in Today',()=>{
    const s=fixture([task('goal',{assigneeId:null}),task('step',{parentTaskId:'goal',assigneeId:null}),task('other',{assigneeId:null})],{
      currentUser:employee,dailyGoals:[{id:'g',createdAt:1,updatedAt:1,date,userId:employee.id,taskId:'goal',position:0}],
    });
    expect(selectWorkTasks(s,date,defaultWorkFilters)).toEqual([]);
    expect(selectWorkTasks(s,date,{...defaultWorkFilters,scope:'today'}).map(t=>t.id)).toEqual(['goal','step']);
  });
});
