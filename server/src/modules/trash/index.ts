// Delete option (2026-09-25). 'record.delete' moves one record — and only what cannot exist without it — into the Trash;
// 'record.restore' brings the whole group back. Rows are never destroyed. Owner and manager may delete anything they
// can see, a sales rep their own draft projects, and everyone the unprocessed items they created themselves.
// Update 2026-09-29 (P09): the same rules are split into a read-only plan and an apply step so an owner can review a
// batch before it runs; the batch is one transaction with a stale-preview check and an audit row.
import { can, type TrashKind, type BulkDeletePreview } from '@pirata/contracts/index';
import { canAccessProjectJournals } from '@pirata/contracts/permissions';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, conflict, notFound } from '../../core/errors.js';
import type { DeletionMark, TableName } from '../../core/repositories.js';
import { TRASH_TABLE } from './tables.js';
type Row = Record<string, unknown>;
type ReadContext = Pick<TransactionContext, 'repo' | 'role' | 'userId' | 'ownerId'>;
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
const KIND_LABEL: Record<TrashKind, string> = { project: 'project', task: 'task', client: 'client', lead: 'lead', expense: 'purchase', materialRequest: 'material request', toolSignOut: 'tool sign-out', question: 'question', shift: 'hours entry', taskTemplate: 'task template', projectTemplate: 'project template', equipment: 'equipment', material: 'material', maintenance: 'maintenance item', equipmentReport: 'equipment report', projectNote: 'project note' };
const title = (row: Row) => String(row.name ?? row.title ?? row.description ?? row.body ?? row.date ?? row.id).slice(0, 80);
/** Rows that leave and return with their parent: every Trash table plus task requirements (P02). */
const CASCADE_TABLES: TableName[] = [...new Set(Object.values(TRASH_TABLE)), 'task_requirements'];
/** Who may delete what. Mirrors `mayDelete` in web/src/features/trash/DeleteButton.tsx, which only hides the control. */
function assertMayDelete(ctx: ReadContext, kind: TrashKind, row: Row): void {
  if (kind==='projectNote'&&row.noteKind==='journal'&&!canAccessProjectJournals(ctx.ownerId,ctx.userId,ctx.role)) notFound();
  if (kind === 'expense') { if (!can(ctx.role, 'money.costs')) forbidden('Only the owner can delete purchases.'); return; }
  if (kind === 'taskTemplate' || kind === 'projectTemplate') { if (!can(ctx.role, 'template.manage')) forbidden('Only the office can delete templates.'); return; }
  if (can(ctx.role, 'records.delete')) return;
  const mine = (field: string) => row[field] === ctx.userId;
  const own = kind === 'project' ? mine('salesRepId') && row.status === 'draft'
    : kind === 'task' ? (() => { const project = typeof row.projectId === 'string' ? ctx.repo.get('projects', row.projectId) : undefined; return !!project && project.salesRepId === ctx.userId && project.status === 'draft'; })()
    : kind === 'materialRequest' ? mine('createdBy') && row.receivedAt == null
    : kind === 'toolSignOut' ? mine('takenBy') && row.returnedAt == null
    : kind === 'question' ? mine('askedBy') && row.answeredAt == null
    : kind === 'shift' ? mine('userId') && row.status === 'submitted'
    : kind === 'equipmentReport' ? mine('reportedBy') && row.resolvedAt == null
    : kind === 'projectNote' ? mine('createdBy') : false;
  if (!own) forbidden('Only the owner or a manager can delete this.');
}
function subtree(ctx: ReadContext, rootId: string): string[] {
  const tasks = ctx.repo.list('tasks'), out: string[] = [];
  const walk = (id: string) => { for (const child of tasks) if (child.parentTaskId === id) { out.push(child.id); walk(child.id); } };
  walk(rootId); return out;
}
function timerBlock(ctx: ReadContext, taskIds: string[]): Block | null {
  const affected = new Set(taskIds);
  return ctx.repo.listTimers().some(timer => affected.has(timer.taskId)) ? { code: 'TEAM_TIMER_ACTIVE', reason: 'Someone is timing this work. Pause the timer before deleting it.' } : null;
}
function log(ctx: TransactionContext, kind: TrashKind, row: Row, verb: 'Deleted' | 'Restored'): void {
  const projectId = kind === 'project' ? String(row.id) : typeof row.projectId === 'string' ? row.projectId : null;
  const taskId = kind === 'task' ? String(row.id) : typeof row.taskId === 'string' ? row.taskId : null;
  const prefix=kind==='projectNote'&&row.noteKind==='journal'?'journal':'record';
  ctx.repo.insert('activity', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, projectId, taskId, kind: prefix+(verb==='Deleted'?'.delete':'.restore'), body: `${verb} ${KIND_LABEL[kind]} “${title(row)}”.` });
}
interface Block { code: string; reason: string }
export interface DeletionRoot { kind: TrashKind; id: string; row: Row; cascades: { table: TableName; ids: string[] }[]; blocked: Block | null }
/** Everything one deletion would touch, without writing. Throws for a missing record or a forbidden kind, like the command. */
export function planDeletion(ctx: ReadContext, kind: TrashKind, id: string): DeletionRoot {
  const table = TRASH_TABLE[kind];
  const row = ctx.repo.get(table, id) as unknown as Row | undefined;
  if (!row) notFound();
  assertMayDelete(ctx, kind, row);
  const cascades: DeletionRoot['cascades'] = [];
  let blocked: Block | null = null;
  const cascade = (t: TableName, rows: { id: string }[]) => { if (rows.length) cascades.push({ table: t, ids: rows.map(item => item.id) }); };
  if (kind === 'project') {
    const tasks = ctx.repo.list('tasks').filter(task => task.projectId === id), taskIds = new Set(tasks.map(task => task.id));
    blocked = timerBlock(ctx, [...taskIds]);
    cascade('tasks', tasks);
    cascade('task_requirements', ctx.repo.list('task_requirements').filter(r => taskIds.has(r.taskId)));
    cascade('task_questions', ctx.repo.list('task_questions').filter(q => q.projectId === id || taskIds.has(q.taskId)));
    cascade('shopping_items', ctx.repo.list('shopping_items').filter(item => item.projectId === id));
    cascade('project_notes', ctx.repo.list('project_notes').filter(note => note.projectId === id));
  } else if (kind === 'task') {
    const children = subtree(ctx, id), all = new Set([id, ...children]);
    blocked = timerBlock(ctx, [...all]);
    cascade('tasks', children.map(childId => ({ id: childId })));
    cascade('task_requirements', ctx.repo.list('task_requirements').filter(r => all.has(r.taskId)));
    cascade('task_questions', ctx.repo.list('task_questions').filter(q => all.has(q.taskId)));
  } else if (kind === 'client') {
    if (ctx.repo.list('projects').some(project => project.clientId === id)) blocked = { code: 'CONFLICT', reason: 'This client still has projects. Delete or move them first.' };
  } else if (kind === 'equipment') {
    const signOuts = ctx.repo.list('tool_sign_outs').filter(item => item.equipmentId === id);
    if (signOuts.some(item => item.returnedAt === null)) blocked = { code: 'CONFLICT', reason: 'This tool is signed out. Return it before deleting it.' };
    cascade('tool_sign_outs', signOuts);
    cascade('equipment_reports', ctx.repo.list('equipment_reports').filter(report => report.equipmentId === id));
    cascade('maintenance_items', ctx.repo.list('maintenance_items').filter(item => item.equipmentId === id));
  }
  return { kind, id, row, cascades, blocked };
}
/** Apply a plan: cascaded rows carry the root in `deletedWith`, the root itself is top-level. */
function applyDeletion(ctx: TransactionContext, plan: DeletionRoot): void {
  if (plan.blocked) conflict(plan.blocked.reason, plan.blocked.code);
  const root = plan.kind + ':' + plan.id, mark: DeletionMark = { deletedAt: ctx.serverNow, deletedBy: ctx.userId, deletedWith: root };
  for (const { table, ids } of plan.cascades) for (const id of ids) ctx.repo.markDeleted(table, id, mark);
  ctx.repo.markDeleted(TRASH_TABLE[plan.kind], plan.id, { ...mark, deletedWith: null });
  log(ctx, plan.kind, plan.row, 'Deleted');
}
/** P09: normalise a selection (a task under a selected project or ancestor, and a project's own records, are already covered)
 *  and plan every remaining root. Read-only; the preview route and the batch command share it. */
export function deletionPlan(ctx: ReadContext, items: readonly { kind: TrashKind; id: string }[]): { roots: DeletionRoot[]; preview: BulkDeletePreview } {
  const tasks = ctx.repo.list('tasks');
  const selectedProjects = new Set(items.filter(i => i.kind === 'project').map(i => i.id)), selectedTasks = new Set(items.filter(i => i.kind === 'task').map(i => i.id));
  const underSelection = (taskId: string | null | undefined): boolean => {
    for (let id = taskId ?? null; id;) { const task = tasks.find(t => t.id === id); if (!task) return false; if (selectedProjects.has(task.projectId ?? '')) return true; const parentId = task.parentTaskId ?? null; if (parentId && selectedTasks.has(parentId)) return true; id = parentId; }
    return false;
  };
  const seen = new Set<string>(), roots: DeletionRoot[] = [], dropped: BulkDeletePreview['dropped'] = [];
  for (const item of items) {
    const key = item.kind + ':' + item.id;
    if (seen.has(key)) continue; seen.add(key);
    const row = ctx.repo.get(TRASH_TABLE[item.kind], item.id) as unknown as Row | undefined;
    if (!row) notFound();
    assertMayDelete(ctx,item.kind,row);
    const covered = item.kind === 'task' ? underSelection(item.id) || selectedProjects.has(String(row.projectId ?? ''))
      : item.kind === 'question' ? selectedTasks.has(String(row.taskId)) || underSelection(String(row.taskId)) || selectedProjects.has(String(row.projectId))
      : item.kind === 'materialRequest' || item.kind === 'projectNote' ? selectedProjects.has(String(row.projectId ?? '')) : false;
    if (covered) { dropped.push({ kind: item.kind, id: item.id }); continue; }
    roots.push(planDeletion(ctx, item.kind, item.id));
  }
  const preview: BulkDeletePreview = {
    roots: roots.map(root => ({ kind: root.kind, id: root.id, label: title(root.row), cascaded: root.cascades.reduce((n, c) => n + c.ids.length, 0), ...(root.blocked ? { blocked: root.blocked.reason } : {}) })),
    totals: { roots: roots.length, cascaded: roots.reduce((n, root) => n + root.cascades.reduce((m, c) => m + c.ids.length, 0), 0) },
    blocked: roots.filter(root => root.blocked).map(root => ({ kind: root.kind, id: root.id, reason: root.blocked!.reason })),
    dropped,
  };
  return { roots, preview };
}
/** Bring one top-level deleted record and everything deleted with it back. Returns false when it is not in the Trash. */
function restoreRecord(ctx: TransactionContext, kind: TrashKind, id: string, strict: boolean): boolean {
  const table = TRASH_TABLE[kind];
  const row = ctx.repo.getDeleted(table, id) as unknown as (Row & DeletionMark) | undefined;
  if (!row) { if (strict) notFound(); return false; }
  if (kind==='projectNote'&&row.noteKind==='journal'&&!canAccessProjectJournals(ctx.ownerId,ctx.userId,ctx.role)) { if(strict) notFound(); return false; }
  if (row.deletedWith) conflict(`This item was deleted together with its ${KIND_LABEL[row.deletedWith.split(':')[0] as TrashKind] ?? 'parent'}. Restore that first.`);
  const live = (t: TableName, ref: unknown) => ref == null || ctx.repo.get(t, String(ref)) !== undefined;
  const parentsOk = kind === 'task' ? live('projects', row.projectId) && live('tasks', row.parentTaskId)
    : kind === 'question' ? live('tasks', row.taskId)
    : kind === 'materialRequest' ? live('projects', row.projectId) && live('tasks', row.taskId)
    : kind === 'projectNote' || kind === 'shift' ? live('projects', row.projectId)
    : kind === 'toolSignOut' || kind === 'equipmentReport' || kind === 'maintenance' ? live('equipment', row.equipmentId)
    : kind === 'project' ? live('clients', row.clientId) : true;
  if (!parentsOk) conflict('Restore what this item belongs to first (its project, task, client or equipment).');
  const root = kind + ':' + id;
  ctx.repo.markDeleted(table, id, null);
  for (const t of CASCADE_TABLES) for (const item of ctx.repo.listDeleted(t)) if (item.deletedWith === root) ctx.repo.markDeleted(t, item.id, null);
  log(ctx, kind, row, 'Restored');
  return true;
}
export const handlers = {
  'record.delete': (ctx, c) => {
    applyDeletion(ctx, planDeletion(ctx, c.kind, c.id));
    return { changed: true, result: { kind: c.kind, id: c.id } };
  },
  'record.restore': (ctx, c) => {
    if (!can(ctx.role, 'records.delete') || (c.kind === 'expense' && !can(ctx.role, 'money.costs'))) forbidden('Only the owner or a manager can restore deleted items.');
    restoreRecord(ctx, c.kind, c.id, true);
    return { changed: true, result: { kind: c.kind, id: c.id } };
  },
  /** P09: owner-only, atomic, reviewed. Any blocked root aborts the whole batch; a changed selection is refused as stale. */
  'record.bulkDelete': (ctx, c) => {
    if (!can(ctx.role, 'records.bulkDelete')) forbidden('Only the owner can delete records in bulk.');
    const { roots, preview } = deletionPlan(ctx, c.items);
    const blocked = roots.find(root => root.blocked);
    if (blocked) conflict(blocked.blocked!.reason, blocked.blocked!.code);
    if (preview.totals.roots !== c.expected.roots || preview.totals.cascaded !== c.expected.cascaded) throw new ApiError(409, 'BULK_PREVIEW_STALE', 'The selection changed since the preview. Review it again before deleting.');
    if (!roots.length) return { changed: false, result: { kind: 'batch' } };
    for (const root of roots) applyDeletion(ctx, root);
    const batchId = ctx.newId();
    ctx.repo.insert('batch_operations', { id: batchId, createdAt: ctx.serverNow, userId: ctx.userId, kind: 'record.bulkDelete', summaryJson: JSON.stringify({ roots: roots.map(root => root.kind + ':' + root.id), cascaded: preview.totals.cascaded }) });
    ctx.repo.insert('activity', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, projectId: null, taskId: null, kind: 'record.bulkDelete', body: `Deleted ${roots.length} records in one batch (${preview.totals.cascaded} linked rows moved with them).` });
    return { changed: true, result: { kind: 'batch', id: batchId } };
  },
  /** P09: restore every root of a batch that is still in the Trash; roots already restored are skipped. */
  'record.bulkRestore': (ctx, c) => {
    if (!can(ctx.role, 'records.delete')) forbidden('Only the owner or a manager can restore deleted items.');
    const batch = ctx.repo.get('batch_operations', c.batchId);
    if (!batch || batch.kind !== 'record.bulkDelete') notFound();
    const summary = JSON.parse(batch.summaryJson) as { roots: string[] };
    const restored: string[] = [];
    for (const entry of summary.roots) {
      const at = entry.indexOf(':'), kind = entry.slice(0, at) as TrashKind, id = entry.slice(at + 1);
      if (kind === 'expense' && !can(ctx.role, 'money.costs')) continue;
      if (restoreRecord(ctx, kind, id, false)) restored.push(entry);
    }
    if (!restored.length) return { changed: false, result: { kind: 'batch', id: c.batchId } };
    ctx.repo.insert('batch_operations', { id: ctx.newId(), createdAt: ctx.serverNow, userId: ctx.userId, kind: 'record.bulkRestore', summaryJson: JSON.stringify({ batchId: c.batchId, restored }) });
    return { changed: true, result: { kind: 'batch', id: c.batchId } };
  },
} satisfies Pick<HandlerMap, 'record.delete' | 'record.restore' | 'record.bulkDelete' | 'record.bulkRestore'>;
