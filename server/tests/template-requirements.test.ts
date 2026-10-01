// P02: template nodes carry materials, tools and preparation notes; applying copies them as a snapshot with the template's
// version; editing the template afterwards changes future uses only; old trees without requirements still apply.
import { afterEach, expect, it } from 'vitest';
import { createFixture, type Fixture } from './helpers/fixture.js';
import { runAs, userOf, type Headers } from './helpers/roles.js';
let f: Fixture, clock = 1_790_000_000_000;
afterEach(async () => { await f?.close(); });
async function setup() {
  f = await createFixture({ now: () => clock });
  const owner = await f.authenticate(), worker = await userOf(f, 'worker', owner);
  const client = (await runAs(f, owner, { type: 'client.create', name: 'Smith', phone: '', email: '', note: '' })).json().result.id;
  const project = (await runAs(f, owner, { type: 'project.create', name: 'Smith exterior', clientId: client, clientName: '', address: '', note: '' })).json().result.id;
  return { owner, worker: worker.headers, project };
}
const ok = async (headers: Headers, command: unknown) => { const r = await runAs(f, headers, command); expect(r.statusCode, r.body).toBe(200); return r.json(); };
const wall = { title: 'Prepare wall', description: 'Patch, sand, wipe', requirements: [{ kind: 'material', name: 'Patch compound', quantity: '1', unit: 'tub' }, { kind: 'tool', name: 'Sanding block' }, { kind: 'note', name: 'Cover the floor first', note: 'Drop cloths from the van.' }], children: [{ title: 'Sand', requirements: [{ kind: 'tool', name: 'Sanding block' }] }] };
const requirementsOf = (snapshot: { taskRequirements?: { taskId: string; name: string; kind: string; sourceTemplateVersion: number | null }[] }, taskId: string) => (snapshot.taskRequirements ?? []).filter(r => r.taskId === taskId);
it('applies a template with requirements as a per-task snapshot carrying the template version, and a worker can apply it', async () => {
  const { owner, worker, project } = await setup();
  const templateId = (await ok(owner, { type: 'taskTemplate.saveTree', name: 'Wall prep', tree: [wall] })).result.id as string;
  const applied = await ok(worker, { type: 'taskTemplate.applyTree', templateId, projectId: project, parentTaskId: null });
  const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker })).json();
  const root = applied.result.id as string, rows = requirementsOf(snapshot, root);
  expect(rows.map(r => [r.kind, r.name])).toEqual([['material', 'Patch compound'], ['tool', 'Sanding block'], ['note', 'Cover the floor first']]);
  expect(rows.every(r => r.sourceTemplateVersion === 1)).toBe(true);
  const child = snapshot.tasks.find((t: { parentTaskId: string | null }) => t.parentTaskId === root);
  expect(requirementsOf(snapshot, child.id).map(r => r.name)).toEqual(['Sanding block']);
  expect(snapshot.taskTemplates.find((t: { id: string }) => t.id === templateId).version).toBe(1);
});
it('editing the template bumps its version and leaves tasks already created unchanged; editing a task leaves the template unchanged', async () => {
  const { owner, project } = await setup();
  const templateId = (await ok(owner, { type: 'taskTemplate.saveTree', name: 'Wall prep', tree: [wall] })).result.id as string;
  const root = (await ok(owner, { type: 'taskTemplate.applyTree', templateId, projectId: project, parentTaskId: null })).result.id as string;
  const edited = await ok(owner, { type: 'taskTemplate.updateTree', id: templateId, name: 'Wall prep v2', tree: [{ ...wall, requirements: [{ kind: 'material', name: 'Primer' }] }] });
  expect(edited.changed).toBe(true);
  let snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  expect(snapshot.taskTemplates.find((t: { id: string }) => t.id === templateId)).toMatchObject({ name: 'Wall prep v2', version: 2 });
  expect(requirementsOf(snapshot, root).map(r => r.name)).toEqual(['Patch compound', 'Sanding block', 'Cover the floor first']);
  const unchanged = await ok(owner, { type: 'taskTemplate.updateTree', id: templateId, name: 'Wall prep v2', tree: [{ ...wall, requirements: [{ kind: 'material', name: 'Primer' }] }] });
  expect(unchanged.changed).toBe(false);
  const next = (await ok(owner, { type: 'taskTemplate.applyTree', templateId, projectId: project, parentTaskId: null })).result.id as string;
  snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  expect(requirementsOf(snapshot, next).map(r => [r.name, r.sourceTemplateVersion])).toEqual([['Primer', 2]]);
  await ok(owner, { type: 'task.setRequirements', taskId: root, requirements: [{ kind: 'tool', name: 'Ladder' }] });
  snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  expect(requirementsOf(snapshot, root).map(r => [r.name, r.sourceTemplateVersion])).toEqual([['Ladder', null]]);
  expect(JSON.parse(snapshot.taskTemplates.find((t: { id: string }) => t.id === templateId).tree)[0].requirements.map((r: { name: string }) => r.name)).toEqual(['Primer']);
});
it('applies an old tree without requirements, keeps descriptions, and replays an identical apply once', async () => {
  const { owner, project } = await setup();
  const templateId = (await ok(owner, { type: 'taskTemplate.saveTree', name: 'Plain', tree: [{ title: 'Wash', description: 'Pressure wash' }] })).result.id as string;
  const snap = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  const envelope = { requestId: '00000000-0000-4000-a000-00000000ab01', baseRevision: snap.revision, command: { type: 'taskTemplate.applyTree', templateId, projectId: project, parentTaskId: null } };
  const first = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: owner, payload: envelope });
  const replay = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: owner, payload: envelope });
  expect(first.statusCode).toBe(200); expect(replay.statusCode).toBe(200);
  expect(replay.json().result.id).toBe(first.json().result.id);
  const after = (await f.app.inject({ url: '/api/v1/snapshot', headers: owner })).json();
  expect(after.tasks.filter((t: { title: string }) => t.title === 'Wash')).toHaveLength(1);
  expect(after.tasks.find((t: { title: string }) => t.title === 'Wash').description).toBe('Pressure wash');
  expect(after.taskRequirements).toEqual([]);
});
it('rejects a requirement that references a material or tool that does not exist, and a worker cannot edit a completed task\'s needs', async () => {
  const { owner, worker, project } = await setup();
  const taskId = (await ok(owner, { type: 'task.create', title: 'Prime', projectId: project, parentTaskId: null, estimatedMinutes: 0, note: '' })).result.id as string;
  const bad = await runAs(f, owner, { type: 'task.setRequirements', taskId, requirements: [{ kind: 'material', name: 'Primer', materialId: 'missing' }] });
  expect(bad.statusCode).toBe(400);
  await ok(owner, { type: 'task.setRequirements', taskId, requirements: [{ kind: 'material', name: 'Primer' }] });
  await ok(owner, { type: 'task.setStatus', id: taskId, status: 'done', expectedSessionId: null });
  clock += 11 * 60 * 1000;
  const locked = await runAs(f, worker, { type: 'task.setRequirements', taskId, requirements: [] });
  expect(locked.statusCode).toBe(403);
});
