// Chunk A: task ordering, day lists (person or project pool), presence, questions, nested templates.
import type { DayAssignment, TemplateNode } from '@pirata/contracts/index';
import { can, isOfficeRole, orderedChildren, taskDepth, templateDepth } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, invalid } from '../../core/errors.js';
import { assignTask, byPosition, createTask } from '../tasks-time/index.js';
const result = (kind: string, id?: string, changed = true) => ({ changed, result: { kind, ...(id ? { id } : {}) } });
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
function plannableTask(ctx: TransactionContext, id: string) {
  const task = ctx.repo.require('tasks', id);
  if (task.archivedAt) invalid('Restore this task before planning it.');
  if (!task.projectId) invalid('Choose a task that belongs to a project.');
  return task as typeof task & { projectId: string };
}
const personRows = (ctx: TransactionContext, date: string, userId: string) => ctx.repo.list('day_assignments').filter(r => r.date === date && r.taskId !== null && r.userId === userId);
const poolRows = (ctx: TransactionContext, date: string, projectId: string) => ctx.repo.list('day_assignments').filter(r => r.date === date && r.taskId !== null && r.userId === null && r.projectId === projectId);
const nextPosition = (rows: readonly DayAssignment[]) => rows.length ? Math.max(...rows.map(r => r.position)) + 1 : 0;
function applyTree(ctx: TransactionContext, nodes: readonly TemplateNode[], projectId: string, parentTaskId: string | null): string {
  let first = '';
  for (const node of nodes) { const id = createTask(ctx, node.title, { projectId, parentTaskId }, 0, '', node.description ?? ''); first ||= id; applyTree(ctx, node.children ?? [], projectId, id); }
  return first;
}
export const handlers = {
  'task.reorder': (ctx, c) => {
    const siblings = ctx.repo.list('tasks').filter(t => !t.archivedAt && (t.parentTaskId ?? null) === c.parentTaskId && (c.parentTaskId !== null || (t.projectId ?? null) === c.projectId));
    const byId = new Map(siblings.map(t => [t.id, t]));
    for (const id of c.orderedIds) if (!byId.has(id)) invalid('Reorder only the tasks of one list.');
    let changed = false;
    const rest = siblings.filter(t => !c.orderedIds.includes(t.id)).sort(byPosition);
    [...c.orderedIds.map(id => byId.get(id)!), ...rest].forEach((task, position) => { if ((task.position ?? 0) !== position) { ctx.repo.update('tasks', task.id, { position, updatedAt: ctx.serverNow }); changed = true; } });
    return result('tasks', c.orderedIds[0], changed);
  },
  'dayList.replace': (ctx, c) => {
    const scope = c.scope;
    if (scope.kind === 'person') {
      if (scope.userId !== ctx.userId && !can(ctx.role, 'plan.others')) forbidden('You can plan only your own day.');
      if (!ctx.repo.team().some(m => m.id === scope.userId && !m.disabledAt)) invalid('Choose an active team member.');
    } else ctx.repo.require('projects', scope.projectId);
    const tasks = c.taskIds.map(id => plannableTask(ctx, id));
    if (scope.kind === 'project' && tasks.some(t => t.projectId !== scope.projectId)) invalid('Pool tasks must belong to this project.');
    const existing = scope.kind === 'person' ? personRows(ctx, c.date, scope.userId) : poolRows(ctx, c.date, scope.projectId);
    let changed = false;
    for (const row of existing) if (!c.taskIds.includes(row.taskId!)) { ctx.repo.remove('day_assignments', row.id); changed = true; }
    tasks.forEach((task, position) => {
      const row = existing.find(r => r.taskId === task.id);
      if (row) { if (row.position !== position) { ctx.repo.update('day_assignments', row.id, { position, updatedAt: ctx.serverNow }); changed = true; } }
      else { ctx.repo.insert('day_assignments', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, date: c.date, projectId: task.projectId, taskId: task.id, userId: scope.kind === 'person' ? scope.userId : null, position, createdBy: ctx.userId }); changed = true; }
      // A person's list assigns the work unless somebody else was assigned explicitly (two people may share a task).
      if (scope.kind === 'person' && (!task.assigneeId || !task.assignmentExplicit) && task.assigneeId !== scope.userId && assignTask(ctx, task.id, scope.userId)) changed = true;
    });
    return result('dayList', undefined, changed);
  },
  'dayList.take': (ctx, c) => {
    const row = ctx.repo.require('day_assignments', c.id);
    if (row.userId !== null || !row.taskId) invalid('This item is not in a project pool.');
    const task = plannableTask(ctx, row.taskId);
    ctx.repo.update('day_assignments', c.id, { userId: ctx.userId, position: nextPosition(personRows(ctx, row.date, ctx.userId)), updatedAt: ctx.serverNow });
    if (!task.assigneeId) assignTask(ctx, task.id, ctx.userId);
    return result('dayList', c.id);
  },
  'dayList.release': (ctx, c) => {
    const row = ctx.repo.require('day_assignments', c.id);
    if (row.userId === null || !row.taskId) invalid('This item is not on a person’s list.');
    if (row.userId !== ctx.userId && !can(ctx.role, 'plan.others')) forbidden('You can release only your own items.');
    ctx.repo.update('day_assignments', c.id, { userId: null, position: nextPosition(poolRows(ctx, row.date, row.projectId)), updatedAt: ctx.serverNow });
    return result('dayList', c.id);
  },
  'dayList.setPresence': (ctx, c) => {
    ctx.repo.require('projects', c.projectId);
    const team = ctx.repo.team();
    for (const id of c.userIds) if (!team.some(m => m.id === id && !m.disabledAt)) invalid('Choose active team members.');
    const existing = ctx.repo.list('day_assignments').filter(r => r.date === c.date && r.projectId === c.projectId && r.taskId === null);
    let changed = false;
    for (const row of existing) if (!c.userIds.includes(row.userId!)) { ctx.repo.remove('day_assignments', row.id); changed = true; }
    for (const userId of c.userIds) if (!existing.some(r => r.userId === userId)) { ctx.repo.insert('day_assignments', { id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow, date: c.date, projectId: c.projectId, taskId: null, userId, position: 0, createdBy: ctx.userId }); changed = true; }
    return result('presence', undefined, changed);
  },
  'question.ask': (ctx, c) => {
    const task = plannableTask(ctx, c.taskId), id = ctx.newId();
    ctx.repo.insert('task_questions', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, taskId: task.id, projectId: task.projectId, askedBy: ctx.userId, body: c.body, answeredAt: null, answeredBy: null, answer: '' });
    return result('question', id);
  },
  'question.answer': (ctx, c) => {
    if (!isOfficeRole(ctx.role)) forbidden('Only the office can answer questions.');
    const question = ctx.repo.require('task_questions', c.id);
    if (question.answer === c.answer) return result('question', c.id, false);
    ctx.repo.update('task_questions', c.id, { answer: c.answer, answeredAt: ctx.serverNow, answeredBy: ctx.userId, updatedAt: ctx.serverNow });
    return result('question', c.id);
  },
  'taskTemplate.saveTree': (ctx, c) => {
    const id = ctx.newId();
    ctx.repo.insert('task_templates', { id, name: c.name, titles: JSON.stringify(c.tree.map(node => node.title)), tree: JSON.stringify(c.tree), createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('taskTemplate', id);
  },
  'taskTemplate.applyTree': (ctx, c) => {
    const template = ctx.repo.require('task_templates', c.templateId);
    if (!template.tree) invalid('This template has no steps tree. Use it from the quick list instead.');
    ctx.repo.require('projects', c.projectId);
    const tree = JSON.parse(template.tree) as TemplateNode[], base = c.parentTaskId ? taskDepth(ctx.repo.list('tasks'), c.parentTaskId) + 1 : 0;
    if (base + templateDepth(tree) > 3) invalid('This template would nest deeper than three levels here.');
    return result('task', applyTree(ctx, tree, c.projectId, c.parentTaskId));
  },
  'projectTemplate.save': (ctx, c) => {
    const id = ctx.newId();
    ctx.repo.insert('project_templates', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, name: c.name, note: c.note, tree: JSON.stringify(c.tree), createdBy: ctx.userId });
    return result('projectTemplate', id);
  },
  'projectTemplate.apply': (ctx, c) => {
    const template = ctx.repo.require('project_templates', c.templateId);
    ctx.repo.require('projects', c.projectId);
    return result('task', applyTree(ctx, JSON.parse(template.tree) as TemplateNode[], c.projectId, null));
  },
  'projectTemplate.fromProject': (ctx, c) => {
    ctx.repo.require('projects', c.projectId);
    const all = ctx.repo.list('tasks');
    const build = (parentId: string | null, projectId: string): TemplateNode[] => orderedChildren(all, parentId, projectId).map(t => ({ title: t.title, description: t.description ?? '', children: build(t.id, projectId) }));
    const tree = build(null, c.projectId);
    if (!tree.length) invalid('This project has no tasks to save as a template.');
    const id = ctx.newId();
    ctx.repo.insert('project_templates', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, name: c.name, note: '', tree: JSON.stringify(tree), createdBy: ctx.userId });
    return result('projectTemplate', id);
  },
} satisfies Pick<HandlerMap,'task.reorder'|'dayList.replace'|'dayList.take'|'dayList.release'|'dayList.setPresence'|'question.ask'|'question.answer'|'taskTemplate.saveTree'|'taskTemplate.applyTree'|'projectTemplate.save'|'projectTemplate.apply'|'projectTemplate.fromProject'>;
