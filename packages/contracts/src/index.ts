import { z } from 'zod';
import {extraCommands,extraSnapshot,teamMemberSchema,type ExtraSnapshot,type TeamMember} from './extra.js';
export * from './extra.js';
import {dailyCommands,dailySnapshot,type DailySnapshot} from './daily.js';
import {hoursCommands,hoursSnapshot,type HoursSnapshot} from './hours.js';
import {salesCommands,salesSnapshot,PROJECT_STATUSES,type SalesSnapshot} from './sales.js';
import {toolsCommands,toolsSnapshot,type ToolsSnapshot} from './tools.js';
import {trashCommands,trashSnapshot,type TrashSnapshot} from './trash.js';
import {translationCommands,translationSnapshot,type TranslationSnapshot} from './translation.js';
import {requirementCommands,requirementsSnapshot,type RequirementsSnapshot} from './requirements.js';
import {bulkCommands,bulkSnapshot,type BulkSnapshot} from './bulk.js';
export * from './permissions.js';
export * from './daily.js';
export * from './hours.js';
export * from './sales.js';
export * from './tools.js';
export * from './trash.js';
export * from './translation.js';
export * from './requirements.js';
export * from './bulk.js';
import { isLocalDate } from '@pirata/domain/lib/dates';

export const CONTRACT_VERSION = '3.0.0' as const;
export const idSchema = z.string().min(1).max(100);
export const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const timestampSchema = safeInteger;
export const dateSchema = z.string().refine(isLocalDate, 'Enter a valid calendar date.');
export const titleSchema = z.string().trim().min(1).max(160);
export const nameSchema = z.string().trim().min(1).max(100);
export const noteSchema = z.string().trim().max(1000);
const text = z.string().trim().max(160);
const contact = { name: nameSchema, phone: z.string().trim().max(100), email: z.union([z.literal(''), z.email()]), note: noteSchema };
const project = { name: titleSchema, clientId: idSchema.nullable(), clientName: z.string().trim().max(100), address: z.string().trim().max(300), note: noteSchema,
  startDate: dateSchema.nullable().optional(), endDate: dateSchema.nullable().optional(), salesPriceCents: safeInteger.nullable().optional(), materialsPriceCents: safeInteger.nullable().optional(), laborPriceCents: safeInteger.nullable().optional(), salesNote: z.string().trim().max(4000).optional() };
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
const task = { projectId: idSchema.nullable().default(null), title: titleSchema, estimatedMinutes: z.number().int().min(0).max(1440).default(0), note: noteSchema.default(''), description: z.string().trim().max(300).optional(), parentTaskId:idSchema.nullable().optional(), assigneeId:idSchema.nullable().optional() };
export const taskStatusSchema = z.enum(['open','blocked','done']);
export const blockInputSchema = z.object({ date: dateSchema, startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), allowOverlap: z.boolean() }).strict().refine(b => b.endMinute > b.startMinute, {path:['endMinute'],message:'End must follow start within the same day.'});
const expense = { purchaseDate: dateSchema, description: titleSchema, category: z.enum(['materials','tools','fuel','maintenance','other']), amountCents: safeInteger.positive(), projectId: idSchema.nullable() };
const material = { name: titleSchema, product: text, color: text, finish: text, unit: z.enum(['gal','piece']) };
const lead = { name: nameSchema, phone: z.string().trim().max(100), email: z.union([z.literal(''),z.email()]), workDescription: titleSchema, nextFollowUpDate: dateSchema.nullable() };
const maintenance = { equipmentId: idSchema.nullable(), equipmentName: titleSchema, title: titleSchema, dueDate: dateSchema };
export const objectiveInputSchema = z.object({ id: idSchema, title: titleSchema, taskId: idSchema.nullable(), status: z.enum(['open','partial','blocked','done']), note: noteSchema, rank: z.number().int().min(0).max(2) }).strict().refine(o => o.status !== 'blocked' || o.note.length > 0,{path:['note'],message:'Explain the blocker.'});
const command = <T extends string, S extends z.ZodRawShape>(type:T, fields:S) => z.object({type:z.literal(type),...fields}).strict();
export const commandSchema = z.discriminatedUnion('type',[...extraCommands,...dailyCommands,...hoursCommands,...salesCommands,...toolsCommands,...trashCommands,...translationCommands,...requirementCommands,...bulkCommands,
  command('client.create',contact), command('client.update',{id:idSchema,...contact}), command('client.archive',{id:idSchema,archived:z.boolean()}),
  command('project.create',project), command('project.update',{id:idSchema,...project}), command('project.setStatus',{id:idSchema,status:projectStatusSchema,note:noteSchema.optional()}),
  command('lead.create',lead),command('lead.update',{id:idSchema,...lead}), command('lead.followUp',{id:idSchema,note:noteSchema.min(1),nextFollowUpDate:dateSchema.nullable()}), command('lead.convertToClient',{id:idSchema,clientId:idSchema.nullable()}),
  command('task.create',{...task,schedule:blockInputSchema.optional()}),command('task.update',{id:idSchema,...task}),command('task.setStatus',{id:idSchema,status:taskStatusSchema,expectedSessionId:idSchema.nullable()}),
  command('timer.start',{taskId:idSchema}),command('timer.pause',{expectedSessionId:idSchema}),command('timer.switch',{taskId:idSchema,expectedSessionId:idSchema}),command('timer.correctStart',{expectedSessionId:idSchema,startedAt:timestampSchema}),command('timer.discard',{expectedSessionId:idSchema}),
  command('timeEntry.createManual',{taskId:idSchema,date:dateSchema,minutes:z.number().int().min(1).max(1440),note:noteSchema}),
  command('timeEntry.correct',{id:idSchema,correction:z.discriminatedUnion('source',[
    z.object({source:z.literal('manual'),date:dateSchema,minutes:z.number().int().min(1).max(1440),note:noteSchema}).strict(),
    z.object({source:z.literal('timer'),startedAt:timestampSchema,endedAt:timestampSchema,note:noteSchema}).strict().refine(t=>t.endedAt>t.startedAt,{path:['endedAt'],message:'End must follow start.'})
  ])}),
  command('schedule.setTaskBlock',{taskId:idSchema,block:blockInputSchema}),command('schedule.removeTaskBlock',{taskId:idSchema}),
  command('objectives.replaceForDate',{date:dateSchema,objectives:z.array(objectiveInputSchema).max(3).refine(os=>new Set(os.map(o=>o.id)).size===os.length&&new Set(os.map(o=>o.rank)).size===os.length,'IDs and ranks must be unique.')}),
  command('expense.create',expense),command('expense.update',{id:idSchema,...expense}),
  command('material.create',{...material,stockMinor:safeInteger}),command('material.update',{id:idSchema,...material}),command('material.adjust',{materialId:idSchema,deltaMinor:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine(n=>n!==0),reason:z.enum(['restock','usage','correction']),note:noteSchema}),
  command('requirement.set',{materialId:idSchema,projectId:idSchema,neededMinor:safeInteger,reservedMinor:safeInteger}),command('requirement.remove',{id:idSchema}),
  command('equipment.create',{name:titleSchema,note:noteSchema}),command('equipment.update',{id:idSchema,name:titleSchema,note:noteSchema}),command('equipment.archive',{id:idSchema,archived:z.boolean()}),
  command('maintenance.create',maintenance),command('maintenance.update',{id:idSchema,...maintenance}),command('maintenance.complete',{id:idSchema}),command('maintenance.reopen',{id:idSchema}),
]);
export type BusinessCommand = z.infer<typeof commandSchema>;
export type CommandType = BusinessCommand['type'];
export type CommandOf<T extends CommandType> = Extract<BusinessCommand,{type:T}>;
export const mutationRequestSchema = z.object({requestId:z.uuid(),baseRevision:safeInteger,command:commandSchema}).strict();
export type MutationRequest = z.infer<typeof mutationRequestSchema>;
export const mutationResultSchema = z.object({requestId:z.uuid(),revision:safeInteger,serverNow:timestampSchema,changed:z.boolean(),result:z.object({kind:z.string(),id:idSchema.optional()}).strict()}).strict();
export type MutationResult = z.infer<typeof mutationResultSchema>;
export interface ApiFailure { error:{code:string;message:string;fields?:Record<string,string>;currentRevision?:number} }
export interface SessionStatus { authenticated:boolean; csrfToken:string; expiresAt:number; user?:TeamMember }
export type ModuleName = 'clients-projects'|'tasks-time'|'planning'|'spending'|'inventory';
export type Capabilities = Record<ModuleName,'blocked'|'ready'>;

// DTOs exclude owner IDs, credentials and session records. Field names are also
// repository field names; SQL alone uses snake_case.
export interface RecordBase {id:string;createdAt:number;updatedAt:number}
export interface Client extends RecordBase {name:string;phone:string;email:string;note:string;archivedAt:number|null}
export interface Project extends RecordBase {name:string;clientId:string|null;clientName:string;address:string;note:string;status:'draft'|'sold'|'scheduled'|'completed';startDate?:string|null;endDate?:string|null;salesPriceCents?:number|null;materialsPriceCents?:number|null;laborPriceCents?:number|null;salesNote?:string;salesRepId?:string|null;reviewNote?:string;soldAt?:number|null;scheduledAt?:number|null;completedAt?:number|null}
export interface Task extends RecordBase {projectId:string|null;title:string;estimatedMinutes:number;status:'open'|'blocked'|'done';note:string;parentTaskId?:string|null;assigneeId?:string|null;assignmentExplicit?:number;archivedAt?:number|null;description?:string;position?:number;completedAt?:number|null;completedBy?:string|null}
export interface Objective extends RecordBase {date:string;title:string;taskId:string|null;status:'open'|'partial'|'blocked'|'done';note:string;rank:number}
export interface ScheduleBlock extends RecordBase {date:string;startMinute:number;endMinute:number;kind:'task'|'appointment'|'travel'|'supply_run'|'break'|'cleanup';title:string;taskId:string|null}
export interface RunningTimer {sessionId:string;taskId:string;startedAt:number}
export type TimeEntry = RecordBase & {userId?:string} & ({taskId:string;source:'timer';startedAt:number;endedAt:number;note:string}|{taskId:string;source:'manual';date:string;durationSeconds:number;note:string});
export interface Expense extends RecordBase {purchaseDate:string;description:string;category:'materials'|'tools'|'fuel'|'maintenance'|'other';amountCents:number;projectId:string|null}
export interface Material extends RecordBase {name:string;product:string;color:string;finish:string;unit:'gal'|'piece';stockMinor:number}
export interface MaterialRequirement extends RecordBase {materialId:string;projectId:string;neededMinor:number;reservedMinor:number}
export interface MaterialAdjustment extends RecordBase {materialId:string;deltaMinor:number;reason:'restock'|'usage'|'correction';note:string}
export interface Equipment extends RecordBase {name:string;note:string;archivedAt:number|null;cleaningMinutes?:number|null;maxCleaningDelayMinutes?:number|null;requiresSignOut?:number;status?:'ok'|'broken'}
export interface MaintenanceItem extends RecordBase {equipmentId:string|null;equipmentName:string;title:string;dueDate:string;completedAt:number|null}
export interface LeadRecord extends RecordBase {name:string;phone:string;email:string;workDescription:string;nextFollowUpDate:string|null;convertedClientId:string|null}
export interface LeadFollowUp extends RecordBase {leadId:string;at:number;note:string}
export interface Lead extends LeadRecord {followUps:LeadFollowUp[]}
export interface BusinessSnapshot extends ExtraSnapshot, DailySnapshot, HoursSnapshot, SalesSnapshot, ToolsSnapshot, TrashSnapshot, TranslationSnapshot, RequirementsSnapshot,BulkSnapshot {schemaVersion:2;timezone:'America/New_York';currency:'USD';revision:number;serverNow:number;capabilities:Capabilities;clients:Client[];projects:Project[];tasks:Task[];objectives:Objective[];schedule:ScheduleBlock[];timeEntries:TimeEntry[];runningTimer:RunningTimer|null;expenses:Expense[];materials:Material[];materialRequirements:MaterialRequirement[];materialAdjustments:MaterialAdjustment[];equipment:Equipment[];maintenance:MaintenanceItem[];leads:Lead[]}
export interface BusinessService {
  session():Promise<SessionStatus>;
  login(password:string,username?:string):Promise<SessionStatus>;
  logout():Promise<void>;
  snapshot():Promise<BusinessSnapshot>;
  execute(request:MutationRequest):Promise<MutationResult>;
  exportData():Promise<BusinessSnapshot>;
}

const recordBase={id:idSchema,createdAt:timestampSchema,updatedAt:timestampSchema};
const nullableTimestamp=timestampSchema.nullable();
export const clientSchema=z.object({...recordBase,...contact,archivedAt:nullableTimestamp}).strict();
export const projectSchema=z.object({...recordBase,...project,status:projectStatusSchema,salesRepId:idSchema.nullable().optional(),reviewNote:z.string().optional(),soldAt:nullableTimestamp.optional(),scheduledAt:nullableTimestamp.optional(),completedAt:nullableTimestamp.optional()}).strict();
export const taskSchema=z.object({...recordBase,...task,status:taskStatusSchema,assignmentExplicit:z.number().int().min(0).max(1).optional(),archivedAt:timestampSchema.nullable().optional(),position:z.number().int().optional(),completedAt:timestampSchema.nullable().optional(),completedBy:idSchema.nullable().optional()}).strict();
export const objectiveSchema=z.object({...recordBase,date:dateSchema,...objectiveInputSchema.shape}).strict();
export const scheduleBlockSchema=z.object({...recordBase,date:dateSchema,startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440),kind:z.enum(['task','appointment','travel','supply_run','break','cleanup']),title:titleSchema,taskId:idSchema.nullable()}).strict().refine(b=>b.endMinute>b.startMinute&&(b.kind==='task')===(b.taskId!==null));
export const timeEntrySchema=z.discriminatedUnion('source',[
  z.object({...recordBase,userId:idSchema.optional(),taskId:idSchema,source:z.literal('timer'),startedAt:timestampSchema,endedAt:timestampSchema,note:noteSchema}).strict().refine(e=>e.endedAt>e.startedAt),
  z.object({...recordBase,userId:idSchema.optional(),taskId:idSchema,source:z.literal('manual'),date:dateSchema,durationSeconds:z.number().int().min(60).max(86400).multipleOf(60),note:noteSchema}).strict()
]);
export const expenseSchema=z.object({...recordBase,...expense}).strict();
export const materialSchema=z.object({...recordBase,...material,stockMinor:safeInteger}).strict();
export const materialRequirementSchema=z.object({...recordBase,materialId:idSchema,projectId:idSchema,neededMinor:safeInteger,reservedMinor:safeInteger}).strict();
export const materialAdjustmentSchema=z.object({...recordBase,materialId:idSchema,deltaMinor:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine(v=>v!==0),reason:z.enum(['restock','usage','correction']),note:noteSchema}).strict();
export const equipmentSchema=z.object({...recordBase,name:titleSchema,note:noteSchema,archivedAt:nullableTimestamp,cleaningMinutes:safeInteger.nullable().optional(),maxCleaningDelayMinutes:safeInteger.nullable().optional(),requiresSignOut:z.number().int().min(0).max(1).optional(),status:z.enum(['ok','broken']).optional()}).strict();
export const maintenanceSchema=z.object({...recordBase,...maintenance,completedAt:nullableTimestamp}).strict();
export const followUpSchema=z.object({...recordBase,leadId:idSchema,at:timestampSchema,note:noteSchema.min(1)}).strict();
export const leadSchema=z.object({...recordBase,...lead,convertedClientId:idSchema.nullable(),followUps:z.array(followUpSchema)}).strict();
export const sessionStatusSchema=z.object({authenticated:z.boolean(),csrfToken:z.string().min(32),expiresAt:timestampSchema,user:teamMemberSchema.optional()}).strict();
export const apiFailureSchema=z.object({error:z.object({code:z.string(),message:z.string(),fields:z.record(z.string(),z.string()).optional(),currentRevision:safeInteger.optional()}).strict()}).strict();
export const snapshotSchema=z.object({...extraSnapshot,...dailySnapshot,...hoursSnapshot,...salesSnapshot,...toolsSnapshot,...trashSnapshot,...translationSnapshot,...requirementsSnapshot,...bulkSnapshot,schemaVersion:z.literal(2),timezone:z.literal('America/New_York'),currency:z.literal('USD'),revision:safeInteger,serverNow:timestampSchema,
  capabilities:z.object({'clients-projects':z.enum(['blocked','ready']),'tasks-time':z.enum(['blocked','ready']),planning:z.enum(['blocked','ready']),spending:z.enum(['blocked','ready']),inventory:z.enum(['blocked','ready'])}).strict(),
  clients:z.array(clientSchema),projects:z.array(projectSchema),tasks:z.array(taskSchema),objectives:z.array(objectiveSchema),schedule:z.array(scheduleBlockSchema),timeEntries:z.array(timeEntrySchema),runningTimer:z.object({sessionId:idSchema,taskId:idSchema,startedAt:timestampSchema}).strict().nullable(),expenses:z.array(expenseSchema),materials:z.array(materialSchema),materialRequirements:z.array(materialRequirementSchema),materialAdjustments:z.array(materialAdjustmentSchema),equipment:z.array(equipmentSchema),maintenance:z.array(maintenanceSchema),leads:z.array(leadSchema)
}).strict() satisfies z.ZodType<BusinessSnapshot>;
