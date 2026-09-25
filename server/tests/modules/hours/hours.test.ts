import { afterEach, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../helpers/fixture.js';
import { runAs, userOf } from '../../helpers/roles.js';
import { businessDate } from '@pirata/domain/lib/dates';
const today = businessDate(1_790_000_000_000);
let f: Fixture;
afterEach(async () => { await f?.close(); });
async function setup() {
  f = await createFixture({ now: () => 1_790_000_000_000 });
  const owner = await f.authenticate();
  const worker = await userOf(f, 'worker', owner), manager = await userOf(f, 'manager', owner);
  const client = (await runAs(f, owner, { type: 'client.create', name: 'Smith', phone: '', email: '', note: '' })).json().result.id;
  const project = (await runAs(f, owner, { type: 'project.create', name: 'Smith exterior', clientId: client, clientName: '', address: '', note: '' })).json().result.id;
  return { owner, worker, manager, project };
}
const hours = (projectId: string, date = '2026-09-25') => ({ projectId, date, kind: 'hours' as const, startMinute: 480, endMinute: 990, breakMinutes: 30, daysMinor: null, note: '' });
it('workers submit, managers approve or reject, owners see labor cost and pay is owner-only', async () => {
  const { owner, worker, manager, project } = await setup();
  const submitted = await runAs(f, worker.headers, { type: 'shift.submit', ...hours(project) });
  expect(submitted.statusCode, submitted.body).toBe(200);
  const id = submitted.json().result.id;
  const row = f.repo.require('work_shifts', id);
  expect(row).toMatchObject({ userId: worker.id, status: 'submitted', minutes: 480, submittedBy: worker.id });
  // mixed kinds and impossible spans are rejected; days are whole units
  expect((await runAs(f, worker.headers, { type: 'shift.submit', ...hours(project), daysMinor: 100 })).statusCode).toBe(400);
  expect((await runAs(f, worker.headers, { type: 'shift.submit', ...hours(project), endMinute: 500 })).statusCode).toBe(400);
  expect((await runAs(f, worker.headers, { type: 'shift.submit', projectId: project, date: '2026-09-26', kind: 'day', startMinute: null, endMinute: null, breakMinutes: 0, daysMinor: 50, note: 'half day' })).statusCode).toBe(200);
  // a worker cannot enter for others, approve, or edit someone else's entry
  expect((await runAs(f, worker.headers, { type: 'shift.enter', userId: manager.id, ...hours(project) })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'shift.approve', id })).statusCode).toBe(403);
  // the worker edits their own submitted entry; after approval they cannot
  expect((await runAs(f, worker.headers, { type: 'shift.update', id, ...hours(project), breakMinutes: 60 })).statusCode).toBe(200);
  expect(f.repo.require('work_shifts', id).minutes).toBe(450);
  expect((await runAs(f, manager.headers, { type: 'shift.approve', id })).statusCode).toBe(200);
  expect(f.repo.require('work_shifts', id)).toMatchObject({ status: 'approved', approvedBy: manager.id });
  expect((await runAs(f, worker.headers, { type: 'shift.update', id, ...hours(project), breakMinutes: 0 })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'shift.remove', id })).statusCode).toBe(403);
  // a manager enters hours for a worker (approved at once) and rejects with a note
  const entered = await runAs(f, manager.headers, { type: 'shift.enter', userId: worker.id, ...hours(project, '2026-09-24') });
  expect(entered.statusCode, entered.body).toBe(200);
  expect(f.repo.require('work_shifts', entered.json().result.id).status).toBe('approved');
  expect((await runAs(f, manager.headers, { type: 'shift.reject', id: entered.json().result.id, note: 'Wrong project' })).statusCode).toBe(200);
  expect(f.repo.require('work_shifts', entered.json().result.id)).toMatchObject({ status: 'rejected', decisionNote: 'Wrong project' });
  // pay rates: owner only, upsert on the same effective date
  expect((await runAs(f, manager.headers, { type: 'payRate.set', userId: worker.id, kind: 'hourly', amountCents: 2000, effectiveFrom: '2026-01-01' })).statusCode).toBe(403);
  expect((await runAs(f, owner, { type: 'payRate.set', userId: worker.id, kind: 'hourly', amountCents: 2000, effectiveFrom: '2026-01-01' })).statusCode).toBe(200);
  expect((await runAs(f, owner, { type: 'payRate.set', userId: worker.id, kind: 'hourly', amountCents: 2500, effectiveFrom: '2026-01-01' })).statusCode).toBe(200);
  expect(f.repo.list('pay_rates')).toHaveLength(1);
  expect(f.repo.list('pay_rates')[0].amountCents).toBe(2500);
  // snapshots: worker sees own shifts only and no rates; manager sees all shifts, no rates; owner sees rates
  const workerView = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json();
  expect(workerView.workShifts.every((shift: { userId: string }) => shift.userId === worker.id)).toBe(true);
  expect(workerView.payRates).toEqual([]);
  const managerView = (await f.app.inject({ url: '/api/v1/snapshot', headers: manager.headers })).json();
  expect(managerView.workShifts.length).toBe(3); expect(managerView.payRates).toEqual([]);
  expect((await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json().payRates).toHaveLength(1);
  // day notes are per person and date
  expect((await runAs(f, worker.headers, { type: 'dayNote.save', date: '2026-09-25', body: 'Finished the north wall.' })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { type: 'dayNote.save', date: '2026-09-25', body: 'Finished the north wall, primed the trim.' })).statusCode).toBe(200);
  expect(f.repo.list('day_notes')).toHaveLength(1);
});
it('exports shifts and the daily report as CSV with role-filtered columns', async () => {
  const { owner, worker, manager, project } = await setup();
  const id = (await runAs(f, worker.headers, { type: 'shift.submit', ...hours(project) })).json().result.id;
  await runAs(f, manager.headers, { type: 'shift.approve', id });
  await runAs(f, owner, { type: 'payRate.set', userId: worker.id, kind: 'hourly', amountCents: 2000, effectiveFrom: '2026-01-01' });
  const task = (await runAs(f, worker.headers, { type: 'task.create', title: 'Prime trim', projectId: project, estimatedMinutes: 0, note: '' })).json().result.id;
  await runAs(f, worker.headers, { type: 'task.setStatus', id: task, status: 'done', expectedSessionId: null });
  await runAs(f, worker.headers, { type: 'dayNote.save', date: today, body: 'All good' });
  const ownerCsv = await f.app.inject({ url: '/api/v1/export/shifts.csv?from=2026-09-01&to=2026-09-30', headers: owner });
  expect(ownerCsv.statusCode).toBe(200);
  expect(ownerCsv.headers['content-disposition']).toContain('pirata-hours-2026-09-01-2026-09-30.csv');
  expect(ownerCsv.body.startsWith('﻿')).toBe(true);
  expect(ownerCsv.body).toContain('rate_kind,rate,cost');
  expect(ownerCsv.body).toContain(',hourly,20.00,160.00');
  const workerCsv = await f.app.inject({ url: '/api/v1/export/shifts.csv', headers: worker.headers });
  expect(workerCsv.body).not.toContain('rate_kind');
  expect(workerCsv.body.split('\r\n').filter(Boolean)).toHaveLength(2);
  expect((await f.app.inject({ url: '/api/v1/export/shifts.csv?from=nonsense', headers: owner })).statusCode).toBe(400);
  const report = await f.app.inject({ url: '/api/v1/export/daily-report.csv?date=' + today, headers: owner });
  expect(report.statusCode).toBe(200);
  expect(report.body).toContain('task_completed,Smith exterior,Worker,Prime trim');
  expect(report.body).toContain('end_of_day_note,,Worker,All good');
  const managerReport = await f.app.inject({ url: '/api/v1/export/daily-report.csv?date=2026-09-25', headers: manager.headers });
  expect(managerReport.body).toContain('hours,Smith exterior,Worker,08:00-16:30,480,approved');
  expect(managerReport.body).not.toContain('labor_cost');
  expect((await f.app.inject({ url: '/api/v1/export/daily-report.csv?date=2026-09-25', headers: owner })).body).toContain('labor_cost,Smith exterior,,,480,approved,160.00');
});
