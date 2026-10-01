// P12: order proposals are validated permutations of the open siblings, applied through a reviewed command once,
// refused when stale, undone through the stored envelope, and never available to non-office roles.
import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFixture, TEST_ORIGIN, type Fixture } from './helpers/fixture.js';
import { runAs, userOf, type Headers } from './helpers/roles.js';
import { mergeFixed } from '../src/ai/order.js';
let f: Fixture;
afterEach(async () => { vi.unstubAllEnvs(); await f?.close(); });
const ok = async (headers: Headers, command: unknown) => { const r = await runAs(f, headers, command); expect(r.statusCode, r.body).toBe(200); return r.json(); };
async function prepare(answer: (ids: string[]) => unknown) {
  vi.stubEnv('PIRATA_OPENAI_API_KEY', 'isolated-test-placeholder');
  const box: { ids: string[] } = { ids: [] };
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(answer(box.ids)), usage: { input_tokens: 80, output_tokens: 40 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  f = await createFixture({ fetcher: fetcher as unknown as typeof fetch });
  const owner = await f.authenticate();
  expect((await f.app.inject({ method: 'POST', url: '/api/v1/admin/ai', headers: owner, payload: { enabled: true, model: 'test-provider-model', dailyRequests: 10, monthlyBudgetCents: 500, inputCentsPerMillion: 100, outputCentsPerMillion: 500 } })).statusCode).toBe(200);
  const client = (await ok(owner, { type: 'client.create', name: 'Smith', phone: '', email: '', note: '' })).result.id as string;
  const project = (await ok(owner, { type: 'project.create', name: 'Smith exterior', clientId: client, clientName: '', address: '', note: '' })).result.id as string;
  const ids: string[] = [];
  for (const title of ['Wash', 'Prime', 'Paint', 'Clean up']) ids.push((await ok(owner, { type: 'task.create', title, projectId: project, parentTaskId: null, estimatedMinutes: 30, note: '' })).result.id as string);
  box.ids = ids;
  const suggest = (headers: Headers, requestId = randomUUID()) => f.app.inject({ method: 'POST', url: '/api/v1/ask/order/suggest', headers: { ...headers, origin: TEST_ORIGIN }, payload: { requestId, projectId: project, parentTaskId: null } });
  const apply = (headers: Headers, reviewId: string, optionIndex: number) => f.app.inject({ method: 'POST', url: '/api/v1/ask/order/apply', headers: { ...headers, origin: TEST_ORIGIN }, payload: { reviewId, optionIndex } });
  const order = async (headers: Headers) => ((await f.app.inject({ url: '/api/v1/snapshot', headers })).json().tasks as { id: string; position: number }[]).sort((a, b) => a.position - b.position).map(t => t.id);
  return { owner, project, ids, fetcher, suggest, apply, order };
}
const good = (ids: string[]) => ({ options: [{ name: 'Prep first', orderedIds: [ids[0], ids[1], ids[2], ids[3]], reasons: ['Washing before priming'], assumptions: ['Surfaces are dry'] }, { name: 'Fewest tool changes', orderedIds: [ids[1], ids[0], ids[2], ids[3]], reasons: ['Keep the sprayer out'], assumptions: [] }, { name: 'Duplicate of the first', orderedIds: [ids[0], ids[1], ids[2], ids[3]], reasons: [], assumptions: [] }] });
it('returns distinct valid options with reasons and assumptions, keeps done tasks fixed, and applies one order exactly once', async () => {
  const { owner, ids, suggest, apply, order } = await prepare(ids => ({options: good(ids).options.map(option => ({...option, orderedIds: option.orderedIds.filter(id => id !== ids[3])}))}));
  await ok(owner, { type: 'task.setStatus', id: ids[3], status: 'done', expectedSessionId: null });
  const before = await order(owner);
  const response = await suggest(owner);
  expect(response.statusCode, response.body).toBe(200);
  const proposal = response.json();
  expect(proposal.options).toHaveLength(2);
  expect(proposal.fixed).toEqual([ids[3]]);
  expect(proposal.applyRequestId).toBeUndefined();
  expect(mergeFixed(['a', 'b', 'c'], ['b'], ['c', 'a'])).toEqual(['c', 'b', 'a']);
  const applied = await apply(owner, proposal.reviewId, 1);
  expect(applied.statusCode, applied.body).toBe(200);
  expect(await order(owner)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  const replay = await apply(owner, proposal.reviewId, 1);
  expect(replay.statusCode).toBe(200); expect(replay.json().mutation.revision).toBe(applied.json().mutation.revision);
  const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  expect(snapshot.batchOperations.filter((b: { kind: string }) => b.kind === 'task.applyOrder')).toHaveLength(1);
  expect(snapshot.schedule).toEqual([]);
  const undone = await f.app.inject({ method: 'POST', url: '/api/v1/ask/order/undo', headers: { ...owner, origin: TEST_ORIGIN }, payload: { reviewId: proposal.reviewId } });
  expect(undone.statusCode, undone.body).toBe(200);
  expect(await order(owner)).toEqual(before);
});
it('rejects invented, missing, duplicate ids and a broken scheduled order, leaving manual ordering untouched', async () => {
  const cases: ((ids: string[]) => unknown)[] = [
    ids => ({ options: [{ name: 'x', orderedIds: [ids[0], ids[1], ids[2], 'invented'], reasons: [], assumptions: [] }] }),
    ids => ({ options: [{ name: 'x', orderedIds: [ids[0], ids[1]], reasons: [], assumptions: [] }] }),
    ids => ({ options: [{ name: 'x', orderedIds: [ids[0], ids[0], ids[1], ids[2]], reasons: [], assumptions: [] }] }),
  ];
  for (const bad of cases) {
    const { owner, suggest, order, ids } = await prepare(bad);
    const before = await order(owner);
    const response = await suggest(owner);
    expect(response.statusCode).toBe(502); expect(response.json().error.code).toBe('ORDER_INVALID');
    expect(await order(owner)).toEqual(before);
    expect((await runAs(f, owner, { type: 'task.reorder', projectId: (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json().projects[0].id, parentTaskId: null, orderedIds: [ids[3], ids[2], ids[1], ids[0]] })).statusCode).toBe(200);
    await f.close();
  }
  // Scheduled siblings keep their booked chronological order: a proposal that swaps them is refused.
  const { owner, ids, suggest, project } = await prepare(ids => ({ options: [{ name: 'x', orderedIds: [ids[5], ids[4], ids[0], ids[1], ids[2], ids[3]], reasons: [], assumptions: [] }] }));
  await ok(owner, { type: 'task.create', title: 'Scheduled early', projectId: project, parentTaskId: null, estimatedMinutes: 60, note: '', schedule: { date: '2026-09-25', startMinute: 480, endMinute: 540, allowOverlap: false } });
  const booked = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  const early = booked.tasks.find((t: { title: string }) => t.title === 'Scheduled early').id as string;
  await ok(owner, { type: 'task.create', title: 'Scheduled late', projectId: project, parentTaskId: null, estimatedMinutes: 60, note: '', schedule: { date: '2026-09-25', startMinute: 600, endMinute: 660, allowOverlap: false } });
  const late = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json().tasks.find((t: { title: string }) => t.title === 'Scheduled late').id as string;
  ids.push(early, late);
  const swapped = await suggest(owner);
  expect(swapped.statusCode).toBe(502);
  void ids;
});
it('refuses a stale proposal after the list changed, and non-office roles cannot ask or apply', async () => {
  const { owner, ids, suggest, apply, order } = await prepare(good);
  const proposal = (await suggest(owner)).json();
  await ok(owner, { type: 'task.reorder', projectId: proposal.projectId, parentTaskId: null, orderedIds: [ids[3], ids[2], ids[1], ids[0]] });
  const stale = await apply(owner, proposal.reviewId, 0);
  expect(stale.statusCode).toBe(409); expect(stale.json().error.code).toBe('REVISION_CONFLICT');
  expect(await order(owner)).toEqual([ids[3], ids[2], ids[1], ids[0]]);
  const fresh = await suggest(owner);
  expect(fresh.statusCode).toBe(200);
  const worker = await userOf(f, 'worker', owner);
  expect((await suggest(worker.headers)).statusCode).toBe(403);
  expect((await apply(worker.headers, proposal.reviewId, 0)).statusCode).toBe(403);
  const direct = await runAs(f, worker.headers, { type: 'task.applyOrder', reviewId: proposal.reviewId, optionIndex: 0, projectId: proposal.projectId, parentTaskId: null, orderedIds: ids });
  expect(direct.statusCode).toBe(403);
});
