import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { moduleFixture, project, NOW, type ModuleFixture } from '../spending/support.js';
import { workdayEnd } from '../../../src/modules/collaboration/index.js';
import { executeCommand } from '../../../src/core/commands.js';
import { handlers } from '../../../src/modules/index.js';
let f: ModuleFixture;
beforeEach(async () => { f = await moduleFixture(); });
afterEach(async () => { await f.close(); });
const equipment = async () => (await f.save({ type: 'equipment.create', name: 'Sprayer', note: '' })).result.id!;
describe('safe cleanup cycles', () => {
  it('records use without fabricating a safety interval or time entry', async () => {
    const id = await equipment(); const before = f.repo.list('time_entries');
    expect((await f.save({ type: 'equipment.use', id, taskId: null })).result.kind).toBe('cleanupRuleNeeded');
    expect(f.repo.list('cleanup_obligations')).toHaveLength(0);
    expect(f.repo.list('activity').some(a => a.body.includes('cleanup rule needs setup'))).toBe(true);
    expect(f.repo.list('time_entries')).toEqual(before);
  });
  it('sets end-of-day or the earlier deadline; re-use cannot extend or duplicate it', async () => {
    const id = await equipment(); await f.save({ type: 'equipment.cleanupRule', id, cleaningMinutes: 20, maxCleaningDelayMinutes: 600 });
    await f.save({ type: 'equipment.use', id, taskId: null });
    const first = f.repo.list('cleanup_obligations')[0];
    expect(first.deadlineAt).toBe(NOW + 600 * 60000); expect(first.dueAt).toBe(Date.parse('2026-09-17T21:00:00Z')); expect(first.cleaningMinutes).toBe(20);
    f.tick(3600000); await f.save({ type: 'equipment.cleanupRule', id, cleaningMinutes: 30, maxCleaningDelayMinutes: 1000 }); await f.save({ type: 'equipment.use', id, taskId: null });
    expect(f.repo.list('cleanup_obligations')).toEqual([first]);
    await f.save({ type: 'cleanup.complete', id: first.id }); await f.save({ type: 'equipment.use', id, taskId: null });
    const cycles = f.repo.list('cleanup_obligations'); expect(cycles).toHaveLength(2); expect(cycles[1].firstUsedAt).toBe(NOW + 3600000); expect(cycles[1].cleaningMinutes).toBe(30);
    expect(f.repo.list('time_entries')).toHaveLength(0);
  });
  it('caps immediate cleaning at the configured latest time', async () => {
    const id = await equipment(); await f.save({ type: 'equipment.cleanupRule', id, cleaningMinutes: 5, maxCleaningDelayMinutes: 30 }); await f.save({ type: 'equipment.use', id, taskId: null });
    const item = f.repo.list('cleanup_obligations')[0]; expect(item.dueAt).toBe(NOW + 30 * 60000); expect(item.dueAt).toBe(item.deadlineAt);
    expect((await f.send({ type: 'cleanup.snooze', id: item.id, dueAt: item.deadlineAt + 1 })).response.statusCode).toBe(400);
  });
  it('records the snoozing person; preserves original responsibility and immutable deadline', async () => {
    const id = await equipment(); await f.save({ type: 'equipment.cleanupRule', id, cleaningMinutes: 15, maxCleaningDelayMinutes: 1440 }); await f.save({ type: 'equipment.use', id, taskId: null });
    const first = f.repo.list('cleanup_obligations')[0], employee = randomUUID();
    f.db.prepare("INSERT INTO team_members VALUES (?,?,'A teammate',?,'employee','hash',NULL,?,?)").run(employee, f.ownerId, employee, NOW, NOW);
    const snooze = { type: 'cleanup.snooze' as const, id: first.id, dueAt: first.dueAt + 3600000 };
    executeCommand(f.db, f.ownerId, f.envelope(snooze, f.revision()), handlers, () => NOW + 1000, employee, 'employee');
    expect(f.repo.require('cleanup_obligations', first.id)).toMatchObject({ userId: f.ownerId, deadlineAt: first.deadlineAt, dueAt: snooze.dueAt });
    expect(f.repo.list('cleanup_snoozes')[0]).toMatchObject({ userId: employee, fromDueAt: first.dueAt, toDueAt: snooze.dueAt });
  });
  it('resolves business time through daylight-saving changes', () => {
    expect(workdayEnd(Date.parse('2026-03-08T13:00:00Z'), 1020, 'America/New_York')).toBe(Date.parse('2026-03-08T21:00:00Z'));
    expect(workdayEnd(Date.parse('2026-11-01T14:00:00Z'), 1020, 'America/New_York')).toBe(Date.parse('2026-11-01T22:00:00Z'));
    const late = Date.parse('2026-09-17T23:00:00Z'); expect(workdayEnd(late, 1020, 'America/New_York')).toBe(late);
  });
});
describe('notes, updates and deliberate shopping', () => {
  it('shares optional paint notes and checks shopping without changing expense or inventory', async () => {
    const projectId = (await f.save(project())).result.id!, beforeMoney = f.repo.list('expenses'), beforeStock = f.repo.list('materials');
    const note = (await f.save({ type: 'note.save', projectId, title: 'Trim paint', body: '', pinned: true, product: 'Brand', color: 'White', colorCode: '100', finish: 'Satin', quantity: '2 gallons', store: 'Supply shop', labelAttachmentId: null })).result.id!;
    expect(f.repo.list('shopping_items')).toHaveLength(0);
    const item = (await f.save({ type: 'shopping.add', title: 'Trim paint', note: '2 gallons Satin', projectId, sourceNoteId: note })).result.id!;
    await f.save({ type: 'shopping.check', id: item, checked: true }); await f.save({ type: 'shopping.check', id: item, checked: false });
    expect(f.repo.list('expenses')).toEqual(beforeMoney); expect(f.repo.list('materials')).toEqual(beforeStock); expect(f.repo.require('shopping_items', item).checkedAt).toBeNull();
    const update = await f.send({ type: 'update.post', projectId, taskId: null, body: 'Doors prepped.' }); await f.request(update.envelope);
    expect(f.repo.list('activity').filter(a => a.kind === 'message')).toHaveLength(1);
    expect(f.repo.list('project_notes')[0]).toMatchObject({ pinned: 1, createdBy: f.ownerId });
  });
  it('rejects a label photo or shopping source from another project', async () => {
    const first = (await f.save(project('First'))).result.id!, second = (await f.save(project('Second'))).result.id!;
    const id = (await f.save({ type: 'note.save', projectId: first, title: 'Paint', body: '', pinned: false, product: '', color: '', colorCode: '', finish: '', quantity: '', store: '', labelAttachmentId: null })).result.id!;
    expect((await f.send({ type: 'shopping.add', title: 'Paint', note: '', projectId: second, sourceNoteId: id })).response.statusCode).toBe(400);
  });
});
