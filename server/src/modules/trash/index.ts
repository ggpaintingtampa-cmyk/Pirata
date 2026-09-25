// Delete option (2026-09-25). 'record.delete' moves one record — and only what cannot exist without it — into the Trash;
// 'record.restore' brings the whole group back. Rows are never destroyed. Owner and manager may delete anything they
// can see, a sales rep their own draft projects, and everyone the unprocessed items they created themselves.
import { can, type TrashKind } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, conflict, notFound } from '../../core/errors.js';
import type { DeletionMark, TableName } from '../../core/repositories.js';
import { TRASH_TABLE } from './tables.js';
type Row = Record<string, unknown>;
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
const KIND_LABEL: Record<TrashKind, string> = { project: 'project', task: 'task', client: 'client', lead: 'lead', expense: 'purchase', materialRequest: 'material request', toolSignOut: 'tool sign-out', question: 'question', shift: 'hours entry', taskTemplate: 'task template', projectTemplate: 'project template', equipment: 'equipment', material: 'material', maintenance: 'maintenance item', equipmentReport: 'broken report', projectNote: 'note' };
const title = (row: Row) => String(row.name ?? row.title ?? row.description ?? row.body ?? row.date ?? row.id).slice(0, 80);
/** Who may delete what. Mirrors `mayDelete` in web/src/features/trash/DeleteButton.tsx, which only hides the control. */
function assertMayDelete(ctx: TransactionContext, kind: TrashKind, row: Row): void {
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
function subtree(ctx: TransactionContext, rootId: string): string[] {
  const tasks = ctx.repo.list('tasks'), out: string[] = [];
  const walk = (id: string) => { for (const child of tasks) if (child.parentTaskId === id) { out.push(child.id); walk(child.id); } };
  walk(rootId); return out;
}
function assertNoTimer(ctx: TransactionContext, taskIds: string[]): void {
  const affected = new Set(taskIds);
  if (ctx.repo.listTimers().some(timer => affected.has(timer.taskId))) conflict('Someone is timing this work. Pause the timer before deleting it.', 'TEAM_TIMER_ACTIVE');
}
function log(ctx: TransactionContext, kind: TrashKind, row: Row, verb: 'Deleted' | 'Restored'): void {
  const projectId = kind === 'project' ? String(row.id) : typeof row.projectId === 'string' ? row.projectId : null;
  const taskId = kind === 'task' ? String(row.id) : typeof row.taskId === 'string' ? row.taskId : null;
  ctx.repo.insert('activity', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, projectId, taskId, kind: verb === 'Deleted' ? 'record.delete' : 'record.restore', body: `${verb} ${KIND_LABEL[kind]} “${title(row)}”.` });
}
export const handlers = {
  'record.delete': (ctx, c) => {
    const table = TRASH_TABLE[c.kind];
    const row = ctx.repo.get(table, c.id) as unknown as Row | undefined;
    if (!row) notFound();
    assertMayDelete(ctx, c.kind, row);
    const root = c.kind + ':' + c.id, mark: DeletionMark = { deletedAt: ctx.serverNow, deletedBy: ctx.userId, deletedWith: root };
    const cascade = (t: TableName, rows: { id: string }[]) => { for (const item of rows) ctx.repo.markDeleted(t, item.id, mark); };
    if (c.kind === 'project') {
      const tasks = ctx.repo.list('tasks').filter(task => task.projectId === c.id), taskIds = new Set(tasks.map(task => task.id));
      assertNoTimer(ctx, [...taskIds]);
      cascade('tasks', tasks);
      cascade('task_questions', ctx.repo.list('task_questions').filter(q => q.projectId === c.id || taskIds.has(q.taskId)));
      cascade('shopping_items', ctx.repo.list('shopping_items').filter(item => item.projectId === c.id));
      cascade('project_notes', ctx.repo.list('project_notes').filter(note => note.projectId === c.id));
    } else if (c.kind === 'task') {
      const children = subtree(ctx, c.id), all = new Set([c.id, ...children]);
      assertNoTimer(ctx, [...all]);
      cascade('tasks', children.map(id => ({ id })));
      cascade('task_questions', ctx.repo.list('task_questions').filter(q => all.has(q.taskId)));
    } else if (c.kind === 'client') {
      if (ctx.repo.list('projects').some(project => project.clientId === c.id)) conflict('This client still has projects. Delete or move them first.');
    } else if (c.kind === 'equipment') {
      const signOuts = ctx.repo.list('tool_sign_outs').filter(item => item.equipmentId === c.id);
      if (signOuts.some(item => item.returnedAt === null)) conflict('This tool is signed out. Return it before deleting it.');
      cascade('tool_sign_outs', signOuts);
      cascade('equipment_reports', ctx.repo.list('equipment_reports').filter(report => report.equipmentId === c.id));
      cascade('maintenance_items', ctx.repo.list('maintenance_items').filter(item => item.equipmentId === c.id));
    }
    ctx.repo.markDeleted(table, c.id, { ...mark, deletedWith: null });
    log(ctx, c.kind, row, 'Deleted');
    return { changed: true, result: { kind: c.kind, id: c.id } };
  },
  'record.restore': (ctx, c) => {
    if (!can(ctx.role, 'records.delete') || (c.kind === 'expense' && !can(ctx.role, 'money.costs'))) forbidden('Only the owner or a manager can restore deleted items.');
    const table = TRASH_TABLE[c.kind];
    const row = ctx.repo.getDeleted(table, c.id) as unknown as (Row & DeletionMark) | undefined;
    if (!row) notFound();
    if (row.deletedWith) conflict(`This item was deleted together with its ${KIND_LABEL[row.deletedWith.split(':')[0] as TrashKind] ?? 'parent'}. Restore that first.`);
    const live = (t: TableName, id: unknown) => id == null || ctx.repo.get(t, String(id)) !== undefined;
    const parentsOk = c.kind === 'task' ? live('projects', row.projectId) && live('tasks', row.parentTaskId)
      : c.kind === 'question' ? live('tasks', row.taskId)
      : c.kind === 'materialRequest' ? live('projects', row.projectId) && live('tasks', row.taskId)
      : c.kind === 'projectNote' || c.kind === 'shift' ? live('projects', row.projectId)
      : c.kind === 'toolSignOut' || c.kind === 'equipmentReport' || c.kind === 'maintenance' ? live('equipment', row.equipmentId)
      : c.kind === 'project' ? live('clients', row.clientId) : true;
    if (!parentsOk) conflict('Restore what this item belongs to first (its project, task, client or equipment).');
    const root = c.kind + ':' + c.id;
    ctx.repo.markDeleted(table, c.id, null);
    for (const t of new Set(Object.values(TRASH_TABLE))) for (const item of ctx.repo.listDeleted(t)) if (item.deletedWith === root) ctx.repo.markDeleted(t, item.id, null);
    log(ctx, c.kind, row, 'Restored');
    return { changed: true, result: { kind: c.kind, id: c.id } };
  },
} satisfies Pick<HandlerMap, 'record.delete' | 'record.restore'>;
