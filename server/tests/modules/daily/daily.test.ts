import { afterEach, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../helpers/fixture.js';
import { runAs, userOf, type Headers } from '../../helpers/roles.js';
let f: Fixture, clock = 1_790_000_000_000;
afterEach(async () => { await f?.close(); });
async function setup() {
  clock = 1_790_000_000_000;
  f = await createFixture({ now: () => clock });
  const owner = await f.authenticate();
  const worker = await userOf(f, 'worker', owner), manager = await userOf(f, 'manager', owner);
  const client = (await runAs(f, owner, { type: 'client.create', name: 'Smith', phone: '', email: '', note: '' })).json().result.id;
  const project = (await runAs(f, owner, { type: 'project.create', name: 'Smith exterior', clientId: client, clientName: '', address: '', note: '' })).json().result.id;
  return { owner, worker, manager, project };
}
async function create(headers: Headers, title: string, projectId: string, parentTaskId: string | null = null) {
  const response = await runAs(f, headers, { type: 'task.create', title, projectId, parentTaskId, estimatedMinutes: 0, note: '' });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().result.id as string;
}
it('nests three levels, orders siblings and rejects a fourth level', async () => {
  const { owner, project } = await setup();
  const root = await create(owner, 'Paint room', project), sub = await create(owner, 'Prep', project, root), tiny = await create(owner, 'Tape', project, sub);
  expect((await runAs(f, owner, { type: 'task.create', title: 'Too deep', projectId: project, parentTaskId: tiny, estimatedMinutes: 0, note: '' })).statusCode).toBe(400);
  const second = await create(owner, 'Sand', project, root);
  expect(f.repo.require('tasks', second).position).toBe(1);
  expect((await runAs(f, owner, { type: 'task.reorder', projectId: project, parentTaskId: root, orderedIds: [second, sub] })).statusCode).toBe(200);
  expect(f.repo.require('tasks', second).position).toBe(0); expect(f.repo.require('tasks', sub).position).toBe(1);
  expect((await runAs(f, owner, { type: 'task.reorder', projectId: project, parentTaskId: null, orderedIds: [sub] })).statusCode).toBe(400);
  // moving a subtask that has a tiny task under a tiny task would exceed three levels
  expect((await runAs(f, owner, { type: 'task.update', id: sub, title: 'Prep', projectId: project, estimatedMinutes: 0, note: '', parentTaskId: tiny })).statusCode).toBe(400);
});
it('stamps who completed what, cascades through tiny tasks and honours the undo window', async () => {
  const { owner, worker, project } = await setup();
  const root = await create(owner, 'Paint room', project), sub = await create(owner, 'Prep', project, root), tiny = await create(owner, 'Tape', project, sub), other = await create(owner, 'Cover desk', project, sub);
  expect((await runAs(f, worker.headers, { type: 'task.setStatus', id: root, status: 'done', expectedSessionId: null })).statusCode).toBe(200);
  for (const id of [root, sub, tiny, other]) { const task = f.repo.require('tasks', id); expect(task.status).toBe('done'); expect(task.completedBy).toBe(worker.id); expect(task.completedAt).toBe(clock); }
  // the worker who completed it may undo within ten minutes
  clock += 5 * 60 * 1000;
  expect((await runAs(f, worker.headers, { type: 'task.setStatus', id: tiny, status: 'open', expectedSessionId: null })).statusCode).toBe(200);
  expect(f.repo.require('tasks', tiny).completedAt).toBeNull(); expect(f.repo.require('tasks', sub).status).toBe('open'); expect(f.repo.require('tasks', sub).completedBy).toBeNull();
  expect(f.repo.require('tasks', other).status).toBe('done');
  // after the window only an owner may reopen or edit
  clock += 20 * 60 * 1000;
  expect((await runAs(f, worker.headers, { type: 'task.setStatus', id: other, status: 'open', expectedSessionId: null })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'task.update', id: other, title: 'Cover desk with plastic', projectId: project, estimatedMinutes: 0, note: '' })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'task.archive', id: other, archived: true })).statusCode).toBe(403);
  expect((await runAs(f, owner, { type: 'task.setStatus', id: other, status: 'open', expectedSessionId: null })).statusCode).toBe(200);
  // completing the leaves again auto-completes the parents with the completer stamped
  expect((await runAs(f, worker.headers, { type: 'task.setStatus', id: tiny, status: 'done', expectedSessionId: null })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { type: 'task.setStatus', id: other, status: 'done', expectedSessionId: null })).statusCode).toBe(200);
  expect(f.repo.require('tasks', sub).status).toBe('done'); expect(f.repo.require('tasks', sub).completedBy).toBe(worker.id);
});
it('plans a person or a project pool, lets a worker take pool work and guards other people’s lists', async () => {
  const { owner, worker, manager, project } = await setup();
  const a = await create(owner, 'Wash', project), b = await create(owner, 'Prime', project), c = await create(owner, 'Paint', project);
  // a worker cannot plan someone else's day, a manager can
  expect((await runAs(f, worker.headers, { type: 'dayList.replace', date: '2026-09-26', scope: { kind: 'person', userId: manager.id }, taskIds: [a] })).statusCode).toBe(403);
  expect((await runAs(f, manager.headers, { type: 'dayList.replace', date: '2026-09-26', scope: { kind: 'person', userId: worker.id }, taskIds: [b, a] })).statusCode).toBe(200);
  const rows = f.repo.list('day_assignments').filter(r => r.date === '2026-09-26' && r.userId === worker.id).sort((x, y) => x.position - y.position);
  expect(rows.map(r => r.taskId)).toEqual([b, a]);
  expect(f.repo.require('tasks', a).assigneeId).toBe(worker.id); expect(f.repo.require('tasks', a).assignmentExplicit).toBe(1);
  // replacing keeps ids of retained rows and drops the rest
  expect((await runAs(f, manager.headers, { type: 'dayList.replace', date: '2026-09-26', scope: { kind: 'person', userId: worker.id }, taskIds: [a] })).statusCode).toBe(200);
  expect(f.repo.list('day_assignments').filter(r => r.userId === worker.id).map(r => r.id)).toEqual([rows[1].id]);
  // a worker plans their own day and a project pool anybody can fill
  expect((await runAs(f, worker.headers, { type: 'dayList.replace', date: '2026-09-26', scope: { kind: 'person', userId: worker.id }, taskIds: [a, b] })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { type: 'dayList.replace', date: '2026-09-26', scope: { kind: 'project', projectId: project }, taskIds: [c] })).statusCode).toBe(200);
  const pool = f.repo.list('day_assignments').find(r => r.taskId === c && r.userId === null)!;
  expect((await runAs(f, worker.headers, { type: 'dayList.take', id: pool.id })).statusCode).toBe(200);
  expect(f.repo.require('day_assignments', pool.id).userId).toBe(worker.id); expect(f.repo.require('tasks', c).assigneeId).toBe(worker.id);
  expect((await runAs(f, manager.headers, { type: 'dayList.release', id: pool.id })).statusCode).toBe(200);
  expect(f.repo.require('day_assignments', pool.id).userId).toBeNull();
  // presence rows need plan.others
  expect((await runAs(f, worker.headers, { type: 'dayList.setPresence', date: '2026-09-26', projectId: project, userIds: [worker.id] })).statusCode).toBe(403);
  expect((await runAs(f, manager.headers, { type: 'dayList.setPresence', date: '2026-09-26', projectId: project, userIds: [worker.id, manager.id] })).statusCode).toBe(200);
  expect(f.repo.list('day_assignments').filter(r => r.taskId === null).map(r => r.userId).sort()).toEqual([manager.id, worker.id].sort());
  // archiving removes the task from every day list
  expect((await runAs(f, owner, { type: 'task.archive', id: a, archived: true })).statusCode).toBe(200);
  expect(f.repo.list('day_assignments').some(r => r.taskId === a)).toBe(false);
  // workers see day lists in the snapshot
  const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json();
  expect(snapshot.dayAssignments.length).toBeGreaterThan(0);
});
it('catalogues questions on a step and lets the office answer', async () => {
  const { worker, manager, project } = await setup();
  const task = await create(worker.headers, 'Prime trim', project);
  const asked = await runAs(f, worker.headers, { type: 'question.ask', taskId: task, body: 'Which primer for the cedar trim?' });
  expect(asked.statusCode).toBe(200);
  const id = asked.json().result.id;
  expect(f.repo.require('task_questions', id).projectId).toBe(project);
  expect((await runAs(f, worker.headers, { type: 'question.answer', id, answer: 'Oil-based.' })).statusCode).toBe(403);
  expect((await runAs(f, manager.headers, { type: 'question.answer', id, answer: 'Oil-based.' })).statusCode).toBe(200);
  expect(f.repo.require('task_questions', id).answeredBy).toBe(manager.id);
});
it('applies nested templates within three levels and saves a project as a template', async () => {
  const { owner, manager, worker, project } = await setup();
  const tree = [{ title: 'Move furniture', children: [{ title: 'Cover desk', children: [{ title: 'Use delicate tape' }] }] }, { title: 'Prep floors' }];
  expect((await runAs(f, worker.headers, { type: 'taskTemplate.saveTree', name: 'Room', tree })).statusCode).toBe(403);
  const saved = await runAs(f, manager.headers, { type: 'taskTemplate.saveTree', name: 'Room', tree });
  expect(saved.statusCode, saved.body).toBe(200);
  const templateId = saved.json().result.id;
  const applied = await runAs(f, owner, { type: 'taskTemplate.applyTree', templateId, projectId: project, parentTaskId: null });
  expect(applied.statusCode, applied.body).toBe(200);
  const tasks = f.repo.list('tasks').filter(t => t.projectId === project);
  expect(tasks).toHaveLength(4);
  const tape = tasks.find(t => t.title === 'Use delicate tape')!;
  expect(f.repo.require('tasks', tape.parentTaskId!).title).toBe('Cover desk');
  // the same template cannot hang under a subtask (would reach four levels)
  const desk = tasks.find(t => t.title === 'Cover desk')!;
  expect((await runAs(f, owner, { type: 'taskTemplate.applyTree', templateId, projectId: project, parentTaskId: desk.id })).statusCode).toBe(400);
  const fromProject = await runAs(f, manager.headers, { type: 'projectTemplate.fromProject', projectId: project, name: 'Room sprayer' });
  expect(fromProject.statusCode, fromProject.body).toBe(200);
  const projectTemplate = f.repo.require('project_templates', fromProject.json().result.id);
  expect(JSON.parse(projectTemplate.tree)[0].children[0].children[0].title).toBe('Use delicate tape');
  const client2 = (await runAs(f, owner, { type: 'client.create', name: 'Jones', phone: '', email: '', note: '' })).json().result.id;
  const project2 = (await runAs(f, owner, { type: 'project.create', name: 'Jones room', clientId: client2, clientName: '', address: '', note: '' })).json().result.id;
  expect((await runAs(f, owner, { type: 'projectTemplate.apply', templateId: projectTemplate.id, projectId: project2 })).statusCode).toBe(200);
  expect(f.repo.list('tasks').filter(t => t.projectId === project2)).toHaveLength(4);
});
