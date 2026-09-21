import type { Task } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { conflict, invalid } from '../../core/errors.js';
import { assertReference, closeTimer, createTaskWithSchedule, expectTimer, setTaskStatus, setTaskBlock, reconcileParent } from '../../core/shared.js';

export const capability: 'blocked' | 'ready' = 'ready';
const result = (kind: string, id: string, changed = true) => ({ changed, result: { kind, id } });
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
function taskRelationships(ctx: TransactionContext, fields: { parentTaskId?: string | null; projectId: string | null; assigneeId?: string | null }, current?: Task) {
  const parentId = fields.parentTaskId === undefined ? current?.parentTaskId ?? null : fields.parentTaskId;
  const parent = parentId ? ctx.repo.require('tasks', parentId) : null;
  if (parent && (parent.parentTaskId || parent.archivedAt || parent.id === current?.id)) invalid('Choose an active top-level task. Subtasks have one checklist level.');
  if (parent && current && ctx.repo.list('tasks').some(task => task.parentTaskId === current.id)) invalid('A task with subtasks cannot become a subtask.');
  const explicit = fields.assigneeId === undefined ? current?.assignmentExplicit ?? 0 : fields.assigneeId !== null ? 1 : 0;
  const assigneeId = explicit ? fields.assigneeId === undefined ? current?.assigneeId ?? null : fields.assigneeId : parent ? parent.assigneeId ?? null : fields.assigneeId === undefined ? current?.assigneeId ?? null : fields.assigneeId;
  if(assigneeId!==current?.assigneeId)assigned(ctx, assigneeId);
  return { parentTaskId: parentId, projectId: parent ? parent.projectId : fields.projectId, assigneeId, assignmentExplicit: explicit };
}
function create(ctx: TransactionContext, title: string, fields: { projectId: string | null; parentTaskId?: string | null; assigneeId?: string | null }, estimate = 0, note = '') {
  const id = ctx.newId(), relationships = taskRelationships(ctx, fields);
  createTaskWithSchedule(ctx, { ...relationships, id, title, estimatedMinutes: estimate, note, status: 'open', archivedAt: null, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
  if (relationships.parentTaskId) {
    const parent = ctx.repo.require('tasks', relationships.parentTaskId);
    if (parent.status === 'done') ctx.repo.update('tasks', parent.id, { status: 'open', updatedAt: ctx.serverNow });
  }
  return id;
}
export const handlers = {
  'task.create': (ctx, command) => {
    const { type: _, schedule, ...fields } = command; void _;
    if (schedule && schedule.endMinute - schedule.startMinute !== fields.estimatedMinutes)
      invalid('The initial planned block must match the task estimate.', { 'schedule.endMinute': 'Initial block length must equal the estimate.' });
    const id = create(ctx, fields.title, fields, fields.estimatedMinutes, fields.note);
    if (schedule) setTaskBlock(ctx, id, schedule);
    return result('task', id);
  },
  'task.update': (ctx, command) => {
    const task = ctx.repo.require('tasks', command.id);
    assertReference(ctx, 'projects', command.projectId);
    const { type: _, id, ...input } = command; void _;
    const fields = { ...input, ...taskRelationships(ctx, input, task) };
    const changed = Object.entries(fields).some(([key,value]) => task[key as keyof Task] !== value);
    if (changed) {
      ctx.repo.update('tasks', id, { ...fields, updatedAt: ctx.serverNow });
      for (const child of ctx.repo.list('tasks').filter(child => child.parentTaskId === id)) {
        const patch = { projectId: fields.projectId, ...(!child.assignmentExplicit ? { assigneeId: fields.assigneeId } : {}) };
        if (Object.entries(patch).some(([key,value]) => child[key as keyof Task] !== value)) ctx.repo.update('tasks', child.id, { ...patch, updatedAt: ctx.serverNow });
      }
      if (task.parentTaskId !== fields.parentTaskId) { reconcileParent(ctx, task.parentTaskId); reconcileParent(ctx, fields.parentTaskId); }
    }
    return result('task', id, changed);
  },
  'task.batchCreate': (ctx, c) => {
    let first = '';
    for (const title of c.titles) { const id = create(ctx, title, c); first ||= id; }
    return result('tasks', first);
  },
  'task.archive': (ctx, c) => {
    const task = ctx.repo.require('tasks', c.id), affected = [task, ...ctx.repo.list('tasks').filter(child => child.parentTaskId === task.id)];
    if (c.archived && ctx.repo.listTimers().some(timer => affected.some(record => record.id === timer.taskId))) conflict('Pause running timers before removing this task.', 'TEAM_TIMER_ACTIVE');
    if (c.archived && ctx.repo.list('daily_goals').some(goal => affected.some(record => record.id === goal.taskId))) conflict('This task is a selected daily goal. Change that daily plan before removing it.', 'DAILY_GOAL_ACTIVE');
    if (!c.archived && task.parentTaskId && ctx.repo.require('tasks', task.parentTaskId).archivedAt) invalid('Restore the parent task first.');
    const changed = affected.some(record => Boolean(record.archivedAt) !== c.archived);
    for (const record of affected) if (Boolean(record.archivedAt) !== c.archived) ctx.repo.update('tasks', record.id, { archivedAt: c.archived ? ctx.serverNow : null, updatedAt: ctx.serverNow });
    if(changed)reconcileParent(ctx,task.parentTaskId);
    return result('task', c.id, changed);
  },
  'taskTemplate.save': (ctx, c) => {
    const id = ctx.newId(); ctx.repo.insert('task_templates', { id, name: c.name, titles: JSON.stringify(c.titles), createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('taskTemplate', id);
  },
  'taskTemplate.apply': (ctx, c) => {
    const template = ctx.repo.require('task_templates', c.templateId); let first = '';
    for (const title of JSON.parse(template.titles) as string[]) { const id = create(ctx, title, { projectId: c.projectId, parentTaskId: c.parentTaskId }); first ||= id; }
    return result('tasks', first);
  },
  'task.setStatus': (ctx, c) => result('task', c.id, setTaskStatus(ctx, c.id, c.status, c.expectedSessionId)),
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
} satisfies Pick<HandlerMap, 'task.create' | 'task.update' | 'task.batchCreate' | 'task.archive' | 'taskTemplate.save' | 'taskTemplate.apply' | 'task.setStatus' | 'timer.start' | 'timer.pause' | 'timer.switch' | 'timer.correctStart' | 'timer.discard' | 'timeEntry.createManual' | 'timeEntry.correct'>;
