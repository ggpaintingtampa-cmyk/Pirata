// P03/P09: the client-side mirror of the server's selection rules, so the preview count sent with the command is right.
import { describe, expect, it } from 'vitest';
import type { Task } from '@pirata/contracts/index';
import { liveDescendants, normalizeTaskRoots, subtreeDepth } from '../../src/features/bulk/selection';
const task = (id: string, parentTaskId: string | null, archivedAt: number | null = null): Task => ({ id, createdAt: 1, updatedAt: 1, projectId: 'p', title: id, estimatedMinutes: 0, status: 'open', note: '', parentTaskId, assigneeId: null, assignmentExplicit: 0, archivedAt, position: 0 });
const all = [task('a', null), task('a1', 'a'), task('a1x', 'a1'), task('a2', 'a', 5), task('b', null), task('b1', 'b')];
describe('bulk selection helpers', () => {
  it('keeps only the outermost selected tasks, in first-appearance order, without repeats', () => {
    expect(normalizeTaskRoots(all, ['a1x', 'b', 'a', 'a1', 'b', 'b1'])).toEqual(['b', 'a']);
    expect(normalizeTaskRoots(all, ['a1', 'a1x'])).toEqual(['a1']);
  });
  it('counts live descendants and depth the way the server does', () => {
    expect(liveDescendants(all, 'a').map(t => t.id)).toEqual(['a1', 'a1x']);
    expect(subtreeDepth(all, 'a')).toBe(2);
    expect(subtreeDepth(all, 'b')).toBe(1);
    expect(subtreeDepth(all, 'a1x')).toBe(0);
  });
});
