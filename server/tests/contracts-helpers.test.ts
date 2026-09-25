import { describe, expect, it } from 'vitest';
import { COMMAND_CAPABILITY, can, commandSchema, dayCompletion, dayItems, laborCostCents, monthBounds, orderedChildren, projectLabel, rateFor, shiftCostCents, shiftMinutes, subtree, taskDepth, templateDepth, templateNodeSchema, weekBounds, type DayAssignment, type PayRate, type Task, type WorkShift } from '@pirata/contracts/index';
const t=(id:string,parentTaskId:string|null,extra:Partial<Task>={}):Task=>({id,createdAt:1,updatedAt:1,projectId:'p',title:id,estimatedMinutes:0,status:'open',note:'',parentTaskId,assigneeId:null,assignmentExplicit:0,archivedAt:null,position:0,...extra});
const tasks:Task[]=[t('a',null,{position:1}),t('b',null,{position:0}),t('a1','a'),t('a2','a',{position:1,status:'done'}),t('a1x','a1',{status:'done'}),t('a1y','a1'),t('gone','a',{archivedAt:5})];
describe('task tree helpers',()=>{
  it('computes depth and rejects deeper trees',()=>{expect(taskDepth(tasks,'a')).toBe(0);expect(taskDepth(tasks,'a1')).toBe(1);expect(taskDepth(tasks,'a1x')).toBe(2);expect(()=>taskDepth([...tasks,t('deep','a1x')],'deep')).toThrow();});
  it('orders children by position and skips archived',()=>{expect(orderedChildren(tasks,null,'p').map(x=>x.id)).toEqual(['b','a']);expect(orderedChildren(tasks,'a','p').map(x=>x.id)).toEqual(['a1','a2']);});
  it('walks the subtree depth first',()=>{expect(subtree(tasks,'a').map(x=>x.id)).toEqual(['a','a1','a1x','a1y','a2']);expect(subtree(tasks,'missing')).toEqual([]);});
  it('lists day items per scope and computes completion over leaves',()=>{
    const rows:DayAssignment[]=[{id:'r1',createdAt:1,updatedAt:1,date:'2026-09-25',projectId:'p',taskId:'a',userId:'jose',position:1,createdBy:'m'},{id:'r2',createdAt:1,updatedAt:1,date:'2026-09-25',projectId:'p',taskId:'b',userId:'jose',position:0,createdBy:'m'},{id:'pool',createdAt:1,updatedAt:1,date:'2026-09-25',projectId:'p',taskId:'b',userId:null,position:0,createdBy:'m'},{id:'presence',createdAt:1,updatedAt:1,date:'2026-09-25',projectId:'p',taskId:null,userId:'jose',position:0,createdBy:'m'}];
    expect(dayItems({dayAssignments:rows},'2026-09-25',{kind:'person',userId:'jose'}).map(r=>r.id)).toEqual(['r2','r1']);
    expect(dayItems({dayAssignments:rows},'2026-09-25',{kind:'project',projectId:'p'}).map(r=>r.id)).toEqual(['pool']);
    // leaves of a: a1x (done), a1y, a2 (done); b is a leaf (open) -> 2 of 4
    expect(dayCompletion(tasks,rows.slice(0,2))).toBe(0.5);expect(dayCompletion(tasks,[])).toBe(0);
  });
  it('validates template trees',()=>{const tree=templateNodeSchema.parse({title:'Room',children:[{title:'Prep',children:[{title:'Tape'}]}]});expect(tree.description).toBe('');expect(templateDepth([tree])).toBe(3);});
});
describe('hours helpers',()=>{
  const rates:PayRate[]=[{id:'r1',createdAt:1,updatedAt:1,userId:'jose',kind:'hourly',amountCents:2000,effectiveFrom:'2026-01-01',createdBy:'o'},{id:'r2',createdAt:2,updatedAt:2,userId:'jose',kind:'daily',amountCents:16000,effectiveFrom:'2026-09-01',createdBy:'o'}];
  const shift=(over:Partial<WorkShift>):WorkShift=>({id:'s',createdAt:1,updatedAt:1,userId:'jose',projectId:'p',date:'2026-09-25',kind:'hours',startMinute:480,endMinute:990,breakMinutes:30,daysMinor:null,minutes:480,note:'',status:'approved',submittedBy:'jose',approvedBy:'o',approvedAt:1,decisionNote:'',...over});
  it('derives minutes',()=>{expect(shiftMinutes({kind:'hours',startMinute:480,endMinute:990,breakMinutes:30,daysMinor:null})).toBe(480);expect(shiftMinutes({kind:'day',startMinute:null,endMinute:null,breakMinutes:0,daysMinor:50})).toBe(240);});
  it('picks the rate in effect and costs shifts',()=>{expect(rateFor(rates,'jose','2026-08-31')?.id).toBe('r1');expect(rateFor(rates,'jose','2026-09-25')?.id).toBe('r2');expect(rateFor(rates,'ana','2026-09-25')).toBeUndefined();expect(shiftCostCents(shift({}),rates[0])).toBe(16000);expect(shiftCostCents(shift({minutes:240}),rates[1])).toBe(8000);expect(shiftCostCents(shift({}),undefined)).toBe(0);});
  it('sums approved shifts only, filtered',()=>{const shifts=[shift({}),shift({id:'b',status:'submitted'}),shift({id:'c',projectId:'q',date:'2026-08-15',minutes:60})];expect(laborCostCents(shifts,rates)).toBe(16000+2000);expect(laborCostCents(shifts,rates,{projectId:'p'})).toBe(16000);expect(laborCostCents(shifts,rates,{from:'2026-09-01'})).toBe(16000);});
  it('computes week and month bounds',()=>{expect(weekBounds('2026-09-25')).toEqual({from:'2026-09-21',to:'2026-09-27'});expect(weekBounds('2026-09-21')).toEqual({from:'2026-09-21',to:'2026-09-27'});expect(monthBounds('2026-02-10')).toEqual({from:'2026-02-01',to:'2026-02-28'});});
});
describe('project labels and permissions',()=>{
  it('derives assigned / partial from top-level tasks',()=>{const top=[t('x',null,{assigneeId:'a'}),t('y',null)];expect(projectLabel({id:'p',status:'scheduled'},top)).toBe('partial');expect(projectLabel({id:'p',status:'scheduled'},[top[0]])).toBe('assigned');expect(projectLabel({id:'p',status:'scheduled'},[])).toBe('scheduled');expect(projectLabel({id:'p',status:'sold'},top)).toBe('sold');});
  it('maps roles to capabilities',()=>{expect(can('owner','money.costs')).toBe(true);expect(can('manager','money.costs')).toBe(false);expect(can('manager','money.sales')).toBe(true);expect(can('worker','money.sales')).toBe(false);expect(can(undefined,'plan.others')).toBe(false);});
  it('only names real command types in the capability table',()=>{const types=new Set(commandSchema.options.map(o=>o.shape.type.value as string));for(const type of Object.keys(COMMAND_CAPABILITY))expect(types.has(type),type).toBe(true);});
});
