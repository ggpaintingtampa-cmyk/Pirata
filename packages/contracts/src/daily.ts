import { z } from 'zod';
import { isLocalDate } from '@pirata/domain/lib/dates';
import type { BusinessSnapshot, Task } from './index.js';
// Chunk A contracts: three-level task tree helpers, day lists, questions, nested templates.
const id=z.string().min(1).max(100), nullableId=id.nullable(), stamp=z.number().int().nonnegative(), title=z.string().trim().min(1).max(160);
const dateSchema=z.string().refine(isLocalDate,'Enter a valid calendar date.');
const record={id,createdAt:stamp,updatedAt:stamp};
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();

export interface TemplateNode {title:string;description:string;children:TemplateNode[]}
export interface TemplateNodeInput {title:string;description?:string;children?:TemplateNodeInput[]}
export const templateNodeSchema:z.ZodType<TemplateNode,TemplateNodeInput>=z.lazy(()=>z.object({title,description:z.string().trim().max(300).default(''),children:z.array(templateNodeSchema).max(50).default([])}).strict()) as unknown as z.ZodType<TemplateNode,TemplateNodeInput>;
export const templateTreeSchema=z.array(templateNodeSchema).min(1).max(50);
/** Depth of a template tree: 1 = titles only, 3 = tiny tasks present. */
export function templateDepth(nodes:readonly TemplateNode[]):number {return nodes.length?1+Math.max(0,...nodes.map(n=>templateDepth(n.children))):0;}

export const dayScopeSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('person'),userId:id}).strict(),z.object({kind:z.literal('project'),projectId:id}).strict()]);
export type DayScope=z.infer<typeof dayScopeSchema>;

export const dailyCommands=[
 command('task.reorder',{projectId:id,parentTaskId:nullableId.default(null),orderedIds:z.array(id).min(1).max(500).refine(a=>new Set(a).size===a.length,'Duplicate task.')}),
 command('dayList.replace',{date:dateSchema,scope:dayScopeSchema,taskIds:z.array(id).max(500).refine(a=>new Set(a).size===a.length,'Duplicate task.')}),
 command('dayList.take',{id}),
 command('dayList.release',{id}),
 command('dayList.setPresence',{date:dateSchema,projectId:id,userIds:z.array(id).max(50).refine(a=>new Set(a).size===a.length,'Duplicate person.')}),
 command('question.ask',{taskId:id,body:z.string().trim().min(1).max(2000)}),
 command('question.answer',{id,answer:z.string().trim().min(1).max(2000)}),
 command('taskTemplate.saveTree',{name:title,tree:templateTreeSchema}),
 command('taskTemplate.applyTree',{templateId:id,projectId:id,parentTaskId:nullableId.default(null)}),
 command('projectTemplate.save',{name:title,note:z.string().trim().max(1000).default(''),tree:templateTreeSchema}),
 command('projectTemplate.apply',{templateId:id,projectId:id}),
 command('projectTemplate.fromProject',{projectId:id,name:title}),
] as const;

export const dayAssignmentSchema=z.object({...record,date:z.string(),projectId:id,taskId:nullableId,userId:nullableId,position:z.number().int(),createdBy:id}).strict();
export type DayAssignment=z.infer<typeof dayAssignmentSchema>;
export const taskQuestionSchema=z.object({...record,taskId:id,projectId:id,askedBy:id,body:z.string(),answeredAt:stamp.nullable(),answeredBy:nullableId,answer:z.string()}).strict();
export type TaskQuestion=z.infer<typeof taskQuestionSchema>;
export const projectTemplateSchema=z.object({...record,name:z.string(),note:z.string(),tree:z.string(),createdBy:id}).strict();
export type ProjectTemplate=z.infer<typeof projectTemplateSchema>;
export const dailySnapshot={dayAssignments:z.array(dayAssignmentSchema).optional(),taskQuestions:z.array(taskQuestionSchema).optional(),projectTemplates:z.array(projectTemplateSchema).optional()};
export interface DailySnapshot {dayAssignments?:DayAssignment[];taskQuestions?:TaskQuestion[];projectTemplates?:ProjectTemplate[]}

// Pure helpers shared by the Daily page (A) and the reports (B).
const byPosition=(a:Task,b:Task)=>(a.position??0)-(b.position??0)||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
/** 0 = task, 1 = subtask, 2 = tiny task. Throws on corrupt data deeper than three levels. */
export function taskDepth(tasks:readonly Task[],id:string):0|1|2 {
 let depth=0,current=tasks.find(t=>t.id===id);
 while(current?.parentTaskId){depth++;if(depth>2)throw new Error('Task tree deeper than three levels.');const parentId=current.parentTaskId;current=tasks.find(t=>t.id===parentId);}
 return depth as 0|1|2;
}
/** Active children in display order. For top-level tasks (parentId null) filter by project. */
export function orderedChildren(tasks:readonly Task[],parentId:string|null,projectId:string|null):Task[] {
 return tasks.filter(t=>!t.archivedAt&&(t.parentTaskId??null)===parentId&&(parentId!==null||(t.projectId??null)===projectId)).sort(byPosition);
}
/** The node followed by all active descendants, depth first, in display order. */
export function subtree(tasks:readonly Task[],id:string):Task[] {
 const root=tasks.find(t=>t.id===id);if(!root)return [];
 const out:Task[]=[root];
 const walk=(parent:Task)=>{for(const child of orderedChildren(tasks,parent.id,parent.projectId??null)){out.push(child);walk(child);}};
 walk(root);return out;
}
/** Ordered day-list rows (rows with a task) for a person or a project pool. */
export function dayItems(snapshot:Pick<BusinessSnapshot,'dayAssignments'>,date:string,scope:DayScope):DayAssignment[] {
 return (snapshot.dayAssignments??[]).filter(r=>r.date===date&&r.taskId!==null&&(scope.kind==='person'?r.userId===scope.userId:r.projectId===scope.projectId&&r.userId===null))
  .sort((a,b)=>a.position-b.position||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
/** People planned on a project for a date (presence rows carry no task). */
export function presence(snapshot:Pick<BusinessSnapshot,'dayAssignments'>,date:string,projectId:string):string[] {
 return (snapshot.dayAssignments??[]).filter(r=>r.date===date&&r.projectId===projectId&&r.taskId===null&&r.userId!==null).map(r=>r.userId as string);
}
/** Share of leaf tasks done across the rows' subtrees, 0..1 (0 when nothing is planned). */
export function dayCompletion(tasks:readonly Task[],rows:readonly DayAssignment[]):number {
 const leaves:Task[]=[];
 for(const row of rows){if(!row.taskId)continue;const nodes=subtree(tasks,row.taskId);leaves.push(...nodes.filter(n=>!nodes.some(c=>c.parentTaskId===n.id)));}
 return leaves.length?leaves.filter(l=>l.status==='done').length/leaves.length:0;
}
