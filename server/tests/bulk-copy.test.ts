// P03: one validated, atomic, replay-safe copy of selected task trees with id remapping and no history.
import { afterEach, expect, it } from 'vitest';
import { createFixture, type Fixture } from './helpers/fixture.js';
import { runAs, userOf, type Headers } from './helpers/roles.js';
import { normalizeSelection } from '../src/modules/bulk/index.js';
let f: Fixture, clock = 1_790_000_000_000;
afterEach(async () => { await f?.close(); });
const ok = async (headers: Headers, command: unknown) => { const r = await runAs(f, headers, command); expect(r.statusCode, r.body).toBe(200); return r.json(); };
async function setup() {
  f = await createFixture({ now: () => clock });
  const owner = await f.authenticate(), worker = await userOf(f, 'worker', owner);
  const client = (await ok(owner, { type: 'client.create', name: 'Smith', phone: '', email: '', note: '' })).result.id;
  const source = (await ok(owner, { type: 'project.create', name: 'Source', clientId: client, clientName: '', address: '', note: '' })).result.id as string;
  const target = (await ok(owner, { type: 'project.create', name: 'Target', clientId: client, clientName: '', address: '', note: '' })).result.id as string;
  const root = (await ok(owner, { type: 'task.create', title: 'Prep', projectId: source, parentTaskId: null, estimatedMinutes: 90, note: 'Bring the big ladder' })).result.id as string;
  const child = (await ok(owner, { type: 'task.create', title: 'Sand', projectId: source, parentTaskId: root, estimatedMinutes: 30, note: '' })).result.id as string;
  const grandchild = (await ok(owner, { type: 'task.create', title: 'Wipe', projectId: source, parentTaskId: child, estimatedMinutes: 10, note: '' })).result.id as string;
  await ok(owner, { type: 'task.setRequirements', taskId: root, requirements: [{ kind: 'material', name: 'Patch compound', quantity: '1', unit: 'tub' }, { kind: 'tool', name: 'Ladder' }] });
  await ok(owner, { type: 'task.setStatus', id: grandchild, status: 'done', expectedSessionId: null });
  await ok(owner, { type: 'timer.start', taskId: child });
  clock += 20 * 60 * 1000;
  const snap = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  await ok(owner, { type: 'timer.pause', expectedSessionId: snap.runningTimer.sessionId });
  await ok(owner, { type: 'question.ask', taskId: root, body: 'Which primer?' });
  return { owner, worker: worker.headers, source, target, root, child, grandchild };
}
const snapshot = async (headers: Headers) => (await f.app.inject({ url: '/api/v1/snapshot', headers })).json();
it('copies a tree with new ids, remapped parents, requirements, estimates and notes, and no work history', async () => {
  const { owner, target, root } = await setup();
  const copied = await ok(owner, { type: 'task.bulkCopy', sourceTaskIds: [root], destination: { projectId: target, parentTaskId: null }, expectedCount: 3 });
  const s = await snapshot(owner);
  const newRoot = s.tasks.find((t: { id: string }) => t.id === copied.result.id);
  expect(newRoot).toMatchObject({ title: 'Prep', projectId: target, parentTaskId: null, status: 'open', estimatedMinutes: 90, note: 'Bring the big ladder', completedAt: null });
  const newChild = s.tasks.find((t: { parentTaskId: string | null; projectId: string }) => t.parentTaskId === newRoot.id);
  const newGrandchild = s.tasks.find((t: { parentTaskId: string | null }) => t.parentTaskId === newChild.id);
  expect(newChild.title).toBe('Sand'); expect(newGrandchild).toMatchObject({ title: 'Wipe', status: 'open' });
  expect(s.taskRequirements.filter((r: { taskId: string }) => r.taskId === newRoot.id).map((r: { name: string }) => r.name)).toEqual(['Patch compound', 'Ladder']);
  expect(s.timeEntries.filter((e: { taskId: string }) => e.taskId === newChild.id)).toHaveLength(0);
  expect(s.taskQuestions.filter((q: { taskId: string }) => q.taskId === newRoot.id)).toHaveLength(0);
  expect(s.tasks.filter((t: { projectId: string }) => t.projectId === target)).toHaveLength(3);
  expect(s.batchOperations.filter((b: { kind: string }) => b.kind === 'task.bulkCopy')).toHaveLength(1);
});
it('copies each node once when a parent and its child are both selected, and honours include options', async () => {
  const { owner, target, root, child } = await setup();
  expect(normalizeSelection([{ id: root, parentTaskId: null }, { id: child, parentTaskId: root }] as never, [child, root, child])).toEqual([root]);
  await ok(owner, { type: 'task.bulkCopy', sourceTaskIds: [child, root], destination: { projectId: target, parentTaskId: null }, include: { children: false, requirements: false, estimates: false, notes: false, assignments: false, schedule: false }, expectedCount: 1 });
  const s = await snapshot(owner);
  const copies = s.tasks.filter((t: { projectId: string }) => t.projectId === target);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ title: 'Prep', estimatedMinutes: 0, note: '' });
  expect(s.taskRequirements.filter((r: { taskId: string }) => r.taskId === copies[0].id)).toHaveLength(0);
});
it('refuses a stale preview count, a fourth nesting level, a completed destination, and leaves nothing behind', async () => {
  const { owner, source, target, root } = await setup();
  const stale = await runAs(f, owner, { type: 'task.bulkCopy', sourceTaskIds: [root], destination: { projectId: target, parentTaskId: null }, expectedCount: 2 });
  expect(stale.statusCode).toBe(409); expect(stale.json().error.code).toBe('BULK_PREVIEW_STALE');
  const parent = (await ok(owner, { type: 'task.create', title: 'Holder', projectId: target, parentTaskId: null, estimatedMinutes: 0, note: '' })).result.id as string;
  const deep = await runAs(f, owner, { type: 'task.bulkCopy', sourceTaskIds: [root], destination: { projectId: target, parentTaskId: parent }, expectedCount: 3 });
  expect(deep.statusCode).toBe(400);
  await ok(owner, { type: 'project.setStatus', id: source, status: 'completed' });
  const closed = await runAs(f, owner, { type: 'task.bulkCopy', sourceTaskIds: [root], destination: { projectId: source, parentTaskId: null }, expectedCount: 3 });
  expect(closed.statusCode).toBe(400);
  const s = await snapshot(owner);
  expect(s.tasks.filter((t: { projectId: string }) => t.projectId === target)).toHaveLength(1);
});
it('replays an identical request without a second copy and rejects a worker who cannot see the destination', async () => {
  const { owner, worker, target, root } = await setup();
  const snap = await snapshot(owner);
  const envelope = { requestId: '00000000-0000-4000-a000-00000000bc01', baseRevision: snap.revision, command: { type: 'task.bulkCopy', sourceTaskIds: [root], destination: { projectId: target, parentTaskId: null }, expectedCount: 3 } };
  const first = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: owner, payload: envelope });
  const replay = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: owner, payload: envelope });
  expect(first.statusCode).toBe(200); expect(replay.statusCode).toBe(200);
  expect(replay.json().result.id).toBe(first.json().result.id);
  expect((await snapshot(owner)).tasks.filter((t: { projectId: string }) => t.projectId === target)).toHaveLength(3);
  const workerAttempt = await runAs(f, worker, { type: 'task.bulkCopy', sourceTaskIds: [root], destination: { projectId: 'nope', parentTaskId: null }, expectedCount: 3 });
  expect(workerAttempt.statusCode).toBe(404);
});
