import { z } from 'zod';
import type { Project, Task } from './index.js';
// Chunk C contracts: job facts, file tags and comments, project lifecycle labels.
const id=z.string().min(1).max(100), stamp=z.number().int().nonnegative();
const record={id,createdAt:stamp,updatedAt:stamp};
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();

export const FACT_KEYS=['client_phone','gate_code','address','paint','store_job_name','client_company','company_contact','custom'] as const;
export const factKeySchema=z.enum(FACT_KEYS);
export type FactKey=z.infer<typeof factKeySchema>;
export const salesCommands=[
 command('projectFact.save',{id:id.optional(),projectId:id,key:factKeySchema,label:z.string().trim().max(80).default(''),value:z.string().trim().max(1000),workerVisible:z.boolean().default(true),position:z.number().int().min(0).max(1000).default(0)}),
 command('projectFact.remove',{id}),
 command('attachment.tag',{attachmentId:id,tag:z.string().trim().min(1).max(40),add:z.boolean()}),
 command('attachment.comment',{attachmentId:id,body:z.string().trim().min(1).max(2000)}),
] as const;

export const projectFactSchema=z.object({...record,projectId:id,key:factKeySchema,label:z.string(),value:z.string(),workerVisible:z.number(),position:z.number(),createdBy:id}).strict();
export type ProjectFact=z.infer<typeof projectFactSchema>;
export const attachmentTagSchema=z.object({...record,attachmentId:id,tag:z.string(),createdBy:id}).strict();
export type AttachmentTag=z.infer<typeof attachmentTagSchema>;
export const attachmentCommentSchema=z.object({...record,attachmentId:id,userId:id,body:z.string()}).strict();
export type AttachmentComment=z.infer<typeof attachmentCommentSchema>;
export const salesSnapshot={projectFacts:z.array(projectFactSchema).optional(),attachmentTags:z.array(attachmentTagSchema).optional(),attachmentComments:z.array(attachmentCommentSchema).optional()};
export interface SalesSnapshot {projectFacts?:ProjectFact[];attachmentTags?:AttachmentTag[];attachmentComments?:AttachmentComment[]}

export const PROJECT_STATUSES=['draft','sold','scheduled','completed'] as const;
export type ProjectStatus=typeof PROJECT_STATUSES[number];
export type ProjectLabel=ProjectStatus|'partial'|'assigned';
/** Allowed status changes. `sold -> scheduled` and `sold -> draft` need the project.review capability. */
export const PROJECT_TRANSITIONS:Readonly<Record<ProjectStatus,readonly ProjectStatus[]>>={draft:['sold'],sold:['scheduled','draft'],scheduled:['completed'],completed:['scheduled']};
/** Derived label: a scheduled project reads `assigned` when every top-level task has a person, `partial` when some do. */
export function projectLabel(project:Pick<Project,'id'|'status'>,tasks:readonly Task[]):ProjectLabel {
 if(project.status!=='scheduled')return project.status;
 const top=tasks.filter(t=>t.projectId===project.id&&!t.parentTaskId&&!t.archivedAt);
 if(!top.length)return 'scheduled';
 const assigned=top.filter(t=>t.assigneeId).length;
 return assigned===top.length?'assigned':assigned?'partial':'scheduled';
}
