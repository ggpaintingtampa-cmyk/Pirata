// P04: prefill rules for hours entered from a calendar day, and the day-unit total used by reports.
import { describe, expect, it } from 'vitest';
import { shiftMinutes, STANDARD_DAY_MINUTES } from '@pirata/contracts/index';
import { prefillDate, preselectProject } from '../../src/features/hours/defaults';
const snapshot = {
  projects: [{ id: 'done', name: 'Finished', status: 'completed' }, { id: 'p', name: 'Smith', status: 'active' }, { id: 'q', name: 'Jones', status: 'active' }],
  dayAssignments: [{ id: 'd1', date: '2026-09-25', projectId: 'q', taskId: null, userId: 'ana', position: 0, createdBy: 'm', createdAt: 1, updatedAt: 1 }],
} as never;
describe('hours dialog prefill', () => {
  it('uses the selected calendar day as a plain local date and falls back to the business date', () => {
    expect(prefillDate('2026-09-03', '2026-09-25')).toBe('2026-09-03');
    expect(prefillDate(undefined, '2026-09-25')).toBe('2026-09-25');
    expect(prefillDate('2026-9-3', '2026-09-25')).toBe('2026-09-25');
    expect(prefillDate('2026-09-03T00:00:00Z', '2026-09-25')).toBe('2026-09-25');
  });
  it('preselects the project where the person is planned that day, else the first active project', () => {
    expect(preselectProject(snapshot, 'ana', '2026-09-25')).toBe('q');
    expect(preselectProject(snapshot, 'jose', '2026-09-25')).toBe('p');
    expect(preselectProject(snapshot, 'ana', '2026-09-26')).toBe('p');
    expect(preselectProject({ projects: [], dayAssignments: [] } as never, 'ana', '2026-09-25')).toBe('');
  });
  it('totals a day entry as daysMinor/100 of the standard day, never silently as eight hours of clock time', () => {
    expect(shiftMinutes({ kind: 'day', startMinute: null, endMinute: null, breakMinutes: 0, daysMinor: 100 })).toBe(STANDARD_DAY_MINUTES);
    expect(shiftMinutes({ kind: 'day', startMinute: null, endMinute: null, breakMinutes: 0, daysMinor: 50 })).toBe(STANDARD_DAY_MINUTES / 2);
    expect(shiftMinutes({ kind: 'hours', startMinute: 480, endMinute: 990, breakMinutes: 30, daysMinor: null })).toBe(480);
    expect(shiftMinutes({ kind: 'hours', startMinute: 480, endMinute: 480, breakMinutes: 0, daysMinor: null })).toBe(0);
  });
});
