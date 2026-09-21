import { describe, expect, it } from 'vitest';
import { createAppStore } from '../../src/state/createAppStore';
import type { Repository } from '../../src/data/repository';
import { createDemoState } from '../../src/data/demo';
const now = Date.parse('2026-09-16T14:00:00Z');
function repository(initial: string | null = null) {
  let raw = initial, writes = 0, fail = false;
  let listener = () => {};
  const repo: Repository = { read: () => raw, write: value => { if (fail) throw new Error('Quota exceeded'); raw = value; writes++; }, subscribe: fn => { listener = fn; return () => {}; } };
  return { repo, raw: () => raw, writes: () => writes, fail: () => { fail = true; }, change: (next: string) => { raw = next; listener(); } };
}
describe('transactional storage', () => {
  it('initializes only once even under repeated initialization', () => {
    const r = repository(), store = createAppStore(r.repo, () => now);
    store.initialize(); store.initialize();
    expect(r.writes()).toBe(1); expect(store.getSnapshot().data?.timeEntries).toHaveLength(1);
    const reloaded = createAppStore(r.repo, () => now + 86400000); reloaded.initialize();
    expect(r.writes()).toBe(1); expect(reloaded.getSnapshot().data?.seededOn).toBe('2026-09-16');
  });
  it('keeps invalid saved content untouched for recovery', () => {
    for (const raw of ['{broken', JSON.stringify({ schemaVersion: 22 }), JSON.stringify({ ...createDemoState(now), runningTimer: { sessionId: 'bad', taskId: 'missing', startedAt: now } })]) {
      const r = repository(raw), store = createAppStore(r.repo, () => now); store.initialize();
      expect(store.getSnapshot().mode).toBe('recovery'); expect(store.getSnapshot().raw).toBe(raw); expect(r.raw()).toBe(raw); expect(r.writes()).toBe(0);
    }
  });
  it('does not publish or report success when a save fails', () => {
    const r = repository(), store = createAppStore(r.repo, () => now); store.initialize();
    const before = store.getSnapshot().data!, raw = r.raw(); r.fail();
    const result = store.execute({ type: 'expense', expense: { ...before.expenses[0], amountCents: 1 } });
    expect(result.ok).toBe(false); expect(store.getSnapshot().data).toBe(before); expect(r.raw()).toBe(raw); expect(store.getSnapshot().error).toMatch(/Could not save/);
  });
  it('requires explicit memory mode when storage is unavailable', () => {
    const r = repository(); r.fail(); const store = createAppStore(r.repo, () => now); store.initialize();
    expect(store.getSnapshot().mode).toBe('unavailable'); expect(store.getSnapshot().data).toBeNull();
    store.useMemory(); expect(store.getSnapshot().mode).toBe('memory');
    expect(store.execute({ type: 'start', taskId: 't-prep', sessionId: 'a', now }).ok).toBe(true); expect(r.writes()).toBe(0);
  });
  it('freezes editing after another tab changes the key', () => {
    const r = repository(), store = createAppStore(r.repo, () => now); store.initialize();
    const before = store.getSnapshot().data;
    r.change('changed'); expect(store.getSnapshot().mode).toBe('conflict');
    expect(store.execute({ type: 'pause', now }).ok).toBe(false); expect(store.getSnapshot().data).toBe(before);
    expect(store.reset().ok).toBe(false); expect(r.raw()).toBe('changed');
  });
  it('persists scheduled creation once or keeps both records absent on failure', () => {
    const r = repository(), store = createAppStore(r.repo, () => now); store.initialize();
    const seed = store.getSnapshot().data!, task = { ...seed.tasks[0], id: 'new' }, block = { ...seed.schedule[2], id: 'new-block', taskId: 'new' };
    expect(store.execute({ type: 'task', task, block }).ok).toBe(true); expect(r.writes()).toBe(2);
    r.fail();
    expect(store.execute({ type: 'task', task: { ...task, id: 'failed' }, block: { ...block, id: 'failed-block', taskId: 'failed' } }).ok).toBe(false);
    expect(store.getSnapshot().data?.tasks.some(t => t.id === 'failed')).toBe(false); expect(store.getSnapshot().data?.schedule.some(b => b.taskId === 'failed')).toBe(false);
  });
  it('saves a timer switch once and preserves the old session if persistence fails', () => {
    const r = repository(), store = createAppStore(r.repo, () => now); store.initialize();
    store.execute({ type: 'start', taskId: 't-prep', sessionId: 'a', now }); r.fail();
    expect(store.execute({ type: 'start', taskId: 't-coat', sessionId: 'b', now: now + 60000, switchConfirmed: true }).ok).toBe(false);
    expect(store.getSnapshot().data?.runningTimer?.sessionId).toBe('a'); expect(store.getSnapshot().data?.timeEntries).toHaveLength(1);
  });
});
