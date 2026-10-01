import { z } from 'zod';
import { trashKindSchema } from './trash.js';
import { batchOperationSchema, type BatchOperation } from './requirements.js';
// Update 2026-09-29: batch operations (P03 bulk copy, P09 owner bulk delete). One validated command each, bounded size,
// atomic on the server, replayed by request id like every command. Previews travel as counts the server recomputes.
const id=z.string().min(1).max(100), nullableId=id.nullable();
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();
const unique=(a:readonly string[])=>new Set(a).size===a.length;
export const BULK_COPY_MAX_ROOTS=200, BULK_COPY_MAX_NODES=1000, BULK_DELETE_MAX_ITEMS=200;
export const bulkCopyIncludeSchema=z.object({children:z.boolean().default(true),requirements:z.boolean().default(true),estimates:z.boolean().default(true),notes:z.boolean().default(true),assignments:z.boolean().default(false),schedule:z.boolean().default(false)}).strict();
export type BulkCopyInclude=z.infer<typeof bulkCopyIncludeSchema>;
export const bulkCommands=[
 command('task.bulkCopy',{
  sourceTaskIds:z.array(id).min(1).max(BULK_COPY_MAX_ROOTS).refine(unique,'Duplicate task.'),
  destination:z.object({projectId:id,parentTaskId:nullableId.default(null)}).strict(),
  include:bulkCopyIncludeSchema.default({children:true,requirements:true,estimates:true,notes:true,assignments:false,schedule:false}),
  /** Nodes the client previewed; a mismatch is refused (409 BULK_PREVIEW_STALE) so a stale selection never copies silently. */
  expectedCount:z.number().int().min(1).max(BULK_COPY_MAX_NODES),
 }),
 command('record.bulkDelete',{
  items:z.array(z.object({kind:trashKindSchema,id}).strict()).min(1).max(BULK_DELETE_MAX_ITEMS),
  expected:z.object({roots:z.number().int().nonnegative(),cascaded:z.number().int().nonnegative()}).strict(),
 }),
 command('record.bulkRestore',{batchId:id}),
] as const;
/** `POST trash/preview` → the consequences of a bulk deletion, computed read-only with the same rules the command applies. */
export const bulkDeletePreviewRequestSchema=z.object({items:z.array(z.object({kind:trashKindSchema,id}).strict()).min(1).max(BULK_DELETE_MAX_ITEMS)}).strict();
export interface BulkDeletePreviewRoot {kind:z.infer<typeof trashKindSchema>;id:string;label:string;cascaded:number;blocked?:string}
export interface BulkDeletePreview {roots:BulkDeletePreviewRoot[];totals:{roots:number;cascaded:number};blocked:{kind:z.infer<typeof trashKindSchema>;id:string;reason:string}[];dropped:{kind:z.infer<typeof trashKindSchema>;id:string}[]}
export const bulkSnapshot={batchOperations:z.array(batchOperationSchema).optional()};
export interface BulkSnapshot {batchOperations?:BatchOperation[]}
