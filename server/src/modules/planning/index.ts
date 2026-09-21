import type { HandlerMap } from '../../core/context.js';
import { dateSchema } from '@pirata/contracts/index';
import { conflict, invalid } from '../../core/errors.js';
import { assertReference, setTaskBlock } from '../../core/shared.js';

export const capability: 'blocked' | 'ready' = 'ready';
export const handlers = {
  'dailyGoal.replace': (ctx, c) => {
    if (!dateSchema.safeParse(c.date).success) invalid('Choose a valid calendar date.');
    if (!ctx.repo.team().some(member => member.id === c.userId && member.disabledAt === null)) invalid('Choose an active team member.');
    if (new Set(c.taskIds).size !== c.taskIds.length) invalid('Select each goal only once.');
    for (const id of c.taskIds) {
      const task = ctx.repo.require('tasks', id);
      if (task.parentTaskId || task.archivedAt) invalid('Daily goals must be active top-level tasks.');
      if (task.assigneeId && task.assigneeId !== c.userId) invalid('Choose a task assigned to this person or an unassigned task.');
    }
    const previous = ctx.repo.list('daily_goals').filter(goal => goal.date === c.date && goal.userId === c.userId).sort((a,b) => a.position-b.position);
    const changed = previous.length !== c.taskIds.length || previous.some((goal,index) => goal.taskId !== c.taskIds[index]);
    if (changed) {
      for (const goal of previous) ctx.repo.remove('daily_goals', goal.id);
      c.taskIds.forEach((taskId,position) => { const existing = previous.find(goal => goal.taskId === taskId); ctx.repo.insert('daily_goals', { id: existing?.id ?? ctx.newId(), createdAt: existing?.createdAt ?? ctx.serverNow, updatedAt: ctx.serverNow, date: c.date, userId: c.userId, taskId, position }); });
    }
    return { changed, result: { kind: 'dailyGoals' } };
  },
  'schedule.setTaskBlock': (ctx, c) => {
    const { id, changed } = setTaskBlock(ctx, c.taskId, c.block);
    return { changed, result: { kind: 'schedule', id } };
  },
  'schedule.removeTaskBlock': (ctx, c) => {
    ctx.repo.require('tasks', c.taskId);
    const block = ctx.repo.list('schedule_blocks').find(b => b.taskId === c.taskId);
    if (block) ctx.repo.remove('schedule_blocks', block.id);
    return { changed: Boolean(block), result: { kind: 'schedule', id: block?.id } };
  },
  'objectives.replaceForDate': (ctx, c) => {
    const previous = ctx.repo.list('objectives').filter(o => o.date === c.date);
    const records = c.objectives.map(o => {
      assertReference(ctx, 'tasks', o.taskId);
      const existing = ctx.repo.get('objectives', o.id);
      if (existing && existing.date !== c.date) conflict('An objective ID belongs to another date. Keep that record on its original date.', 'OBJECTIVE_DATE_CONFLICT');
      const same = existing && existing.title === o.title && existing.taskId === o.taskId && existing.status === o.status && existing.note === o.note && existing.rank === o.rank;
      return { ...o, date: c.date, createdAt: existing?.createdAt ?? ctx.serverNow, updatedAt: same ? existing.updatedAt : ctx.serverNow };
    });
    const changed = previous.length !== records.length || records.some(o => {
      const old = previous.find(p => p.id === o.id);
      return !old || old.title !== o.title || old.taskId !== o.taskId || old.status !== o.status || old.note !== o.note || old.rank !== o.rank;
    });
    // Removing this date's rows before reinsert permits rank swaps under immediate
    // UNIQUE constraints. The dispatcher rolls back the entire replacement on failure.
    if (changed) {
      for (const old of previous) ctx.repo.remove('objectives', old.id);
      for (const record of records) ctx.repo.insert('objectives', record);
    }
    return { changed, result: { kind: 'objectives' } };
  },
} satisfies Pick<HandlerMap, 'dailyGoal.replace' | 'schedule.setTaskBlock' | 'schedule.removeTaskBlock' | 'objectives.replaceForDate'>;
