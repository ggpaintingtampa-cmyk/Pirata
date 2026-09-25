import { z } from 'zod';
// Delete option (2026-09-25): any record a person created can be deleted into a restorable Trash. Nothing is destroyed;
// owner and manager see the Trash and restore from it. Who may delete what is decided server-side (modules/trash).
const id=z.string().min(1).max(100), stamp=z.number().int().nonnegative();
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();
export const TRASH_KINDS=['project','task','client','lead','expense','materialRequest','toolSignOut','question','shift','taskTemplate','projectTemplate','equipment','material','maintenance','equipmentReport','projectNote'] as const;
export type TrashKind=typeof TRASH_KINDS[number];
export const trashKindSchema=z.enum(TRASH_KINDS);
export const trashCommands=[
 command('record.delete',{kind:trashKindSchema,id}),
 command('record.restore',{kind:trashKindSchema,id}),
] as const;
/** One top-level Trash entry; `cascaded` counts the rows that were deleted with it and come back with it. */
export const trashEntrySchema=z.object({kind:trashKindSchema,id,label:z.string(),detail:z.string(),deletedAt:stamp,deletedBy:id.nullable(),cascaded:z.number().int().nonnegative()}).strict();
export type TrashEntry=z.infer<typeof trashEntrySchema>;
export const trashSnapshot={trash:z.array(trashEntrySchema).optional()};
export interface TrashSnapshot {trash?:TrashEntry[]}
