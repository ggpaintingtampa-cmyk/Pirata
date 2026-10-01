// P10: the Camino work feed. Token auth and revocation, subject scope isolation, pagination, context stubs, no personal
// fields, dispositions, and completion through the normal command path (replay-safe, timer-aware, leaf-only).
import { afterEach, expect, it } from 'vitest';
import { createFixture, TEST_ORIGIN, type Fixture } from './helpers/fixture.js';
import { runAs, userOf, type Headers } from './helpers/roles.js';
let f: Fixture, clock = 1_790_000_000_000;
afterEach(async () => { await f?.close(); });
const ok = async (headers: Headers, command: unknown) => { const r = await runAs(f, headers, command); expect(r.statusCode, r.body).toBe(200); return r.json(); };
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
const feed = (token: string, query = '') => f.app.inject({ url: '/api/v1/integrations/work/v1/feed' + query, headers: bearer(token) });
async function setup() {
  clock = 1_790_000_000_000;
  f = await createFixture({ now: () => clock });
  const owner = await f.authenticate(), worker = await userOf(f, 'worker', owner), manager = await userOf(f, 'manager', owner);
  const client = (await ok(owner, { type: 'client.create', name: 'Smith', phone: '555', email: 'smith@example.test', note: 'private client note' })).result.id as string;
  const project = (await ok(owner, { type: 'project.create', name: 'Smith exterior', clientId: client, clientName: '', address: '12 Private Lane', note: 'private project note' })).result.id as string;
  const task = async (title: string, assigneeId: string | null, parentTaskId: string | null = null) => { clock += 1000; return (await ok(owner, { type: 'task.create', title, projectId: project, parentTaskId, estimatedMinutes: 45, note: 'private task note', assigneeId })).result.id as string; };
  const mine = await task('Prime the trim', worker.id);
  const parent = await task('Manager parent', manager.id);
  const childOfManager = await task('Child inherits manager', null, parent);
  const mineUnderParent = await task('Sand under manager parent', worker.id, parent);
  const pooled = await task('Pool task', null);
  await ok(owner, { type: 'dayList.replace', date: '2026-09-25', scope: { kind: 'person', userId: worker.id }, taskIds: [pooled] });
  await ok(owner, { type: 'task.setRequirements', taskId: mine, requirements: [{ kind: 'tool', name: 'Ladder' }] });
  await ok(owner, { type: 'question.ask', taskId: mine, body: 'A private question' });
  const create = async (scopes: string[], subjectUserId = worker.id) => { const r = await f.app.inject({ method: 'POST', url: '/api/v1/admin/integrations', headers: { ...owner, origin: TEST_ORIGIN }, payload: { label: 'Camino', subjectUserId, scopes } }); expect(r.statusCode, r.body).toBe(200); return r.json() as { token: string; summary: { id: string } }; };
  return { owner, worker, manager, project, mine, parent, childOfManager, mineUnderParent, pooled, create };
}
it('exports only the subject\'s assigned and planned tasks, with ancestor context and no private fields', async () => {
  const { worker, create, mine, parent, childOfManager, mineUnderParent, pooled } = await setup();
  const { token } = await create(['work.read']);
  const page = (await feed(token)).json();
  expect(page.contract).toBe('pirata-work-feed/1');
  expect(page.subject.userId).toBe(worker.id);
  expect(page.tasks.map((t: { id: string }) => t.id).sort()).toEqual([mine, mineUnderParent, pooled].sort());
  expect(page.tasks.map((t: { id: string }) => t.id)).not.toContain(parent);
  expect(page.tasks.map((t: { id: string }) => t.id)).not.toContain(childOfManager);
  expect(page.context).toEqual([{ id: parent, parentTaskId: null, projectId: expect.any(String), title: 'Manager parent', context: true }]);
  const exported = page.tasks.find((t: { id: string }) => t.id === mine);
  expect(Object.keys(exported).sort()).toEqual(['activeSession', 'completedAt', 'description', 'estimatedMinutes', 'hasChildren', 'id', 'parentTaskId', 'plannedDates', 'position', 'projectId', 'requirements', 'schedule', 'status', 'title', 'updatedAt']);
  expect(exported.requirements).toEqual([{ kind: 'tool', name: 'Ladder', quantity: '', unit: '' }]);
  expect(page.tasks.find((t: { id: string }) => t.id === pooled).plannedDates).toEqual(['2026-09-25']);
  expect(Object.keys(page.projects[0]).sort()).toEqual(['endDate', 'id', 'name', 'startDate', 'status', 'updatedAt']);
  const text = JSON.stringify(page);
  for (const secret of ['private task note', 'private project note', 'private client note', '12 Private Lane', 'A private question', 'smith@example.test']) expect(text).not.toContain(secret);
});
it('pages by (updatedAt, id) with an opaque cursor and ends with next null; a bad cursor is refused', async () => {
  const { create, mine, mineUnderParent, pooled } = await setup();
  const { token } = await create(['work.read']);
  const seen: string[] = []; let cursor: string | null = null, revision = -1;
  for (let i = 0; i < 5; i++) {
    const page: {revision: number; tasks: {id: string}[]; page: {next: string | null}} = (await feed(token, '?limit=1' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))).json();
    if (revision >= 0) expect(page.revision).toBe(revision); revision = page.revision;
    seen.push(...page.tasks.map((t: { id: string }) => t.id)); cursor = page.page.next;
    if (!cursor) break;
  }
  expect(seen).toEqual((await feed(token)).json().tasks.map((task: {id: string}) => task.id));
  expect([...seen].sort()).toEqual([mine, mineUnderParent, pooled].sort());
  expect((await feed(token, '?cursor=not-a-cursor')).statusCode).toBe(400);
});
it('refuses unknown, revoked and read-only tokens appropriately and never returns a token hash', async () => {
  const { owner, create, mine } = await setup();
  const { token, summary } = await create(['work.read']);
  expect((await feed('nope')).statusCode).toBe(401);
  const list = (await f.app.inject({ url: '/api/v1/admin/integrations', headers: owner })).json();
  expect(JSON.stringify(list)).not.toContain(token); expect(Object.keys(list[0])).not.toContain('tokenHash');
  const complete = await f.app.inject({ method: 'POST', url: '/api/v1/integrations/work/v1/complete', headers: bearer(token), payload: { requestId: '00000000-0000-4000-a000-00000000f001', taskId: mine, sourceRevision: 0 } });
  expect(complete.statusCode).toBe(403);
  const revoke = await f.app.inject({ method: 'POST', url: '/api/v1/admin/integrations/' + summary.id + '/revoke', headers: { ...owner, origin: TEST_ORIGIN }, payload: {} });
  expect(revoke.statusCode).toBe(200);
  const after = await feed(token);
  expect(after.statusCode).toBe(401); expect(after.json().error.code).toBe('TOKEN_REVOKED');
});
it('completes a leaf task as the subject once, replays the same request, refuses stale revisions, parents and other people\'s tasks', async () => {
  const { worker, create, mine, parent, childOfManager } = await setup();
  const { token } = await create(['work.read', 'work.complete']);
  const page = (await feed(token)).json();
  const envelope = { requestId: '00000000-0000-4000-a000-00000000f002', taskId: mine, sourceRevision: page.revision, expectedSessionId: null };
  const post = (payload: Record<string, unknown>) => f.app.inject({ method: 'POST', url: '/api/v1/integrations/work/v1/complete', headers: bearer(token), payload });
  const first = await post(envelope);
  expect(first.statusCode, first.body).toBe(200);
  expect(first.json().task).toMatchObject({ id: mine, status: 'done' });
  const replay = await post(envelope);
  expect(replay.statusCode).toBe(200); expect(replay.json().revision).toBe(first.json().revision);
  const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json();
  expect(snapshot.tasks.find((t: { id: string }) => t.id === mine)).toMatchObject({ status: 'done', completedBy: worker.id });
  const stale = await post({ ...envelope, requestId: '00000000-0000-4000-a000-00000000f003', sourceRevision: page.revision });
  expect(stale.statusCode).toBe(409); expect(stale.json().error.code).toBe('REVISION_CONFLICT');
  const foreign = await post({ ...envelope, requestId: '00000000-0000-4000-a000-00000000f004', taskId: childOfManager, sourceRevision: first.json().revision });
  expect(foreign.statusCode).toBe(403);
  await ok(await f.authenticate(), { type: 'task.update', id: parent, title: 'Manager parent', description: '', projectId: page.projects[0].id, estimatedMinutes: 0, note: '', assigneeId: worker.id, parentTaskId: null });
  const withChildren = await post({ ...envelope, requestId: '00000000-0000-4000-a000-00000000f005', taskId: parent, sourceRevision: first.json().revision + 1 });
  expect(withChildren.statusCode).toBe(409); expect(withChildren.json().error.code).toBe('TASK_HAS_CHILDREN');
});
it('exposes the subject\'s own running timer, closes it on a completion that names it, and reports dispositions', async () => {
  const { owner, worker, create, mine, pooled, parent } = await setup();
  const { token } = await create(['work.read', 'work.complete']);
  await ok(worker.headers, { type: 'timer.start', taskId: mine });
  const page = (await feed(token)).json();
  const exported = page.tasks.find((t: { id: string }) => t.id === mine);
  expect(exported.activeSession).toMatchObject({ sessionId: expect.any(String) });
  expect(page.tasks.find((t: { id: string }) => t.id === pooled).activeSession).toBeNull();
  const post = (payload: Record<string, unknown>) => f.app.inject({ method: 'POST', url: '/api/v1/integrations/work/v1/complete', headers: bearer(token), payload });
  const unnamed = await post({ requestId: '00000000-0000-4000-a000-00000000f010', taskId: mine, sourceRevision: page.revision, expectedSessionId: null });
  expect(unnamed.statusCode).toBe(409);
  clock += 60_000;
  const named = await post({ requestId: '00000000-0000-4000-a000-00000000f011', taskId: mine, sourceRevision: page.revision, expectedSessionId: exported.activeSession.sessionId });
  expect(named.statusCode, named.body).toBe(200);
  const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json();
  expect(snapshot.runningTimer).toBeNull();
  expect(snapshot.timeEntries.some((e: { taskId: string }) => e.taskId === mine)).toBe(true);
  await ok(owner, { type: 'record.delete', kind: 'task', id: pooled });
  const dispositions = (await f.app.inject({ url: '/api/v1/integrations/work/v1/dispositions?ids=' + [mine, pooled, parent, 'missing'].join(','), headers: bearer(token) })).json();
  expect(dispositions.items).toEqual([
    { id: mine, disposition: 'done', status: 'done', completedAt: expect.any(Number) },
    { id: pooled, disposition: 'deleted' },
    { id: parent, disposition: 'unassigned' },
    { id: 'missing', disposition: 'unknown' },
  ]);
});
it('rate-limits a token after sixty calls in a window', async () => {
  const { create } = await setup();
  const { token } = await create(['work.read']);
  let last = 200;
  for (let i = 0; i < 61; i++) { last = (await feed(token, '?limit=1')).statusCode; if (last === 429) break; }
  expect(last).toBe(429);
});
