import { describe, expect, it } from 'vitest';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { reportData } from '../../src/features/report/selectors';
// 2026-09-25 14:00 New York = 18:00 UTC
const at = Date.UTC(2026, 8, 25, 18, 0), yesterday = Date.UTC(2026, 8, 24, 18, 0);
const snapshot = {
  projects: [{ id: 'p', name: 'Smith' }, { id: 'q', name: 'Jones' }],
  tasks: [
    { id: 't1', projectId: 'p', title: 'Prime', status: 'done', completedAt: at, completedBy: 'jose', archivedAt: null, parentTaskId: null },
    { id: 't2', projectId: 'q', title: 'Wash', status: 'done', completedAt: yesterday, completedBy: 'jose', archivedAt: null, parentTaskId: null },
    { id: 't3', projectId: 'p', title: 'Tape', status: 'done', completedAt: at + 1, completedBy: 'ana', archivedAt: null, parentTaskId: 't1' },
  ],
  workShifts: [{ id: 's1', userId: 'jose', projectId: 'p', date: '2026-09-25', status: 'approved', minutes: 480 }, { id: 's2', userId: 'ana', projectId: 'p', date: '2026-09-24', status: 'approved', minutes: 240 }],
  dayAssignments: [{ id: 'd1', date: '2026-09-25', projectId: 'p', taskId: null, userId: 'ana', position: 0, createdBy: 'm', createdAt: 1, updatedAt: 1 }],
  dayNotes: [{ id: 'n1', userId: 'jose', date: '2026-09-25', body: 'Done.' }, { id: 'n2', userId: 'ana', date: '2026-09-25', body: '   ' }],
  taskQuestions: [{ id: 'q1', taskId: 't1', projectId: 'p', askedBy: 'jose', body: 'Which primer?', createdAt: at, answeredAt: null, answeredBy: null, answer: '' }],
  shoppingItems: [{ id: 'i1', title: 'Primer', projectId: 'p', createdBy: 'jose', createdAt: at, archivedAt: null }, { id: 'i2', title: 'Old', projectId: 'p', createdBy: 'jose', createdAt: yesterday, archivedAt: null }],
  toolSignOuts: [{ id: 'o1', equipmentId: 'e', takenBy: 'jose', takenAt: yesterday, projectId: 'p', returnedAt: at }],
  equipmentReports: [],
  expenses: [{ id: 'x1', purchaseDate: '2026-09-25', projectId: 'p', amountCents: 5000, description: 'Tape', category: 'materials' }],
  payRates: [{ id: 'r', userId: 'jose', kind: 'hourly', amountCents: 2000, effectiveFrom: '2026-01-01', createdAt: 1, updatedAt: 1, createdBy: 'o' }],
} as unknown as BusinessSnapshot;
describe('daily report selectors', () => {
  it('collects everything that happened on the business day', () => {
    const data = reportData(snapshot, { date: '2026-09-25' });
    expect(data.completed.map(t => t.id)).toEqual(['t1', 't3']);
    expect(data.shifts.map(s => s.id)).toEqual(['s1']);
    expect(data.missingHours).toEqual([{ userId: 'ana', projectId: 'p' }]);
    expect(data.notes.map(n => n.id)).toEqual(['n1']);
    expect(data.questions).toHaveLength(1);
    expect(data.requests.map(i => i.id)).toEqual(['i1']);
    expect(data.tools).toEqual([{ signOut: snapshot.toolSignOuts![0], kind: 'returned' }]);
    expect(data.expenses).toHaveLength(1);
    expect(data.labor).toEqual([{ projectId: 'p', minutes: 480, cents: 16000 }]);
  });
  it('filters by person and project', () => {
    expect(reportData(snapshot, { date: '2026-09-25', userId: 'ana' }).completed.map(t => t.id)).toEqual(['t3']);
    expect(reportData(snapshot, { date: '2026-09-25', userId: 'ana' }).shifts).toEqual([]);
    expect(reportData(snapshot, { date: '2026-09-24', projectId: 'q' }).completed.map(t => t.id)).toEqual(['t2']);
    expect(reportData(snapshot, { date: '2026-09-24', projectId: 'q' }).shifts).toEqual([]);
  });
});
