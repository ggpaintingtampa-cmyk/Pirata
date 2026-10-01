// Update 2026-09-29 (P03): copy selected task trees into a destination in one validated, atomic, replay-safe command.
// Content, hierarchy, estimates, notes and requirements copy by default; recorded work, hours, questions, attachments
// and history never do. Assignments and planned dates copy only when asked for explicitly.
import { BULK_COPY_MAX_NODES, orderedChildren, subtree, taskDepth, type Task } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import type { HandlerMap } from '../../core/context.js';
import { ApiError, invalid } from '../../core/errors.js';
import { byPosition, copyRequirements, createTask } from '../tasks-time/index.js';
/** Drop ids whose ancestor is also selected (they copy with it) and repeats; keep first-appearance order. */
export function normalizeSelection(all: readonly Task[], ids: readonly string[]): string[] {
  const chosen = new Set(ids), byId = new Map(all.map(task => [task.id, task]));
  const hasSelectedAncestor = (id: string): boolean => { for (let parent = byId.get(id)?.parentTaskId ?? null; parent; parent = byId.get(parent)?.parentTaskId ?? null) if (chosen.has(parent)) return true; return false; };
  const out: string[] = [];
  for (const id of ids) if (!out.includes(id) && !hasSelectedAncestor(id)) out.push(id);
  return out;
}
const liveSubtree = (all: readonly Task[], id: string) => subtree(all, id).filter(node => !node.archivedAt);
const subtreeDepth = (all: readonly Task[], id: string): number => { const children = all.filter(t => t.parentTaskId === id && !t.archivedAt); return children.length ? 1 + Math.max(...children.map(child => subtreeDepth(all, child.id))) : 0; };
export const handlers = {
  'task.bulkCopy': (ctx, c) => {
    const destination = ctx.repo.require('projects', c.destination.projectId);
    if (destination.status === 'completed') invalid('Choose a destination project that is not completed.');
    const all = ctx.repo.list('tasks');
    const parent = c.destination.parentTaskId ? ctx.repo.require('tasks', c.destination.parentTaskId) : null;
    if (parent && (parent.projectId !== destination.id || parent.archivedAt)) invalid('The destination parent must be an active task in the destination project.');
    const roots = normalizeSelection(all, c.sourceTaskIds).map(id => ctx.repo.require('tasks', id));
    if (roots.some(root => root.archivedAt)) invalid('Restore archived tasks before copying them.');
    const nodesOf = (root: Task) => c.include.children ? liveSubtree(all, root.id) : [root];
    const total = roots.reduce((n, root) => n + nodesOf(root).length, 0);
    if (total > BULK_COPY_MAX_NODES) invalid(`Copy at most ${BULK_COPY_MAX_NODES} tasks at a time.`);
    if (total !== c.expectedCount) throw new ApiError(409, 'BULK_PREVIEW_STALE', 'The tasks changed since the preview. Review the selection again.');
    const base = parent ? taskDepth(all, parent.id) + 1 : 0;
    for (const root of roots) if (base + (c.include.children ? subtreeDepth(all, root.id) : 0) > 2) invalid('Tasks can only nest three levels deep: task, subtask, tiny task.');
    const team = ctx.repo.team(), blocks = ctx.repo.list('schedule_blocks'), today = businessDate(ctx.serverNow), mapping: [string, string][] = [];
    const copy = (task: Task, parentTaskId: string | null): string => {
      const assignee = c.include.assignments && task.assigneeId && task.assignmentExplicit && team.some(member => member.id === task.assigneeId && member.disabledAt === null) ? task.assigneeId : undefined;
      const id = createTask(ctx, task.title, { projectId: destination.id, parentTaskId, ...(assignee ? { assigneeId: assignee } : {}) }, c.include.estimates ? task.estimatedMinutes : 0, c.include.notes ? task.note : '', task.description ?? '');
      mapping.push([task.id, id]);
      if (c.include.requirements) copyRequirements(ctx, task.id, id);
      if (c.include.schedule) for (const block of blocks.filter(b => b.taskId === task.id && b.date >= today)) ctx.repo.insert('schedule_blocks', { ...block, id: ctx.newId(), taskId: id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
      if (c.include.children) for (const child of orderedChildren(all, task.id, task.projectId ?? null)) if (!child.archivedAt) copy(child, id);
      return id;
    };
    const firsts = roots.map(root => copy(root, parent?.id ?? null));
    const batchId = ctx.newId();
    ctx.repo.insert('batch_operations', { id: batchId, createdAt: ctx.serverNow, userId: ctx.userId, kind: 'task.bulkCopy', summaryJson: JSON.stringify({ roots: roots.length, nodes: mapping.length, destinationProjectId: destination.id, parentTaskId: parent?.id ?? null, include: c.include, mapping }) });
    ctx.repo.insert('activity', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, projectId: destination.id, taskId: null, kind: 'task.bulkCopy', body: `Copied ${mapping.length} tasks into “${destination.name}”.` });
    return { changed: true, result: { kind: 'tasks', id: firsts[0] } };
  },
  /** P12: the reviewed proposal becomes an ordinary reorder, audited in the same transaction. Scheduled times never change. */
  'task.applyOrder': (ctx, c) => {
    const siblings = ctx.repo.list('tasks').filter(t => !t.archivedAt && (t.parentTaskId ?? null) === c.parentTaskId && (c.parentTaskId !== null || (t.projectId ?? null) === c.projectId)).sort(byPosition);
    const byId = new Map(siblings.map(t => [t.id, t]));
    if (c.orderedIds.length !== siblings.length || c.orderedIds.some(id => !byId.has(id))) throw new ApiError(409, 'ORDER_STALE', 'The task list changed since this order was proposed. Ask for a fresh proposal.');
    const before = siblings.map(t => t.id);
    let changed = false;
    c.orderedIds.forEach((id, position) => { const task = byId.get(id)!; if ((task.position ?? 0) !== position) { ctx.repo.update('tasks', id, { position, updatedAt: ctx.serverNow }); changed = true; } });
    if (!changed) return { changed: false, result: { kind: 'tasks', id: c.orderedIds[0] } };
    ctx.repo.insert('batch_operations', { id: ctx.newId(), createdAt: ctx.serverNow, userId: ctx.userId, kind: 'task.applyOrder', summaryJson: JSON.stringify({ reviewId: c.reviewId, optionIndex: c.optionIndex, projectId: c.projectId, parentTaskId: c.parentTaskId, before, after: c.orderedIds }) });
    ctx.repo.insert('activity', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, projectId: c.projectId, taskId: null, kind: 'task.applyOrder', body: `Applied a reviewed task order (${c.orderedIds.length} tasks).` });
    return { changed: true, result: { kind: 'tasks', id: c.orderedIds[0] } };
  },
} satisfies Pick<HandlerMap, 'task.bulkCopy' | 'task.applyOrder'>;
