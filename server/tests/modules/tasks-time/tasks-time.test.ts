import { afterEach, beforeEach, expect, it } from 'vitest';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';
import { createApp } from '../../../src/app.js';
import { openDatabase } from '../../../src/db/database.js';
import { Repositories } from '../../../src/core/repositories.js';
import { TEST_ORIGIN } from '../../helpers/fixture.js';
import { NOW, setup, type TestApp } from './support.js';
let f: TestApp;
beforeEach(async () => { f = await setup(); });
afterEach(async () => { await f.close(); });
it('creates and edits in place, trims fields, preserves schedule and creation order', async () => {
  const id = (await f.save({ type: 'task.create', title: '  Prep  ', projectId: null, estimatedMinutes: 60, note: '', schedule: { date: '2026-09-17', startMinute: 540, endMinute: 600, allowOverlap: false } })).result.id!;
  expect((await f.snapshot()).capabilities['tasks-time']).toBe('ready');
  const old = f.repo.require('tasks', id), block = f.repo.list('schedule_blocks')[0];
  f.clock(NOW + 10000);
  const edit = { type: 'task.update' as const, id, title: 'Paint', projectId: null, estimatedMinutes: 90, note: ' Wall ' };
  await f.save(edit); expect((await f.save(edit)).changed).toBe(false);
  expect(f.repo.require('tasks', id)).toMatchObject({ id, createdAt: old.createdAt, title: 'Paint', note: 'Wall' });
  expect(f.repo.list('schedule_blocks')[0]).toEqual(block);
  expect((await f.snapshot()).schedule[0].title).toBe('Paint');
});
it('start pause resume excludes paused time and repeated requests cannot duplicate intervals', async () => {
  const id = await f.task(), a = await f.save({ type: 'timer.start', taskId: id });
  expect((await f.save({ type: 'timer.start', taskId: id })).changed).toBe(false);
  f.clock(NOW + 61500);
  const envelope = f.envelope({ type: 'timer.pause', expectedSessionId: a.result.id! }, (await f.snapshot()).revision);
  const paused = await f.post(envelope);
  expect(paused.statusCode).toBe(200); expect((await f.post(envelope)).json()).toEqual(paused.json());
  expect((await f.send(envelope.command)).statusCode).toBe(409);
  f.clock(NOW + 121500); const b = await f.save({ type: 'timer.start', taskId: id });
  expect((await f.send(envelope.command)).statusCode).toBe(409);
  f.clock(NOW + 152000); await f.save({ type: 'timer.pause', expectedSessionId: b.result.id! });
  const s = await f.snapshot(); expect(s.runningTimer).toBeNull();
  expect(s.timeEntries.map(e => e.id)).toEqual([a.result.id, b.result.id]);
  expect(s.timeEntries.reduce((sum, e) => sum + (e.source === 'timer' ? e.endedAt - e.startedAt : 0), 0)).toBe(92000);
});
it('requires switch confirmation and atomically leaves exactly one active timer', async () => {
  const a = await f.task(), b = await f.task('Paint'), running = await f.save({ type: 'timer.start', taskId: a });
  expect((await f.send({ type: 'timer.start', taskId: b })).statusCode).toBe(409);
  f.clock(NOW + 1000);
  await f.save({ type: 'timer.switch', taskId: b, expectedSessionId: running.result.id! });
  expect(f.repo.getTimer()?.taskId).toBe(b); expect(f.repo.list('time_entries')).toHaveLength(1);
  expect((await f.send({ type: 'timer.switch', taskId: a, expectedSessionId: running.result.id! })).statusCode).toBe(409);
});
it('finish and block close only their task; reopen preserves all history and plan', async () => {
  const a = await f.task(), b = await f.task('Other');
  await f.save({ type: 'schedule.setTaskBlock', taskId: a, block: { date: '2026-09-17', startMinute: 100, endMinute: 200, allowOverlap: false } });
  for (const status of ['done', 'blocked'] as const) {
    const timer = await f.save({ type: 'timer.start', taskId: a });
    f.clock(NOW + (status === 'done' ? 1000 : 2000));
    await f.save({ type: 'task.setStatus', id: b, status, expectedSessionId: null });
    expect(f.repo.getTimer()?.taskId).toBe(a);
    expect((await f.send({ type: 'task.setStatus', id: a, status, expectedSessionId: null })).statusCode).toBe(409);
    await f.save({ type: 'task.setStatus', id: a, status, expectedSessionId: timer.result.id! });
    expect((await f.send({ type: 'timer.start', taskId: a })).statusCode).toBe(409);
    await f.save({ type: 'task.setStatus', id: a, status: 'open', expectedSessionId: null });
  }
  expect(f.repo.list('time_entries')).toHaveLength(2); expect(f.repo.list('schedule_blocks')).toHaveLength(1);
});
it('zero sessions save no entry; backward clock requires correction or discard', async () => {
  const id = await f.task(), zero = await f.save({ type: 'timer.start', taskId: id });
  await f.save({ type: 'timer.pause', expectedSessionId: zero.result.id! }); expect(f.repo.list('time_entries')).toEqual([]);
  const active = await f.save({ type: 'timer.start', taskId: id }); f.clock(NOW - 1000);
  expect((await f.send({ type: 'timer.pause', expectedSessionId: active.result.id! })).json().error.code).toBe('CLOCK_CONFLICT');
  expect(f.repo.getTimer()?.sessionId).toBe(active.result.id);
  expect((await f.send({ type: 'timer.correctStart', expectedSessionId: active.result.id!, startedAt: NOW })).statusCode).toBe(400);
  await f.save({ type: 'timer.correctStart', expectedSessionId: active.result.id!, startedAt: NOW - 2000 });
  await f.save({ type: 'timer.pause', expectedSessionId: active.result.id! });
  const discard = await f.save({ type: 'timer.start', taskId: id });
  await f.save({ type: 'timer.discard', expectedSessionId: discard.result.id! });
  expect(f.repo.list('time_entries')).toHaveLength(1);
});
it('retains exact cross-midnight timestamps and reconstructs active session after restart', async () => {
  const id = await f.task(), timer = await f.save({ type: 'timer.start', taskId: id });
  await f.app.close(); f.db.close();
  const db = openDatabase(f.path), app = createApp({ db, origin: TEST_ORIGIN, now: () => NOW + 90000 });
  try {
    const s = (await app.inject({ url: '/api/v1/snapshot', headers: f.auth })).json<BusinessSnapshot>();
    expect(s.runningTimer).toEqual({ taskId: id, sessionId: timer.result.id, startedAt: NOW });
    const r = await app.inject({ method: 'POST', url: '/api/v1/commands', headers: f.auth, payload: f.envelope({ type: 'timer.pause', expectedSessionId: timer.result.id! }, s.revision) });
    expect(r.statusCode).toBe(200);
    const entry = new Repositories(db, f.ownerId).list('time_entries')[0];
    expect(entry).toMatchObject({ startedAt: NOW, endedAt: NOW + 90000 });
  } finally { await app.close(); db.close(); }
});
it('manual and timer corrections preserve identity, task, creation time and source', async () => {
  const taskId = await f.task(), manual = await f.save({ type: 'timeEntry.createManual', taskId, date: '2026-09-17', minutes: 20, note: '' });
  const id = manual.result.id!;
  await f.save({ type: 'timeEntry.correct', id, correction: { source: 'manual', date: '2026-09-16', minutes: 30, note: 'Forgot cleanup' } });
  expect(f.repo.require('time_entries', id)).toMatchObject({ id, taskId, createdAt: NOW, source: 'manual', durationSeconds: 1800 });
  expect((await f.send({ type: 'timeEntry.correct', id, correction: { source: 'timer', startedAt: NOW - 1000, endedAt: NOW, note: '' } })).statusCode).toBe(400);
  const timer = await f.save({ type: 'timer.start', taskId }); f.clock(NOW + 1000);
  await f.save({ type: 'timer.pause', expectedSessionId: timer.result.id! });
  const correction = { type: 'timeEntry.correct' as const, id: timer.result.id!, correction: { source: 'timer' as const, startedAt: NOW - 500, endedAt: NOW + 500, note: 'Corrected' } };
  await f.save(correction); expect((await f.save(correction)).changed).toBe(false);
  expect(f.repo.require('time_entries', timer.result.id!)).toMatchObject({ id: timer.result.id, taskId, source: 'timer', createdAt: NOW + 1000 });
});
it('scheduled task creation rejects length mismatch, midnight crossing and rolls back task on block failure', async () => {
  const command = { type: 'task.create' as const, title: 'Scheduled', projectId: null, estimatedMinutes: 60, note: '', schedule: { date: '2026-09-17', startMinute: 540, endMinute: 600, allowOverlap: false } };
  expect((await f.send({ ...command, schedule: { ...command.schedule, endMinute: 590 } })).statusCode).toBe(400);
  expect((await f.send({ ...command, schedule: { ...command.schedule, startMinute: 1430, endMinute: 1490 } })).statusCode).toBe(400);
  f.db.exec("CREATE TRIGGER fail_block BEFORE INSERT ON schedule_blocks BEGIN SELECT RAISE(ABORT, 'fixture fault'); END");
  expect((await f.send(command)).statusCode).not.toBe(200);
  expect(f.repo.list('tasks')).toEqual([]); expect((await f.snapshot()).revision).toBe(0);
});
it('interval or receipt failures roll back pause without losing active saved state', async () => {
  const taskId = await f.task(), timer = await f.save({ type: 'timer.start', taskId }); f.clock(NOW + 1000);
  for (const table of ['time_entries', 'command_receipts']) {
    f.db.exec(`CREATE TRIGGER fail_close BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture fault'); END`);
    const before = await f.snapshot();
    expect((await f.send({ type: 'timer.pause', expectedSessionId: timer.result.id! })).statusCode).not.toBe(200);
    expect(await f.snapshot()).toEqual(before); f.db.exec('DROP TRIGGER fail_close');
  }
});
it('rejects invalid tasks, manual intervals, unauthenticated and CSRF writes', async () => {
  const taskId = await f.task();
  const commands: BusinessCommand[] = [
    { type: 'task.update', id: taskId, title: ' ', estimatedMinutes: 1, projectId: null, note: '' },
    { type: 'timeEntry.createManual', taskId, date: '2026-02-30', minutes: 1, note: '' },
    { type: 'timeEntry.createManual', taskId, date: '2026-09-17', minutes: 1.5, note: '' },
  ];
  for (const c of commands) expect((await f.send(c)).statusCode).toBe(400);
  const request = f.envelope({ type: 'timer.start', taskId }, (await f.snapshot()).revision);
  expect((await f.post(request, {})).statusCode).toBe(401);
  expect((await f.post(request, { ...f.auth, 'x-csrf-token': 'wrong' })).statusCode).toBe(403);
  expect(f.repo.getTimer()).toBeNull();
});
it('rejects other-owner task/project/entry references', async () => {
  f.db.pragma('ignore_check_constraints = ON');
  try { f.db.prepare('INSERT INTO owners VALUES (?,?,?,?,?)').run('other', 2, 'fixture-only', NOW, NOW); } finally { f.db.pragma('ignore_check_constraints = OFF'); }
  const repo = new Repositories(f.db, 'other'), base = { createdAt: NOW, updatedAt: NOW };
  repo.insert('projects', { ...base, id: 'foreign-project', name: 'Other', clientId: null, clientName: '', address: '', note: '', status: 'scheduled' });
  repo.insert('tasks', { ...base, id: 'foreign-task', title: 'Other', projectId: null, estimatedMinutes: 10, status: 'open', note: '' });
  repo.insert('time_entries', { ...base, id: 'foreign-entry', taskId: 'foreign-task', source: 'manual', date: '2026-09-17', durationSeconds: 60, note: '' });
  const commands: BusinessCommand[] = [
    { type: 'task.create', title: 'Own', projectId: 'foreign-project', estimatedMinutes: 10, note: '' },
    { type: 'timer.start', taskId: 'foreign-task' },
    { type: 'timeEntry.createManual', taskId: 'foreign-task', date: '2026-09-17', minutes: 10, note: '' },
    { type: 'timeEntry.correct', id: 'foreign-entry', correction: { source: 'manual', date: '2026-09-17', minutes: 20, note: '' } },
  ];
  for (const c of commands) expect((await f.send(c)).statusCode).toBe(404);
  expect((await f.snapshot()).tasks).toEqual([]);
});
it('two authenticated sessions racing start/switch/pause produce conflicts instead of lost updates', async () => {
  const auth2 = await f.authenticate(), a = await f.task(), b = await f.task('Second');
  let revision = (await f.snapshot()).revision;
  const starts = await Promise.all([f.post(f.envelope({ type: 'timer.start', taskId: a }, revision)), f.post(f.envelope({ type: 'timer.start', taskId: b }, revision), auth2)]);
  expect(starts.map(r => r.statusCode).sort()).toEqual([200, 409]);
  const timer = f.repo.getTimer()!; f.clock(NOW + 1000); revision = (await f.snapshot()).revision;
  const changes = await Promise.all([f.post(f.envelope({ type: 'timer.switch', taskId: timer.taskId === a ? b : a, expectedSessionId: timer.sessionId }, revision)), f.post(f.envelope({ type: 'timer.pause', expectedSessionId: timer.sessionId }, revision), auth2)]);
  expect(changes.map(r => r.statusCode).sort()).toEqual([200, 409]);
  expect(f.repo.list('time_entries')).toHaveLength(1);
  expect((await f.send({ type: 'timer.pause', expectedSessionId: timer.sessionId })).statusCode).toBe(409);
});
