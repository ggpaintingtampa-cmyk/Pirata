import { describe, expect, it } from 'vitest';
import { createDemoState } from '../../src/data/demo';
import { applyCommand } from '../../src/domain/commands';
import { validateState } from '../../src/domain/schema';
import { actualTaskTime } from '../../src/domain/selectors';
const now = Date.parse('2026-09-16T14:00:00Z');
const seed = () => createDemoState(now);
describe('business commands', () => {
  it('edits an expense using the same ID', () => {
    const s = seed(), next = applyCommand(s, { type: 'expense', expense: { ...s.expenses[0], amountCents: 2500 } });
    expect(next.expenses).toHaveLength(2); expect(next.expenses[0].amountCents).toBe(2500); expect(s.expenses[0].amountCents).toBe(6240);
  });
  it('start/pause/resume excludes paused time and double pause is idempotent', () => {
    let s = seed();
    s = applyCommand(s, { type: 'start', taskId: 't-prep', sessionId: 'session-a', now });
    const repeated = applyCommand(s, { type: 'start', taskId: 't-prep', sessionId: 'unused', now: now + 1000 });
    expect(repeated.runningTimer?.sessionId).toBe('session-a');
    s = applyCommand(s, { type: 'pause', now: now + 60000 });
    s = applyCommand(s, { type: 'pause', now: now + 120000 });
    expect(s.timeEntries).toHaveLength(2);
    s = applyCommand(s, { type: 'start', taskId: 't-prep', sessionId: 'session-b', now: now + 180000 });
    s = applyCommand(s, { type: 'pause', now: now + 300000 });
    expect(actualTaskTime(s, 't-prep', now + 500000)).toBe(48 * 60000);
    expect(s.timeEntries[1].id).toBe('session-a');
  });
  it('switches atomically and leaves one active session', () => {
    const s = applyCommand(seed(), { type: 'start', taskId: 't-prep', sessionId: 'session-a', now });
    expect(() => applyCommand(s, { type: 'start', taskId: 't-coat', sessionId: 'session-b', now: now + 60000 })).toThrow(/Confirm/);
    const switched = applyCommand(s, { type: 'start', taskId: 't-coat', sessionId: 'session-b', now: now + 60000, switchConfirmed: true });
    expect(switched.runningTimer?.taskId).toBe('t-coat'); expect(switched.timeEntries.filter(e => e.id === 'session-a')).toHaveLength(1);
  });
  it.each(['done', 'blocked'] as const)('closes the timer when a task is %s', status => {
    const s = applyCommand(seed(), { type: 'start', taskId: 't-prep', sessionId: 'session-a', now });
    const next = applyCommand(s, { type: 'task', task: { ...s.tasks[0], status } }, now + 60000);
    expect(next.runningTimer).toBeNull(); expect(next.timeEntries).toHaveLength(2); expect(next.objectives[0].status).toBe('open'); expect(next.schedule).toEqual(s.schedule);
    expect(() => applyCommand(next, { type: 'start', taskId: 't-prep', sessionId: 'blocked', now })).toThrow(/Reopen/);
    const reopened = applyCommand(next, { type: 'task', task: { ...next.tasks[0], status: 'open' } });
    expect(reopened.timeEntries).toEqual(next.timeEntries);
  });
  it('reconstructs active elapsed time after refresh without duplicate counting', () => {
    const s = applyCommand(seed(), { type: 'start', taskId: 't-prep', sessionId: 'session-a', now });
    const restored = validateState(JSON.parse(JSON.stringify(s)));
    expect(actualTaskTime(restored, 't-prep', now + 90000)).toBe(2700000 + 90000);
    const paused = applyCommand(restored, { type: 'pause', now: now + 90000 });
    expect(actualTaskTime(paused, 't-prep', now + 180000)).toBe(2790000);
  });
  it('creates no zero-length entry, rejects backward clocks, allows explicit correction/discard', () => {
    const s = applyCommand(seed(), { type: 'start', taskId: 't-prep', sessionId: 'session-a', now });
    expect(applyCommand(s, { type: 'pause', now }).timeEntries).toHaveLength(1);
    expect(() => applyCommand(s, { type: 'pause', now: now - 1 })).toThrow(/clock moved backward/);
    const corrected = applyCommand(s, { type: 'correctTimer', startedAt: now - 1000, now });
    expect(applyCommand(corrected, { type: 'pause', now }).timeEntries).toHaveLength(2);
    expect(applyCommand(s, { type: 'discardTimer' }).timeEntries).toHaveLength(1);
  });
  it('keeps cross-midnight timer intervals intact', () => {
    const start = Date.parse('2026-09-17T03:30:00Z'), end = Date.parse('2026-09-17T04:30:00Z');
    const s = applyCommand(seed(), { type: 'start', taskId: 't-prep', sessionId: 'overnight', now: start });
    const finished = applyCommand(s, { type: 'pause', now: end });
    expect(finished.timeEntries.at(-1)).toMatchObject({ startedAt: start, endedAt: end });
  });
  it('limits objectives to three and requires blocked explanations', () => {
    const s = seed();
    expect(() => applyCommand(s, { type: 'objectives', date: s.seededOn, objectives: [...s.objectives, { ...s.objectives[0], id: 'fourth' }] })).toThrow(/three/);
    expect(() => applyCommand(s, { type: 'objectives', date: s.seededOn, objectives: [{ ...s.objectives[0], status: 'blocked', note: '  ' }] })).toThrow(/Explain/);
  });
  it('preserves other dates and task statuses when objectives change', () => {
    const s = seed(); s.objectives.push({ ...s.objectives[0], id: 'yesterday', date: '2026-09-15' });
    const next = applyCommand(s, { type: 'objectives', date: s.seededOn, objectives: [{ ...s.objectives[0], status: 'done' }] });
    expect(next.objectives.find(o => o.id === 'yesterday')).toBeDefined(); expect(next.tasks[0].status).toBe('open');
  });
  it('creates a scheduled task as one validated transaction', () => {
    const s = seed(), task = { ...s.tasks[0], id: 'new-task', title: 'New task' };
    const block = { ...s.schedule[2], id: 'new-block', taskId: task.id };
    const success = applyCommand(s, { type: 'task', task, block });
    expect(success.tasks).toHaveLength(5); expect(success.schedule).toHaveLength(9);
    expect(() => applyCommand(s, { type: 'task', task, block: { ...block, endMinute: block.startMinute } })).toThrow(/End must/);
    expect(s.tasks).toHaveLength(4); expect(s.schedule).toHaveLength(8);
  });
  it('does not stretch a schedule block when an estimate changes', () => {
    const s = seed(); const next = applyCommand(s, { type: 'task', task: { ...s.tasks[0], estimatedMinutes: 180 } });
    expect(next.schedule).toEqual(s.schedule);
  });
  it('enforces material stock, reservations, and whole pieces', () => {
    const s = seed(), adjustment = { id: 'a', materialId: 'm-paint', deltaMinor: -100, reason: 'usage' as const, note: '', createdAt: now };
    expect(() => applyCommand(s, { type: 'materialAdjustment', adjustment })).toThrow(/reservations/);
    expect(() => applyCommand(s, { type: 'materialAdjustment', adjustment: { ...adjustment, materialId: 'm-tape', deltaMinor: 50 } })).toThrow(/whole units/);
  });
  it('records a follow-up once and clears its reminder', () => {
    const s = seed(), command = { type: 'followUp' as const, leadId: 'l-taylor', id: 'follow', now, note: 'Spoke about timing.', nextDate: null };
    const next = applyCommand(applyCommand(s, command), command);
    expect(next.leads[0].followUps).toHaveLength(1); expect(next.leads[0].nextFollowUpDate).toBeNull();
    expect(() => applyCommand(s, { ...command, note: '' })).toThrow();
  });
  it('validates stored relationships and unknown schemas', () => {
    const s = seed();
    expect(() => validateState({ ...s, schemaVersion: 2 })).toThrow();
    expect(() => validateState({ ...s, tasks: [{ ...s.tasks[0], projectId: 'missing' }] })).toThrow();
    expect(() => validateState({ ...s, schedule: [...s.schedule, { ...s.schedule[2], id: 'duplicate-schedule' }] })).toThrow(/only one/);
  });
});
