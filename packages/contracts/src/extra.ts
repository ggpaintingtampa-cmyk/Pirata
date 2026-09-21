import { z } from 'zod';
import {isLocalDate} from '@pirata/domain/lib/dates';
const id=z.string().min(1).max(100), nullableId=id.nullable(), stamp=z.number().int().nonnegative(), title=z.string().trim().min(1).max(160), note=z.string().trim().max(4000), text=z.string().trim().max(160).default('');
const record={id,createdAt:stamp,updatedAt:stamp};
export const teamMemberSchema=z.object({id,name:z.string(),username:z.string(),role:z.enum(['owner','employee']),disabledAt:stamp.nullable()}).strict();
export type TeamMember=z.infer<typeof teamMemberSchema>;
export const dailyGoalSchema=z.object({...record,date:z.string(),userId:id,taskId:id,position:z.number().int().min(0).max(2)}).strict();
export type DailyGoal=z.infer<typeof dailyGoalSchema>;
export const taskTemplateSchema=z.object({...record,name:title,titles:z.string()}).strict();
export type TaskTemplate=z.infer<typeof taskTemplateSchema>;
export const attachmentSchema=z.object({...record,parentType:z.enum(['task','project','client']),parentId:id,name:z.string(),mimeType:z.string(),size:stamp,removedAt:stamp.nullable(),uploadedBy:id}).strict();
export type Attachment=z.infer<typeof attachmentSchema>;
export type StoredAttachment=Attachment & {storageKey:string;previewKey:string|null};
export const activitySchema=z.object({...record,userId:id,projectId:nullableId,taskId:nullableId,kind:z.string(),body:z.string()}).strict();
export type Activity=z.infer<typeof activitySchema>;
export const projectNoteSchema=z.object({...record,projectId:id,title,body:note,pinned:z.number(),product:z.string(),color:z.string(),colorCode:z.string(),finish:z.string(),quantity:z.string(),store:z.string(),labelAttachmentId:nullableId,createdBy:id}).strict();
export type ProjectNote=z.infer<typeof projectNoteSchema>;
export const shoppingItemSchema=z.object({...record,title,note,projectId:nullableId,sourceNoteId:nullableId,checkedAt:stamp.nullable(),createdBy:id}).strict();
export type ShoppingItem=z.infer<typeof shoppingItemSchema>;
export const cleanupObligationSchema=z.object({...record,equipmentId:id,userId:id,taskId:nullableId,firstUsedAt:stamp,deadlineAt:stamp,dueAt:stamp,cleaningMinutes:z.number(),completedAt:stamp.nullable()}).strict();
export type CleanupObligation=z.infer<typeof cleanupObligationSchema>;
export const cleanupSnoozeSchema=z.object({...record,obligationId:id,userId:id,fromDueAt:stamp,toDueAt:stamp}).strict();
export type CleanupSnooze=z.infer<typeof cleanupSnoozeSchema>;
export const settingsSchema=z.object({workdayEndMinute:z.number().int().min(0).max(1439),timezone:z.literal('America/New_York')}).strict();
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();
export const extraCommands=[
 command('task.batchCreate',{titles:z.array(title).min(1).max(50),projectId:nullableId,parentTaskId:nullableId,assigneeId:nullableId}),
 command('task.archive',{id,archived:z.boolean()}),
 command('taskTemplate.save',{name:title,titles:z.array(title).min(1).max(50)}),
 command('taskTemplate.apply',{templateId:id,projectId:nullableId,parentTaskId:nullableId}),
 command('dailyGoal.replace',{date:z.string().refine(isLocalDate,'Choose a valid date.'),userId:id,taskIds:z.array(id).max(3).refine(a=>new Set(a).size===a.length)}),
 command('update.post',{projectId:nullableId,taskId:nullableId,body:note.min(1)}),
 command('note.save',{id:id.optional(),projectId:id,title,body:note.default(''),pinned:z.boolean().default(false),product:text,color:text,colorCode:text,finish:text,quantity:text,store:text,labelAttachmentId:nullableId.default(null)}),
 command('shopping.add',{title,note:note.default(''),projectId:nullableId.default(null),sourceNoteId:nullableId.default(null)}),
 command('shopping.check',{id,checked:z.boolean()}),
 command('equipment.cleanupRule',{id,cleaningMinutes:z.number().int().min(1).max(1440),maxCleaningDelayMinutes:z.number().int().min(1).max(525600)}),
 command('equipment.use',{id,taskId:nullableId}),
 command('cleanup.snooze',{id,dueAt:stamp}),command('cleanup.complete',{id}),
 command('settings.update',{workdayEndMinute:z.number().int().min(0).max(1439)}),
] as const;
export const extraSnapshot={currentUser:teamMemberSchema.optional(),team:z.array(teamMemberSchema).optional(),runningTimers:z.array(z.object({userId:id,sessionId:id,taskId:id,startedAt:stamp}).strict()).optional(),dailyGoals:z.array(dailyGoalSchema).optional(),taskTemplates:z.array(taskTemplateSchema).optional(),attachments:z.array(attachmentSchema).optional(),activity:z.array(activitySchema).optional(),projectNotes:z.array(projectNoteSchema).optional(),shoppingItems:z.array(shoppingItemSchema).optional(),cleanupObligations:z.array(cleanupObligationSchema).optional(),cleanupSnoozes:z.array(cleanupSnoozeSchema).optional(),settings:settingsSchema.optional()};
export interface ExtraSnapshot {currentUser?:TeamMember;team?:TeamMember[];runningTimers?:{userId:string;sessionId:string;taskId:string;startedAt:number}[];dailyGoals?:DailyGoal[];taskTemplates?:TaskTemplate[];attachments?:Attachment[];activity?:Activity[];projectNotes?:ProjectNote[];shoppingItems?:ShoppingItem[];cleanupObligations?:CleanupObligation[];cleanupSnoozes?:CleanupSnooze[];settings?:z.infer<typeof settingsSchema>}
