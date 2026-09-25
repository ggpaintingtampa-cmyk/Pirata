import { z } from 'zod';
// Chunk D contracts: material requests (stored in shopping_items), tool sign-outs, broken reports, locale.
const id=z.string().min(1).max(100), nullableId=id.nullable(), stamp=z.number().int().nonnegative(), title=z.string().trim().min(1).max(160);
const record={id,createdAt:stamp,updatedAt:stamp};
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();

export const LOCALES=['en','es'] as const;
export type Locale=typeof LOCALES[number];
export const toolsCommands=[
 command('materialRequest.create',{title,quantity:z.string().trim().max(80).default(''),note:z.string().trim().max(4000).default(''),projectId:nullableId.default(null),taskId:nullableId.default(null),forUserId:nullableId.default(null)}),
 command('materialRequest.update',{id,title,quantity:z.string().trim().max(80).default(''),note:z.string().trim().max(4000).default('')}),
 command('materialRequest.setReceived',{id,received:z.boolean()}),
 command('materialRequest.remove',{id}),
 command('tool.signOut',{equipmentId:id,projectId:nullableId.default(null),takenAt:stamp.nullable().default(null),note:z.string().trim().max(1000).default('')}),
 command('tool.return',{id,returnedAt:stamp.nullable().default(null)}),
 command('equipment.setSignOutRequired',{id,required:z.boolean()}),
 command('equipment.reportBroken',{id,body:z.string().trim().min(1).max(2000),attachmentId:nullableId.default(null)}),
 command('equipment.resolveReport',{id}),
 command('user.setLocale',{locale:z.enum(LOCALES)}),
] as const;

export const toolSignOutSchema=z.object({...record,equipmentId:id,takenBy:id,takenAt:stamp,projectId:nullableId,returnedAt:stamp.nullable(),returnedBy:nullableId,note:z.string()}).strict();
export type ToolSignOut=z.infer<typeof toolSignOutSchema>;
export const equipmentReportSchema=z.object({...record,equipmentId:id,reportedBy:id,body:z.string(),attachmentId:nullableId,resolvedAt:stamp.nullable(),resolvedBy:nullableId}).strict();
export type EquipmentReport=z.infer<typeof equipmentReportSchema>;
export const toolsSnapshot={toolSignOuts:z.array(toolSignOutSchema).optional(),equipmentReports:z.array(equipmentReportSchema).optional()};
export interface ToolsSnapshot {toolSignOuts?:ToolSignOut[];equipmentReports?:EquipmentReport[]}
