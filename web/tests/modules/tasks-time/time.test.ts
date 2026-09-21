import { expect, it } from 'vitest';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { formatDuration } from '@pirata/domain/lib/time';
import { actualMilliseconds, minute, timestamp } from '../../../src/features/tasks-time/time';
const empty: BusinessSnapshot = { schemaVersion: 2, timezone: 'America/New_York', currency: 'USD', revision: 0, serverNow: 100000, capabilities: { 'clients-projects': 'ready', 'tasks-time': 'ready', planning: 'ready', spending: 'blocked', inventory: 'blocked' }, clients: [], projects: [], tasks: [], objectives: [], schedule: [], timeEntries: [], runningTimer: null, expenses: [], materials: [], materialRequirements: [], materialAdjustments: [], equipment: [], maintenance: [], leads: [] };
const base = { createdAt: 0, updatedAt: 0, taskId: 'task', source: 'timer' as const, note: '' };
it('adds precise intervals first and rounds only the displayed total', () => {
  const s = { ...empty, timeEntries: [{ ...base, id: 'one', startedAt: 0, endedAt: 30500 }, { ...base, id: 'two', startedAt: 31000, endedAt: 61500 }] };
  expect(actualMilliseconds(s, 'task', 100000)).toBe(61000);
  expect(formatDuration(actualMilliseconds(s, 'task', 100000)!)).toBe('1m');
});
it('active-to-closed snapshot transition counts the same session exactly once', () => {
  const active = { ...empty, runningTimer: { taskId: 'task', sessionId: 'running', startedAt: 20000 } };
  const closed = { ...empty, timeEntries: [{ ...base, id: 'running', startedAt: 20000, endedAt: 100000 }] };
  expect(actualMilliseconds(active, 'task', 100000)).toBe(80000);
  expect(actualMilliseconds(closed, 'task', 150000)).toBe(80000);
  expect(actualMilliseconds(active, 'another', 100000)).toBe(0);
});
it('backwards active clock is unknown rather than a fabricated zero duration', () => {
  expect(actualMilliseconds({ ...empty, runningTimer: { taskId: 'task', sessionId: 'running', startedAt: 100001 } }, 'task', 100000)).toBeNull();
});
it('parses explicit business minutes and requires a timezone for corrections', () => {
  expect(minute('24:00')).toBe(1440); expect(minute('09:30')).toBe(570);
  expect(minute('24:01')).toBeNaN(); expect(minute('09:60')).toBeNaN(); expect(minute('9:30')).toBeNaN();
  expect(timestamp('2026-09-17T12:30')).toBeNaN(); expect(timestamp('2026-09-17T12:30:00-04:00')).toBe(Date.parse('2026-09-17T16:30:00Z'));
});
