import { describe, expect, it } from 'vitest';
import type { DayAssignment, Task } from '@pirata/contracts/index';
import { affectedSession, canEditDone, groupByProject, parseScope, scopeKey, treeCompletion } from '../../src/features/work/dayList';
const task = (id: string, parentTaskId: string | null, extra: Partial<Task> = {}): Task => ({ id, createdAt: 1, updatedAt: 1, projectId: 'p', title: id, estimatedMinutes: 0, status: 'open', note: '', parentTaskId, assigneeId: null, assignmentExplicit: 0, archivedAt: null, position: 0, ...extra });
const tasks = [task('a', null), task('a1', 'a', { status: 'done' }), task('a2', 'a'), task('a2x', 'a2', { status: 'done' }), task('a2y', 'a2'), task('b', null, { status: 'done', completedBy: 'jose', completedAt: 1_000 })];
describe('day list helpers', () => {
  it('counts leaves across three levels', () => { expect(treeCompletion(tasks, 'a')).toEqual({ done: 2, total: 3, fraction: 2 / 3 }); expect(treeCompletion(tasks, 'b')).toEqual({ done: 1, total: 1, fraction: 1 }); });
  it('lets the completer undo for ten minutes and owners always', () => {
    const b = tasks[5];
    expect(canEditDone(b, 'jose', 'worker', 1_000 + 5 * 60_000)).toBe(true);
    expect(canEditDone(b, 'jose', 'worker', 1_000 + 11 * 60_000)).toBe(false);
    expect(canEditDone(b, 'ana', 'manager', 1_000)).toBe(false);
    expect(canEditDone(b, 'ana', 'owner', 1_000 + 60 * 60_000)).toBe(true);
    expect(canEditDone(tasks[0], 'ana', 'worker', 1)).toBe(true);
  });
  it('groups rows by project in plan order', () => {
    const rows: DayAssignment[] = [{ id: 'r1', createdAt: 1, updatedAt: 1, date: 'd', projectId: 'q', taskId: 'x', userId: 'u', position: 0, createdBy: 'm' }, { id: 'r2', createdAt: 1, updatedAt: 1, date: 'd', projectId: 'p', taskId: 'a', userId: 'u', position: 1, createdBy: 'm' }, { id: 'r3', createdAt: 1, updatedAt: 1, date: 'd', projectId: 'q', taskId: 'y', userId: 'u', position: 2, createdBy: 'm' }];
    const groups = groupByProject({ projects: [{ id: 'p', name: 'Smith' } as never, { id: 'q', name: 'Jones' } as never] }, rows);
    expect(groups.map(g => [g.name, g.rows.length])).toEqual([['Jones', 2], ['Smith', 1]]);
  });
  it('finds my timer inside a subtree and round-trips scope keys', () => {
    expect(affectedSession({ runningTimer: { sessionId: 's', taskId: 'a2x', startedAt: 1 }, tasks }, 'a')).toBe('s');
    expect(affectedSession({ runningTimer: { sessionId: 's', taskId: 'b', startedAt: 1 }, tasks }, 'a')).toBeNull();
    expect(parseScope(scopeKey({ kind: 'project', projectId: 'p' }))).toEqual({ kind: 'project', projectId: 'p' });
    expect(parseScope('nonsense')).toBeNull();
  });
});
