import { describe, expect, it } from 'vitest';
import { createDemoState } from '../../src/data/demo';
import { applyCommand } from '../../src/domain/commands';
import { attentionItems, estimateVariance, initialTaskId, materialShortages, overlaps, spendingTotal, timeline } from '../../src/domain/selectors';
const now = Date.parse('2026-09-16T14:00:00Z');
describe('derived home state', () => {
  it('starts with the exact sample totals and task', () => {
    const s = createDemoState(now);
    expect(spendingTotal(s, s.seededOn)).toBe(8460); expect(initialTaskId(s, s.seededOn)).toBe('t-prep'); expect(timeline(s, s.seededOn)).toHaveLength(8);
    expect(attentionItems(s, s.seededOn).map(a => a.kind)).toEqual(['maintenance', 'shortage', 'lead']);
  });
  it('does not describe unfinished unused estimate as saved time', () => {
    const t = createDemoState(now).tasks[0];
    expect(estimateVariance(t, 45 * 60000)).toBeNull();
    expect(estimateVariance(t, 180 * 60000)).toBe('1h over estimate');
    expect(estimateVariance({ ...t, status: 'done' }, 60 * 60000)).toBe('1h under estimate');
  });
  it('shows three gallons missing and removes shortage on restock without spending', () => {
    const s = createDemoState(now);
    expect(materialShortages(s).map(r => r.missingMinor)).toEqual([300]);
    const next = applyCommand(s, { type: 'materialAdjustment', adjustment: { id: 'restock', materialId: 'm-paint', deltaMinor: 300, reason: 'restock', note: '', createdAt: now } });
    expect(materialShortages(next)).toHaveLength(0); expect(next.expenses).toEqual(s.expenses);
    expect(applyCommand(next, { type: 'materialAdjustment', adjustment: next.materialAdjustments[0] }).materials).toEqual(next.materials);
  });
  it('does not allocate the same stock to two projects', () => {
    const s = createDemoState(now); s.materials[0].stockMinor = 600;
    s.materialRequirements.push({ id: 'rivera-paint', materialId: 'm-paint', projectId: 'p-rivera', neededMinor: 300, reservedMinor: 0 });
    expect(materialShortages(s)).toEqual([expect.objectContaining({ requirementId: 'rivera-paint', allocatedMinor: 100, missingMinor: 200 })]);
  });
  it('sorts overdue reminders before today and excludes completed maintenance', () => {
    const s = createDemoState(now); s.leads[0].nextFollowUpDate = '2026-09-15'; s.maintenance[0].completedAt = now;
    expect(attentionItems(s, s.seededOn).map(a => a.kind)).toEqual(['lead', 'shortage']);
  });
  it('warns of overlaps without moving any blocks', () => {
    const s = createDemoState(now), before = structuredClone(s);
    expect(overlaps(s, { date: s.seededOn, startMinute: 550, endMinute: 620 }).map(b => b.id)).toEqual(['s-prep']);
    expect(overlaps(s, { ...s.schedule[2] })).toHaveLength(0); expect(s).toEqual(before);
  });
});
