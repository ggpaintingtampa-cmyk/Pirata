import type { Task } from '@pirata/contracts/index';
import { can, subtree, taskDepth, type TaskRequirement, type TemplateRequirement } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, conflict, invalid } from '../../core/errors.js';
import { assertReference, closeTimer, createTaskWithSchedule, expectTimer, setTaskStatus, setTaskBlock, reconcileParent } from '../../core/shared.js';

export const capability: 'blocked' | 'ready' = 'ready';
/** R-ROLE-4: the person who completed a task may undo it for ten minutes; afterwards only an owner may change it. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;
/** P02: a task's requirement rows in order (materials, tools, preparation notes). */
export function requirementsOf(ctx: Pick<TransactionContext, 'repo'>, taskId: string): TaskRequirement[] {
  return ctx.repo.list('task_requirements').filter(row => row.taskId === taskId).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
const sameRequirement = (row: TaskRequirement, next: TemplateRequirement) => row.kind === next.kind && row.name === next.name && row.materialId === next.materialId && row.equipmentId === next.equipmentId && row.quantity === next.quantity && row.unit === next.unit && row.note === next.note;
/** P02: replace a task's requirement set as a snapshot. Catalog references must exist; free text needs none. Returns false when identical. */
export function setRequirements(ctx: TransactionContext, taskId: string, requirements: readonly TemplateRequirement[], source: { templateId: string | null; version: number | null }): boolean {
  const existing = requirementsOf(ctx, taskId);
  if (existing.length === requirements.length && existing.every((row, index) => sameRequirement(row, requirements[index]) && row.sourceTemplateId === source.templateId && row.sourceTemplateVersion === source.version)) return false;
  for (const item of requirements) {
    if (item.materialId && !ctx.repo.get('materials', item.materialId)) invalid('Choose a material from inventory or leave the reference empty.');
    if (item.equipmentId && !ctx.repo.get('equipment', item.equipmentId)) invalid('Choose a tool from the equipment list or leave the reference empty.');
  }
  for (const row of existing) ctx.repo.remove('task_requirements', row.id);
  requirements.forEach((item, position) => ctx.repo.insert('task_requirements', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, taskId, kind: item.kind, name: item.name, materialId: item.materialId, equipmentId: item.equipmentId, quantity: item.quantity, unit: item.unit, note: item.note, position, sourceTemplateId: source.templateId, sourceTemplateVersion: source.version }));
  return true;
}
/** P03: copy requirement rows onto a new task, keeping their template provenance. */
export function copyRequirements(ctx: TransactionContext, fromTaskId: string, toTaskId: string): number {
  const rows = requirementsOf(ctx, fromTaskId);
  for (const row of rows) ctx.repo.insert('task_requirements', { ...row, id: ctx.newId(), taskId: toTaskId, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
  return rows.length;
}
const result = (kind: string, id: string, changed = true) => ({ changed, result: { kind, id } });
const byPosition = (a: Task, b: Task) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
export function canEditDone(ctx: TransactionContext, task: Task): boolean {
  if (task.status !== 'done' || can(ctx.role, 'task.editDone')) return true;
  return task.completedBy === ctx.userId && typeof task.completedAt === 'number' && ctx.serverNow - task.completedAt <= UNDO_WINDOW_MS;
}
export function assertEditable(ctx: TransactionContext, task: Task): void {
  if (!canEditDone(ctx, task)) throw new ApiError(403, 'FORBIDDEN', 'Only an owner can change a completed task.');
}
/** All descendants, archived ones included, deepest last. */
function descendants(all: readonly Task[], id: string): Task[] {
  const out: Task[] = [];
  const walk = (parentId: string) => { for (const child of all.filter(t => t.parentTaskId === parentId)) { out.push(child); walk(child.id); } };
  walk(id); return out;
}
function subtreeDepth(all: readonly Task[], id: string): number {
  const children = all.filter(t => t.parentTaskId === id && !t.archivedAt);
  return children.length ? 1 + Math.max(...children.map(child => subtreeDepth(all, child.id))) : 0;
}
function openTask(ctx: TransactionContext, id: string) {
  const task = ctx.repo.require('tasks', id);
  if (task.archivedAt) invalid('Restore this task before starting its timer.');
  if (task.status !== 'open') conflict('Reopen this task before starting its timer.', 'TASK_NOT_OPEN');
  return task;
}
function start(ctx: TransactionContext, taskId: string) {
  const sessionId = ctx.newId();
  ctx.repo.insertTimer({ sessionId, taskId, startedAt: ctx.serverNow });
  return result('timer', sessionId);
}
function assigned(ctx: TransactionContext, assigneeId: string | null) {
  if (assigneeId && !ctx.repo.team().some(member => member.id === assigneeId && member.disabledAt === null)) invalid('Choose an active team member.', { assigneeId: 'This person is unavailable.' });
}
/** Three levels: task (0) → subtask (1) → tiny task (2). Moving a node keeps its whole subtree within the limit. */
function taskRelationships(ctx: TransactionContext, fields: { parentTaskId?: string | null; projectId: string | null; assigneeId?: string | null }, current?: Task) {
  const parentId = fields.parentTaskId === undefined ? current?.parentTaskId ?? null : fields.parentTaskId;
  const parent = parentId ? ctx.repo.require('tasks', parentId) : null;
  if (parent) {
    const all = ctx.repo.list('tasks');
    if (parent.archivedAt || parent.id === current?.id) invalid('Choose an active parent task.');
    if (current && subtree(all, current.id).some(node => node.id === parent.id)) invalid('A task cannot move under its own subtask.');
    if (taskDepth(all, parent.id) + 1 + (current ? subtreeDepth(all, current.id) : 0) > 2) invalid('Tasks can only nest three levels deep: task, subtask, tiny task.');
  }
  const explicit = fields.assigneeId === undefined ? current?.assignmentExplicit ?? 0 : fields.assigneeId !== null ? 1 : 0;
  const assigneeId = explicit ? fields.assigneeId === undefined ? current?.assigneeId ?? null : fields.assigneeId : parent ? parent.assigneeId ?? null : fields.assigneeId === undefined ? current?.assigneeId ?? null : fields.assigneeId;
  if(assigneeId!==current?.assigneeId)assigned(ctx, assigneeId);
  return { parentTaskId: parentId, projectId: parent ? parent.projectId : fields.projectId, assigneeId, assignmentExplicit: explicit };
}
/** Create one node at the end of its sibling list. Exported for the daily module (templates). */
export function createTask(ctx: TransactionContext, title: string, fields: { projectId: string | null; parentTaskId?: string | null; assigneeId?: string | null }, estimate = 0, note = '', description = '') {
  const id = ctx.newId(), relationships = taskRelationships(ctx, fields);
  const siblings = ctx.repo.list('tasks').filter(t => (t.parentTaskId ?? null) === relationships.parentTaskId && (relationships.parentTaskId !== null || (t.projectId ?? null) === (relationships.projectId ?? null)));
  const position = siblings.length ? Math.max(...siblings.map(t => t.position ?? 0)) + 1 : 0;
  createTaskWithSchedule(ctx, { ...relationships, id, title, estimatedMinutes: estimate, note, description, position, status: 'open', archivedAt: null, completedAt: null, completedBy: null, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
  if (relationships.parentTaskId) {
    const parent = ctx.repo.require('tasks', relationships.parentTaskId);
    if (parent.status === 'done') { ctx.repo.update('tasks', parent.id, { status: 'open', completedAt: null, completedBy: null, updatedAt: ctx.serverNow }); reconcileAncestors(ctx, parent.parentTaskId); }
  }
  return id;
}
/** Re-check every ancestor (parent, then grandparent) so three-level completion and reopening stay truthful. */
function reconcileAncestors(ctx: TransactionContext, parentId: string | null | undefined): boolean {
  let changed = false;
  for (let id = parentId ?? null; id; ) {
    const node = ctx.repo.get('tasks', id); if (!node) break;
    if (reconcileParent(ctx, id)) { changed = true; const after = ctx.repo.require('tasks', id); ctx.repo.update('tasks', id, after.status === 'done' ? { completedAt: ctx.serverNow, completedBy: ctx.userId } : { completedAt: null, completedBy: null }); }
    id = node.parentTaskId ?? null;
  }
  return changed;
}
/** Push project and inherited assignment down the tree (explicit assignments on descendants are kept). */
function propagate(ctx: TransactionContext, parentId: string, projectId: string | null, assigneeId: string | null) {
  for (const child of ctx.repo.list('tasks').filter(child => child.parentTaskId === parentId)) {
    const patch = { projectId, ...(!child.assignmentExplicit ? { assigneeId } : {}) };
    if (Object.entries(patch).some(([key, value]) => child[key as keyof Task] !== value)) ctx.repo.update('tasks', child.id, { ...patch, updatedAt: ctx.serverNow });
    propagate(ctx, child.id, projectId, child.assignmentExplicit ? child.assigneeId ?? null : assigneeId);
  }
}
/** Explicitly assign a node and let its subtree inherit. Exported for day lists. Returns whether anything changed. */
export function assignTask(ctx: TransactionContext, taskId: string, userId: string): boolean {
  const task = ctx.repo.require('tasks', taskId);
  if (task.assigneeId === userId && task.assignmentExplicit) return false;
  assigned(ctx, userId);
  ctx.repo.update('tasks', taskId, { assigneeId: userId, assignmentExplicit: 1, updatedAt: ctx.serverNow });
  propagate(ctx, taskId, task.projectId ?? null, userId);
  return true;
}
export const handlers = {
  'task.create': (ctx, command) => {
    const { type: _, schedule, ...fields } = command; void _;
    if (schedule && schedule.endMinute - schedule.startMinute !== fields.estimatedMinutes)
      invalid('The initial planned block must match the task estimate.', { 'schedule.endMinute': 'Initial block length must equal the estimate.' });
    const id = createTask(ctx, fields.title, fields, fields.estimatedMinutes, fields.note, fields.description ?? '');
    if (schedule) setTaskBlock(ctx, id, schedule);
    return result('task', id);
  },
  'task.update': (ctx, command) => {
    const task = ctx.repo.require('tasks', command.id);
    assertEditable(ctx, task);
    assertReference(ctx, 'projects', command.projectId);
    const { type: _, id, description, ...input } = command; void _;
    const fields = { ...input, description: description ?? task.description ?? '', ...taskRelationships(ctx, input, task) };
    const changed = Object.entries(fields).some(([key,value]) => task[key as keyof Task] !== value);
    if (changed) {
      ctx.repo.update('tasks', id, { ...fields, updatedAt: ctx.serverNow });
      propagate(ctx, id, fields.projectId, fields.assigneeId);
      if (task.parentTaskId !== fields.parentTaskId) { reconcileAncestors(ctx, task.parentTaskId); reconcileAncestors(ctx, fields.parentTaskId); }
    }
    return result('task', id, changed);
  },
  'task.batchCreate': (ctx, c) => {
    let first = '';
    for (const title of c.titles) { const id = createTask(ctx, title, c); first ||= id; }
    return result('tasks', first);
  },
  'task.archive': (ctx, c) => {
    const all = ctx.repo.list('tasks'), task = ctx.repo.require('tasks', c.id), affected = [task, ...descendants(all, task.id)], ids = new Set(affected.map(record => record.id));
    if (c.archived) assertEditable(ctx, task);
    if (c.archived && ctx.repo.listTimers().some(timer => ids.has(timer.taskId))) conflict('Pause running timers before removing this task.', 'TEAM_TIMER_ACTIVE');
    if (c.archived && ctx.repo.list('daily_goals').some(goal => ids.has(goal.taskId))) conflict('This task is a selected daily goal. Change that daily plan before removing it.', 'DAILY_GOAL_ACTIVE');
    if (!c.archived && task.parentTaskId && ctx.repo.require('tasks', task.parentTaskId).archivedAt) invalid('Restore the parent task first.');
    const changed = affected.some(record => Boolean(record.archivedAt) !== c.archived);
    for (const record of affected) if (Boolean(record.archivedAt) !== c.archived) ctx.repo.update('tasks', record.id, { archivedAt: c.archived ? ctx.serverNow : null, updatedAt: ctx.serverNow });
    // An archived task leaves every day list; nobody plans work that no longer exists.
    if (c.archived) for (const row of ctx.repo.list('day_assignments').filter(row => row.taskId !== null && ids.has(row.taskId))) ctx.repo.remove('day_assignments', row.id);
    if(changed)reconcileAncestors(ctx,task.parentTaskId);
    return result('task', c.id, changed);
  },
  'taskTemplate.save': (ctx, c) => {
    const id = ctx.newId(); ctx.repo.insert('task_templates', { id, name: c.name, titles: JSON.stringify(c.titles), tree: null, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('taskTemplate', id);
  },
  'taskTemplate.apply': (ctx, c) => {
    const template = ctx.repo.require('task_templates', c.templateId); let first = '';
    for (const title of JSON.parse(template.titles) as string[]) { const id = createTask(ctx, title, { projectId: c.projectId, parentTaskId: c.parentTaskId }); first ||= id; }
    return result('tasks', first);
  },
  'task.setRequirements': (ctx, c) => {
    const task = ctx.repo.require('tasks', c.taskId);
    if (task.archivedAt) invalid('Restore this task before editing what it needs.');
    assertEditable(ctx, task);
    const changed = setRequirements(ctx, c.taskId, c.requirements, { templateId: null, version: null });
    if (changed) ctx.repo.update('tasks', c.taskId, { updatedAt: ctx.serverNow });
    return result('task', c.taskId, changed);
  },
  'task.setStatus': (ctx, c) => {
    const all = ctx.repo.list('tasks'), task = ctx.repo.require('tasks', c.id);
    if (c.status !== 'done' && task.status === 'done') assertEditable(ctx, task);
    const before = new Map(all.map(t => [t.id, t.status]));
    let expected = c.expectedSessionId, changed = false;
    if (c.status === 'done') {
      // setTaskStatus completes direct children; deeper nodes (tiny tasks under subtasks) are completed here first.
      const deeper = subtree(all, c.id).slice(1).filter(node => node.parentTaskId !== c.id && node.status !== 'done');
      const mine = ctx.repo.getTimer();
      if (ctx.repo.listTimers().some(active => deeper.some(node => node.id === active.taskId) && active.sessionId !== mine?.sessionId)) conflict('A teammate is timing this work. Ask them to pause their timer before completing it.', 'TEAM_TIMER_ACTIVE');
      for (const node of [...deeper].reverse()) {
        if (mine && mine.taskId === node.id) { if (!expected) conflict('Confirm the active timer before changing status.', 'TIMER_CONFLICT'); closeTimer(ctx, expected); expected = null; }
        ctx.repo.update('tasks', node.id, { status: 'done', updatedAt: ctx.serverNow }); changed = true;
      }
    }
    if (setTaskStatus(ctx, c.id, c.status, expected)) changed = true;
    if (reconcileAncestors(ctx, ctx.repo.get('tasks', c.id)?.parentTaskId)) changed = true;
    if (changed) for (const after of ctx.repo.list('tasks')) {
      const previous = before.get(after.id);
      if (previous === after.status) continue;
      if (after.status === 'done') ctx.repo.update('tasks', after.id, { completedAt: ctx.serverNow, completedBy: ctx.userId });
      else if (previous === 'done') ctx.repo.update('tasks', after.id, { completedAt: null, completedBy: null });
    }
    return result('task', c.id, changed);
  },
  'timer.start': (ctx, c) => {
    openTask(ctx, c.taskId);
    const timer = ctx.repo.getTimer();
    if (timer?.taskId === c.taskId) return result('timer', timer.sessionId, false);
    if (timer) conflict('Another task is running. Confirm switching from the observed session.', 'TIMER_CONFLICT');
    return start(ctx, c.taskId);
  },
  'timer.pause': (ctx, c) => result('timer', c.expectedSessionId, closeTimer(ctx, c.expectedSessionId)),
  'timer.switch': (ctx, c) => {
    const timer = expectTimer(ctx, c.expectedSessionId);
    openTask(ctx, c.taskId);
    if (timer.taskId === c.taskId) return result('timer', timer.sessionId, false);
    closeTimer(ctx, c.expectedSessionId);
    return start(ctx, c.taskId);
  },
  'timer.correctStart': (ctx, c) => {
    const timer = expectTimer(ctx, c.expectedSessionId);
    if (c.startedAt > ctx.serverNow) invalid('Start must not be later than server time.', { startedAt: 'Choose a start at or before server time.' });
    if (timer.startedAt === c.startedAt) return result('timer', timer.sessionId, false);
    ctx.repo.correctTimerStart(c.startedAt);
    return result('timer', timer.sessionId);
  },
  'timer.discard': (ctx, c) => {
    expectTimer(ctx, c.expectedSessionId); ctx.repo.removeTimer();
    return result('timer', c.expectedSessionId);
  },
  'timeEntry.createManual': (ctx, c) => {
    ctx.repo.require('tasks', c.taskId);
    const id = ctx.newId();
    ctx.repo.insert('time_entries', { id, taskId: c.taskId, source: 'manual', date: c.date, durationSeconds: c.minutes * 60, note: c.note, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('timeEntry', id);
  },
  'timeEntry.correct': (ctx, c) => {
    const entry = ctx.repo.require('time_entries', c.id), correction = c.correction;
    if (entry.source !== correction.source) invalid('A correction must preserve the original time source.');
    const patch = correction.source === 'manual'
      ? { date: correction.date, durationSeconds: correction.minutes * 60, note: correction.note }
      : { startedAt: correction.startedAt, endedAt: correction.endedAt, note: correction.note };
    const changed = Object.entries(patch).some(([key, value]) => entry[key as keyof typeof entry] !== value);
    if (changed) ctx.repo.update('time_entries', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('timeEntry', c.id, changed);
  },
} satisfies Pick<HandlerMap, 'task.create' | 'task.update' | 'task.batchCreate' | 'task.archive' | 'taskTemplate.save' | 'taskTemplate.apply' | 'task.setRequirements' | 'task.setStatus' | 'timer.start' | 'timer.pause' | 'timer.switch' | 'timer.correctStart' | 'timer.discard' | 'timeEntry.createManual' | 'timeEntry.correct'>;
export { byPosition };
