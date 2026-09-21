import type { HandlerMap, HandlerResult, TransactionContext } from '../../core/context.js';
import { conflict, invalid } from '../../core/errors.js';

const record = (ctx: TransactionContext) => ({ id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
const result = (kind: string, id: string, changed = true): HandlerResult => ({ changed, result: { kind, id } });
const actor = (ctx: TransactionContext) => ctx.userId ?? ctx.ownerId;
const project = (ctx: TransactionContext, id: string | null) => { if (id) ctx.repo.require('projects', id); };

/** Resolve the business day's local end, including DST; no fixed UTC offset. */
export function workdayEnd(now: number, minute: number, timezone: string): number {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = (at: number) => Object.fromEntries(format.formatToParts(at).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const p = parts(now), wall = Date.UTC(p.year, p.month - 1, p.day, Math.floor(minute / 60), minute % 60);
  let at = wall;
  for (let i = 0; i < 4; i++) { const q = parts(at); at += wall - Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second); }
  return Math.max(now, at);
}

export const handlers = {
  'update.post': (ctx, c) => {
    project(ctx, c.projectId);
    const task = c.taskId ? ctx.repo.require('tasks', c.taskId) : null;
    if (task && c.projectId && task.projectId !== c.projectId) invalid('Choose a task in this project.');
    const item = { ...record(ctx), userId: actor(ctx), projectId: c.projectId ?? task?.projectId ?? null, taskId: c.taskId, kind: 'message', body: c.body };
    ctx.repo.insert('activity', item); return result('update', item.id);
  },
  'note.save': (ctx, c) => {
    project(ctx, c.projectId);
    if (c.labelAttachmentId) {
      const file = ctx.repo.require('attachments', c.labelAttachmentId);
      const linkedTask = file.parentType === 'task' ? ctx.repo.require('tasks', file.parentId) : null;
      if (file.removedAt !== null || !(file.parentType === 'project' && file.parentId === c.projectId) && linkedTask?.projectId !== c.projectId) invalid('Choose an available file attached to this project or one of its tasks.');
    }
    const { type: _, id, ...fields } = c; void _;
    const patch = { ...fields, pinned: c.pinned ? 1 : 0 };
    if (id) { ctx.repo.require('project_notes', id); ctx.repo.update('project_notes', id, { ...patch, updatedAt: ctx.serverNow }); return result('note', id); }
    const note = { ...record(ctx), ...patch, createdBy: actor(ctx) };
    ctx.repo.insert('project_notes', note); return result('note', note.id);
  },
  'shopping.add': (ctx, c) => {
    project(ctx, c.projectId);
    if (c.sourceNoteId) { const note = ctx.repo.require('project_notes', c.sourceNoteId); if (note.projectId !== c.projectId) invalid('The note belongs to a different project.'); }
    const { type: _, ...fields } = c; void _;
    const item = { ...record(ctx), ...fields, checkedAt: null, createdBy: actor(ctx) };
    ctx.repo.insert('shopping_items', item); return result('shopping', item.id);
  },
  'shopping.check': (ctx, c) => {
    const previous = ctx.repo.require('shopping_items', c.id), changed = (previous.checkedAt !== null) !== c.checked;
    if (changed) ctx.repo.update('shopping_items', c.id, { checkedAt: c.checked ? ctx.serverNow : null, updatedAt: ctx.serverNow });
    return result('shopping', c.id, changed);
  },
  'equipment.cleanupRule': (ctx, c) => {
    ctx.repo.require('equipment', c.id);
    ctx.repo.update('equipment', c.id, { cleaningMinutes: c.cleaningMinutes, maxCleaningDelayMinutes: c.maxCleaningDelayMinutes, updatedAt: ctx.serverNow });
    return result('equipment', c.id);
  },
  'equipment.use': (ctx, c) => {
    const tool = ctx.repo.require('equipment', c.id);
    if (tool.archivedAt !== null) invalid('Restore this equipment before recording new use.');
    const task = c.taskId ? ctx.repo.require('tasks', c.taskId) : null;
    ctx.repo.insert('activity', { ...record(ctx), userId: actor(ctx), projectId: task?.projectId ?? null, taskId: c.taskId, kind: 'equipment.use', body: `Used ${tool.name}${tool.cleaningMinutes == null || tool.maxCleaningDelayMinutes == null ? ' — cleanup rule needs setup.' : '.'}` });
    const existing = ctx.repo.list('cleanup_obligations').find(item => item.equipmentId === tool.id && item.completedAt === null);
    if (existing) return result('cleanup', existing.id);
    if (tool.cleaningMinutes == null || tool.maxCleaningDelayMinutes == null) return result('cleanupRuleNeeded', tool.id);
    const settings = ctx.repo.settings(), deadlineAt = ctx.serverNow + tool.maxCleaningDelayMinutes * 60000;
    const item = { ...record(ctx), equipmentId: tool.id, userId: actor(ctx), taskId: c.taskId, firstUsedAt: ctx.serverNow, deadlineAt, dueAt: Math.min(workdayEnd(ctx.serverNow, settings.workdayEndMinute, settings.timezone), deadlineAt), cleaningMinutes: tool.cleaningMinutes, completedAt: null };
    ctx.repo.insert('cleanup_obligations', item); return result('cleanup', item.id);
  },
  'cleanup.snooze': (ctx, c) => {
    const item = ctx.repo.require('cleanup_obligations', c.id);
    if (item.completedAt !== null) conflict('This equipment has already been cleaned.');
    if (c.dueAt <= item.dueAt || c.dueAt <= ctx.serverNow || c.dueAt > item.deadlineAt) invalid('Choose a later time no later than the fixed cleaning deadline.', { dueAt: 'The deadline cannot be extended.' });
    ctx.repo.insert('cleanup_snoozes', { ...record(ctx), obligationId: item.id, userId: actor(ctx), fromDueAt: item.dueAt, toDueAt: c.dueAt });
    ctx.repo.update('cleanup_obligations', item.id, { dueAt: c.dueAt, updatedAt: ctx.serverNow });
    return result('cleanup', item.id);
  },
  'cleanup.complete': (ctx, c) => {
    const item = ctx.repo.require('cleanup_obligations', c.id), changed = item.completedAt === null;
    if (changed) ctx.repo.update('cleanup_obligations', item.id, { completedAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('cleanup', item.id, changed);
  },
} satisfies Pick<HandlerMap, 'update.post' | 'note.save' | 'shopping.add' | 'shopping.check' | 'equipment.cleanupRule' | 'equipment.use' | 'cleanup.snooze' | 'cleanup.complete'>;
