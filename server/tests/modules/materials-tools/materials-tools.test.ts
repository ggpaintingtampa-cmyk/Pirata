import { afterEach, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../helpers/fixture.js';
import { runAs, userOf } from '../../helpers/roles.js';
let f: Fixture;
const NOW = 1_790_000_000_000;
afterEach(async () => { await f?.close(); });
async function setup() {
  f = await createFixture({ now: () => NOW });
  const owner = await f.authenticate();
  const worker = await userOf(f, 'worker', owner), other = await userOf(f, 'worker', owner), manager = await userOf(f, 'manager', owner);
  const client = (await runAs(f, owner, { type: 'client.create', name: 'Smith', phone: '', email: '', note: '' })).json().result.id;
  const project = (await runAs(f, owner, { type: 'project.create', name: 'Smith exterior', clientId: client, clientName: '', address: '', note: '' })).json().result.id;
  const task = (await runAs(f, owner, { type: 'task.create', title: 'Prime', projectId: project, estimatedMinutes: 0, note: '' })).json().result.id;
  const sprayer = (await runAs(f, owner, { type: 'equipment.create', name: 'Sprayer', note: '' })).json().result.id;
  return { owner, worker, other, manager, project, task, sprayer };
}
it('ties material requests to a project, task or person and lets the requester or office mark them received', async () => {
  const { owner, worker, other, manager, project, task } = await setup();
  expect((await runAs(f, worker.headers, { type: 'materialRequest.create', title: 'Primer', quantity: '2 gal' })).statusCode).toBe(400);
  const byTask = await runAs(f, worker.headers, { type: 'materialRequest.create', title: 'Primer', quantity: '2 gal', note: 'Oil-based', taskId: task });
  expect(byTask.statusCode, byTask.body).toBe(200);
  const id = byTask.json().result.id;
  expect(f.repo.require('shopping_items', id)).toMatchObject({ projectId: project, taskId: task, createdBy: worker.id, quantity: '2 gal', receivedAt: null });
  expect((await runAs(f, worker.headers, { type: 'materialRequest.create', title: 'Gloves', forUserId: worker.id })).statusCode).toBe(200);
  // another worker cannot change it; the requester and the office can
  expect((await runAs(f, other.headers, { type: 'materialRequest.setReceived', id, received: true })).statusCode).toBe(403);
  expect((await runAs(f, other.headers, { type: 'materialRequest.update', id, title: 'Primer', quantity: '3 gal', note: '' })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'materialRequest.update', id, title: 'Primer', quantity: '3 gal', note: 'Oil-based' })).statusCode).toBe(200);
  expect((await runAs(f, manager.headers, { type: 'materialRequest.setReceived', id, received: true })).statusCode).toBe(200);
  expect(f.repo.require('shopping_items', id)).toMatchObject({ receivedBy: manager.id, quantity: '3 gal' });
  expect(f.repo.require('shopping_items', id).checkedAt).toBe(NOW);
  // the old shopping commands still work for the assistant and mirror the received state
  const legacy = (await runAs(f, owner, { type: 'shopping.add', title: 'Tape', note: '', projectId: project, sourceNoteId: null })).json().result.id;
  expect((await runAs(f, owner, { type: 'shopping.check', id: legacy, checked: true })).statusCode).toBe(200);
  expect(f.repo.require('shopping_items', legacy).receivedBy).toBe(f.ownerId);
  expect((await runAs(f, worker.headers, { type: 'materialRequest.remove', id })).statusCode).toBe(200);
  expect(f.repo.require('shopping_items', id).archivedAt).toBe(NOW);
  expect((await runAs(f, worker.headers, { type: 'materialRequest.setReceived', id, received: false })).statusCode).toBe(400);
});
it('signs tools out one holder at a time, opens per-person cleaning reminders, and tracks broken reports', async () => {
  const { owner, worker, other, manager, project, sprayer } = await setup();
  expect((await runAs(f, worker.headers, { type: 'equipment.setSignOutRequired', id: sprayer, required: true })).statusCode).toBe(403);
  expect((await runAs(f, manager.headers, { type: 'equipment.setSignOutRequired', id: sprayer, required: true })).statusCode).toBe(200);
  expect((await runAs(f, owner, { type: 'equipment.cleanupRule', id: sprayer, cleaningMinutes: 30, maxCleaningDelayMinutes: 3 * 24 * 60 })).statusCode).toBe(200);
  const out = await runAs(f, worker.headers, { type: 'tool.signOut', equipmentId: sprayer, projectId: project, note: 'Truck 2' });
  expect(out.statusCode, out.body).toBe(200);
  const outId = out.json().result.id;
  expect(f.repo.require('tool_sign_outs', outId)).toMatchObject({ takenBy: worker.id, projectId: project, returnedAt: null });
  // a three-day rule is due by the end of the workday before the deadline, and belongs to the taker
  const reminder = f.repo.list('cleanup_obligations').find(item => item.equipmentId === sprayer && item.userId === worker.id)!;
  expect(reminder.deadlineAt).toBe(NOW + 3 * 24 * 60 * 60 * 1000); expect(reminder.dueAt).toBeLessThan(reminder.deadlineAt); expect(reminder.dueAt).toBeGreaterThan(NOW + 2 * 24 * 60 * 60 * 1000);
  // nobody else can take it until it is returned; a second use by another person gets their own reminder
  expect((await runAs(f, other.headers, { type: 'tool.signOut', equipmentId: sprayer })).statusCode).toBe(409);
  expect((await runAs(f, other.headers, { type: 'equipment.use', id: sprayer, taskId: null })).statusCode).toBe(200);
  expect(f.repo.list('cleanup_obligations').filter(item => item.equipmentId === sprayer && item.completedAt === null)).toHaveLength(2);
  expect((await runAs(f, other.headers, { type: 'tool.return', id: outId })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'tool.return', id: outId })).statusCode).toBe(200);
  expect(f.repo.require('tool_sign_outs', outId).returnedBy).toBe(worker.id);
  expect((await runAs(f, other.headers, { type: 'tool.signOut', equipmentId: sprayer })).statusCode).toBe(200);
  // cleaning stamps who cleaned
  expect((await runAs(f, worker.headers, { type: 'cleanup.complete', id: reminder.id })).statusCode).toBe(200);
  expect(f.repo.require('cleanup_obligations', reminder.id).completedBy).toBe(worker.id);
  // broken reports flip the tool status until every report is resolved (office only)
  const report = await runAs(f, worker.headers, { type: 'equipment.reportBroken', id: sprayer, body: 'Pump leaks' });
  expect(report.statusCode, report.body).toBe(200);
  expect(f.repo.require('equipment', sprayer).status).toBe('broken');
  expect((await runAs(f, worker.headers, { type: 'equipment.resolveReport', id: report.json().result.id })).statusCode).toBe(403);
  expect((await runAs(f, manager.headers, { type: 'equipment.resolveReport', id: report.json().result.id })).statusCode).toBe(200);
  expect(f.repo.require('equipment', sprayer).status).toBe('ok');
  const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json();
  expect(snapshot.toolSignOuts).toHaveLength(2); expect(snapshot.equipmentReports).toHaveLength(1); expect(snapshot.equipment[0].requiresSignOut).toBe(1);
});
