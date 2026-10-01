import { describe, expect, it } from 'vitest';
import type { DayAssignment, Task } from '@pirata/contracts/index';
import { affectedSession, canEditDone, flattenGroups, groupByProject, groupByTimeThenProject, parseScope, scopeKey, treeCompletion, whoWorked } from '../../src/features/work/dayList';
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
  // P01 / P06
  it('groups rows by scheduled start time then project, unscheduled last, keeping plan order inside a group', () => {
    const row = (id: string, taskId: string, projectId: string, position: number): DayAssignment => ({ id, date: '2026-09-25', projectId, taskId, userId: 'ana', position, createdBy: 'm', createdAt: 1, updatedAt: 1 });
    const rows = [row('r1', 'a', 'p', 0), row('r2', 'b', 'q', 1), row('r3', 'c', 'p', 2), row('r4', 'd', 'q', 3), row('r5', 'e', 'p', 4)];
    const snapshot = {
      projects: [{ id: 'p', name: 'Smith' }, { id: 'q', name: 'Jones' }],
      tasks: [task('a', null), task('b', null), task('c', null), task('d', null), task('e', 'd')],
      schedule: [
        { id: 's1', date: '2026-09-25', startMinute: 540, endMinute: 600, kind: 'task', title: 'a', taskId: 'a' },
        { id: 's2', date: '2026-09-25', startMinute: 480, endMinute: 540, kind: 'task', title: 'b', taskId: 'b' },
        { id: 's3', date: '2026-09-25', startMinute: 480, endMinute: 540, kind: 'task', title: 'c', taskId: 'c' },
        { id: 's4', date: '2026-09-25', startMinute: 600, endMinute: 660, kind: 'task', title: 'd', taskId: 'd' },
        { id: 's5', date: '2026-09-26', startMinute: 420, endMinute: 480, kind: 'task', title: 'a', taskId: 'a' },
      ],
    } as unknown as Parameters<typeof groupByTimeThenProject>[0];
    const groups = groupByTimeThenProject(snapshot, rows, '2026-09-25');
    expect(groups.map(g => g.startMinute)).toEqual([480, 540, 600]);
    expect(groups[0].projects.map(p => [p.projectId, p.rows.map(r => r.id)])).toEqual([['q', ['r2']], ['p', ['r3']]]);
    expect(groups[2].projects[0].rows.map(r => r.id)).toEqual(['r4', 'r5']);
    expect(flattenGroups(groups).map(r => r.id)).toEqual(['r2', 'r3', 'r1', 'r4', 'r5']);
    const unscheduled = groupByTimeThenProject({ ...snapshot, schedule: [] }, rows, '2026-09-25');
    expect(unscheduled).toHaveLength(1); expect(unscheduled[0].startMinute).toBeNull();
    expect(flattenGroups(groupByProject(snapshot, rows)).map(r => r.id)).toEqual(['r1', 'r3', 'r5', 'r2', 'r4']);
  });
  // P08
  it('aggregates each person once over non-rejected hours on the day and keeps day entries visible as days', () => {
    const snapshot = {
      team: [{ id: 'jose', name: 'José' }, { id: 'ana', name: 'Ana' }],
      workShifts: [
        { id: 's1', userId: 'jose', projectId: 'p', date: '2026-09-25', kind: 'hours', daysMinor: null, minutes: 240, status: 'approved' },
        { id: 's2', userId: 'jose', projectId: 'q', date: '2026-09-25', kind: 'hours', daysMinor: null, minutes: 180, status: 'submitted' },
        { id: 's3', userId: 'jose', projectId: 'q', date: '2026-09-25', kind: 'hours', daysMinor: null, minutes: 600, status: 'rejected' },
        { id: 's4', userId: 'ana', projectId: 'p', date: '2026-09-25', kind: 'day', daysMinor: 100, minutes: 480, status: 'approved' },
        { id: 's5', userId: 'ana', projectId: 'p', date: '2026-09-24', kind: 'hours', daysMinor: null, minutes: 60, status: 'approved' },
      ],
    } as never;
    expect(whoWorked(snapshot, '2026-09-25')).toEqual([
      { userId: 'ana', name: 'Ana', minutes: 480, daysMinor: 100, entries: 1, approved: 1, submitted: 0 },
      { userId: 'jose', name: 'José', minutes: 420, daysMinor: 0, entries: 2, approved: 1, submitted: 1 },
    ]);
    expect(whoWorked(snapshot, '2026-09-23')).toEqual([]);
  });
});
