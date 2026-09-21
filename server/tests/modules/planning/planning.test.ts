import { afterEach, beforeEach, expect, it } from 'vitest';
import type { CommandOf } from '@pirata/contracts/index';
import { Repositories } from '../../../src/core/repositories.js';
import { NOW, setup, type TestApp } from '../tasks-time/support.js';
let f: TestApp;
beforeEach(async () => { f = await setup(); });
afterEach(async () => { await f.close(); });
const day = '2026-09-17';
const objective = (id: string, rank: number) => ({ id, rank, title: id, taskId: null as string | null, status: 'open' as const, note: '' });
const replace = (objectives: CommandOf<'objectives.replaceForDate'>['objectives'], date = day): CommandOf<'objectives.replaceForDate'> => ({ type: 'objectives.replaceForDate', date, objectives });
const block = (taskId: string, startMinute: number, endMinute: number, allowOverlap = false): CommandOf<'schedule.setTaskBlock'> => ({ type: 'schedule.setTaskBlock', taskId, block: { date: day, startMinute, endMinute, allowOverlap } });
it('caps objectives at three including done and requires a blocker explanation', async () => {
  expect((await f.send(replace([{ ...objective('a', 0), status: 'done' }, objective('b', 1), objective('c', 2), objective('d', 0)]))).statusCode).toBe(400);
  expect((await f.send(replace([{ ...objective('a', 0), status: 'blocked', note: ' ' }]))).statusCode).toBe(400);
  await f.save(replace([{ ...objective('a', 0), status: 'blocked', note: ' Waiting for paint ' }]));
  expect(f.repo.list('objectives')[0].note).toBe('Waiting for paint');
  expect((await f.snapshot()).capabilities.planning).toBe('ready');
});
it('reorders ranks atomically, keeps record identity and other dates, supports remove and no-op', async () => {
  await f.save(replace([objective('a', 0), objective('b', 1), objective('c', 2)]));
  await f.save(replace([objective('tomorrow', 0)], '2026-09-18'));
  const tomorrow = f.repo.require('objectives', 'tomorrow'); f.clock(NOW + 10000);
  const command = replace([objective('c', 0), objective('a', 1), objective('b', 2)]);
  await f.save(command); expect((await f.save(command)).changed).toBe(false);
  expect(f.repo.require('objectives', 'a')).toMatchObject({ createdAt: NOW, updatedAt: NOW + 10000, rank: 1 });
  expect(f.repo.require('objectives', 'tomorrow')).toEqual(tomorrow);
  expect((await f.send(replace([objective('tomorrow', 0)]))).json().error.code).toBe('OBJECTIVE_DATE_CONFLICT');
  await f.save(replace([objective('a', 0)])); expect(f.repo.list('objectives')).toHaveLength(2);
  await f.save(replace([])); expect(f.repo.list('objectives')).toEqual([tomorrow]);
});
it('task and objective completion remain independent', async () => {
  const taskId = await f.task();
  await f.save(replace([{ ...objective('a', 0), taskId, status: 'done' }]));
  expect(f.repo.require('tasks', taskId).status).toBe('open');
  await f.save(replace([{ ...objective('a', 0), taskId }]));
  await f.save({ type: 'task.setStatus', id: taskId, status: 'done', expectedSessionId: null });
  expect(f.repo.require('objectives', 'a').status).toBe('open');
});
it('rejects impossible dates, duplicate ranks, backwards and overnight blocks', async () => {
  const taskId = await f.task();
  for (const [start, end] of [[100, 100], [100, 99], [1430, 1450], [-1, 10]]) expect((await f.send(block(taskId, start, end))).statusCode).toBe(400);
  expect((await f.send({ ...block(taskId, 100, 200), block: { ...block(taskId, 100, 200).block, date: '2026-02-30' } })).statusCode).toBe(400);
  expect((await f.send(replace([objective('a', 0), objective('b', 0)]))).statusCode).toBe(400);
  expect((await f.send(replace([], '2026-02-30'))).statusCode).toBe(400);
});
it('permits adjacent endpoints, requires explicit overlap, and never moves other blocks', async () => {
  const a = await f.task(), b = await f.task('Second');
  await f.save(block(a, 540, 600)); await f.save(block(b, 600, 660));
  const original = f.repo.list('schedule_blocks').find(x => x.taskId === a)!;
  expect((await f.send(block(b, 599, 660))).json().error.code).toBe('SCHEDULE_OVERLAP');
  await f.save(block(b, 599, 660, true));
  expect(f.repo.list('schedule_blocks').find(x => x.taskId === a)).toEqual(original);
  expect(f.repo.list('schedule_blocks')).toHaveLength(2);
});
it('reschedules in place, excludes itself, preserves planned times on completion/estimate edits, removes idempotently', async () => {
  const taskId = await f.task(); await f.save(block(taskId, 540, 600));
  const original = f.repo.list('schedule_blocks')[0];
  await f.save(block(taskId, 550, 650)); expect((await f.save(block(taskId, 550, 650))).changed).toBe(false);
  await f.save({ type: 'task.update', id: taskId, title: 'New title', projectId: null, estimatedMinutes: 10, note: '' });
  await f.save({ type: 'task.setStatus', id: taskId, status: 'done', expectedSessionId: null });
  expect((await f.snapshot()).schedule[0]).toMatchObject({ id: original.id, createdAt: original.createdAt, startMinute: 550, endMinute: 650, title: 'New title' });
  await f.save({ type: 'schedule.removeTaskBlock', taskId }); expect((await f.save({ type: 'schedule.removeTaskBlock', taskId })).changed).toBe(false);
});
it('replays requests once; stale replace/block cannot overwrite current state', async () => {
  const request = f.envelope(replace([objective('a', 0)]), 0);
  const saved = await f.post(request); expect(saved.statusCode).toBe(200);
  await f.save(replace([objective('a', 0), objective('b', 1)]));
  expect((await f.post(request)).json()).toEqual(saved.json());
  const before = await f.snapshot();
  expect((await f.post(f.envelope(replace([]), 1))).json().error.code).toBe('REVISION_CONFLICT');
  const taskId = await f.task(); const revision = (await f.snapshot()).revision;
  await f.save(block(taskId, 10, 20));
  expect((await f.post(f.envelope(block(taskId, 20, 30), revision))).statusCode).toBe(409);
  expect((await f.snapshot()).objectives).toEqual(before.objectives);
});
it('a replacement failure rolls back removed objectives and revision', async () => {
  await f.save(replace([objective('a', 0), objective('b', 1)]));
  const before = await f.snapshot();
  f.db.exec("CREATE TRIGGER fail_objective BEFORE INSERT ON objectives WHEN NEW.id='b' BEGIN SELECT RAISE(ABORT, 'fixture fault'); END");
  expect((await f.send(replace([objective('b', 0), objective('a', 1)]))).statusCode).not.toBe(200);
  expect(await f.snapshot()).toEqual(before);
});
it('requires authentication, CSRF and owned tasks for planning operations', async () => {
  f.db.pragma('ignore_check_constraints = ON');
  try { f.db.prepare('INSERT INTO owners VALUES (?,?,?,?,?)').run('other', 2, 'fixture-only', NOW, NOW); } finally { f.db.pragma('ignore_check_constraints = OFF'); }
  new Repositories(f.db, 'other').insert('tasks', { id: 'foreign', createdAt: NOW, updatedAt: NOW, title: 'Other', projectId: null, estimatedMinutes: 10, status: 'open', note: '' });
  for (const c of [replace([{ ...objective('a', 0), taskId: 'foreign' }]), block('foreign', 10, 20), { type: 'schedule.removeTaskBlock' as const, taskId: 'foreign' }]) expect((await f.send(c)).statusCode).toBe(404);
  expect((await f.post(f.envelope(replace([])), {})).statusCode).toBe(401);
  expect((await f.post(f.envelope(replace([])), { ...f.auth, 'x-csrf-token': 'wrong' })).statusCode).toBe(403);
});
