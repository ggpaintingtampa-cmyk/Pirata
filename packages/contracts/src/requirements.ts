import { z } from 'zod';
// Update 2026-09-29 (P02): materials, tools and preparation notes on template nodes, copied into tasks as a snapshot.
// Phase 1 ships the record shapes so migration 005's table is readable; the commands arrive with phase 4.
const id=z.string().min(1).max(100), nullableId=id.nullable(), stamp=z.number().int().nonnegative();
const record={id,createdAt:stamp,updatedAt:stamp};

export const REQUIREMENT_KINDS=['material','tool','note'] as const;
export type RequirementKind=typeof REQUIREMENT_KINDS[number];
export const templateRequirementSchema=z.object({
  kind:z.enum(REQUIREMENT_KINDS), name:z.string().trim().min(1).max(160),
  materialId:nullableId.default(null), equipmentId:nullableId.default(null),
  quantity:z.string().trim().max(80).default(''), unit:z.string().trim().max(20).default(''), note:z.string().trim().max(1000).default(''),
}).strict();
export type TemplateRequirement=z.infer<typeof templateRequirementSchema>;
export type TemplateRequirementInput=z.input<typeof templateRequirementSchema>;

export const taskRequirementSchema=z.object({...record,taskId:id,kind:z.enum(REQUIREMENT_KINDS),name:z.string(),materialId:nullableId,equipmentId:nullableId,quantity:z.string(),unit:z.string(),note:z.string(),position:z.number().int(),sourceTemplateId:nullableId,sourceTemplateVersion:z.number().int().nullable()}).strict();
export type TaskRequirement=z.infer<typeof taskRequirementSchema>;
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();
/** P02: replace a task's own requirement set (a snapshot; later template edits never touch it). */
export const requirementCommands=[
 command('task.setRequirements',{taskId:id,requirements:z.array(templateRequirementSchema).max(30)}),
] as const;
export const requirementsSnapshot={taskRequirements:z.array(taskRequirementSchema).optional()};
export interface RequirementsSnapshot {taskRequirements?:TaskRequirement[]}

/** Audit row for batch operations (P03, P09, P12). Summary holds ids and counts only. */
export const BATCH_KINDS=['task.bulkCopy','record.bulkDelete','record.bulkRestore','task.applyOrder'] as const;
export const batchOperationSchema=z.object({id,createdAt:stamp,userId:id,kind:z.enum(BATCH_KINDS),summaryJson:z.string()}).strict();
export type BatchOperation=z.infer<typeof batchOperationSchema>;
