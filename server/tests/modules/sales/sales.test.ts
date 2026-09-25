import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFixture, type Fixture } from '../../helpers/fixture.js';
import { runAs, userOf } from '../../helpers/roles.js';
let f: Fixture;
afterEach(async () => { await f?.close(); });
async function setup() {
  f = await createFixture({ now: () => 1_790_000_000_000 });
  const owner = await f.authenticate();
  const worker = await userOf(f, 'worker', owner), manager = await userOf(f, 'manager', owner), sales = await userOf(f, 'sales', owner);
  const client = (await runAs(f, owner, { type: 'client.create', name: 'Smith', phone: '813-555-0100', email: '', note: '' })).json().result.id;
  return { owner, worker, manager, sales, client };
}
const project = (clientId: string, extra: Record<string, unknown> = {}) => ({ type: 'project.create', name: 'Deck', clientId, clientName: '', address: '12 Bay St', note: '', ...extra });
it('runs the lifecycle: a rep drafts, sends to review, a manager approves or sends back; the office creates scheduled projects', async () => {
  const { owner, worker, manager, sales, client } = await setup();
  const created = await runAs(f, sales.headers, project(client, { salesPriceCents: 250000 }));
  expect(created.statusCode, created.body).toBe(200);
  const id = created.json().result.id;
  expect(f.repo.require('projects', id)).toMatchObject({ status: 'draft', salesRepId: sales.id, salesPriceCents: 250000 });
  expect(f.repo.require('projects', (await runAs(f, manager.headers, project(client))).json().result.id).status).toBe('scheduled');
  // workers cannot set prices; drafts cannot be completed; only reviewers move sold projects
  expect((await runAs(f, worker.headers, project(client, { salesPriceCents: 1 }))).statusCode).toBe(403);
  expect((await runAs(f, sales.headers, { type: 'project.setStatus', id, status: 'completed' })).statusCode).toBe(400);
  expect((await runAs(f, sales.headers, { type: 'project.setStatus', id, status: 'sold' })).statusCode).toBe(200);
  expect(f.repo.require('projects', id).soldAt).toBe(1_790_000_000_000);
  expect((await runAs(f, sales.headers, { type: 'project.setStatus', id, status: 'scheduled' })).statusCode).toBe(403);
  expect((await runAs(f, manager.headers, { type: 'project.setStatus', id, status: 'draft' })).statusCode).toBe(400);
  expect((await runAs(f, manager.headers, { type: 'project.setStatus', id, status: 'draft', note: 'Missing the pool prep' })).statusCode).toBe(200);
  expect(f.repo.require('projects', id)).toMatchObject({ status: 'draft', reviewNote: 'Missing the pool prep' });
  await runAs(f, sales.headers, { type: 'project.setStatus', id, status: 'sold' });
  expect((await runAs(f, owner, { type: 'project.setStatus', id, status: 'scheduled' })).statusCode).toBe(200);
  expect(f.repo.require('projects', id)).toMatchObject({ status: 'scheduled', reviewNote: '' });
  // a worker may edit the address but not the prices; the office may
  const base = { type: 'project.update', id, name: 'Deck', clientId: client, clientName: '', note: '' };
  expect((await runAs(f, worker.headers, { ...base, address: '14 Bay St' })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { ...base, address: '14 Bay St', salesPriceCents: 1 })).statusCode).toBe(403);
  expect((await runAs(f, sales.headers, { ...base, address: '14 Bay St', laborPriceCents: 90000, salesNote: 'Two coats' })).statusCode).toBe(200);
  expect(f.repo.require('projects', id)).toMatchObject({ laborPriceCents: 90000, salesNote: 'Two coats', salesPriceCents: 250000 });
  // workers never receive prices; the office does
  const workerView = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json();
  expect(workerView.projects.find((p: { id: string }) => p.id === id)).toMatchObject({ salesPriceCents: null, salesNote: '' });
  expect((await f.app.inject({ url: '/api/v1/snapshot', headers: sales.headers })).json().projects.find((p: { id: string }) => p.id === id).salesPriceCents).toBe(250000);
  expect((await runAs(f, owner, { type: 'project.setStatus', id, status: 'completed' })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { ...base, address: '15 Bay St' })).statusCode).toBe(403);
});
it('keeps job facts, hides some from workers, and tags and comments on files', async () => {
  const { owner, worker, manager, client } = await setup();
  const id = (await runAs(f, manager.headers, project(client))).json().result.id;
  expect((await runAs(f, worker.headers, { type: 'projectFact.save', projectId: id, key: 'store_job_name', value: 'SMITH DECK', workerVisible: true })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { type: 'projectFact.save', projectId: id, key: 'gate_code', value: '4477', workerVisible: false })).statusCode).toBe(403);
  const gate = await runAs(f, manager.headers, { type: 'projectFact.save', projectId: id, key: 'gate_code', value: '4477', workerVisible: false });
  expect(gate.statusCode, gate.body).toBe(200);
  const gateId = gate.json().result.id;
  expect((await runAs(f, worker.headers, { type: 'projectFact.save', id: gateId, projectId: id, key: 'gate_code', value: '0000', workerVisible: true })).statusCode).toBe(403);
  expect((await runAs(f, worker.headers, { type: 'projectFact.remove', id: gateId })).statusCode).toBe(403);
  const workerFacts = (await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json().projectFacts;
  expect(workerFacts.map((fact: { key: string }) => fact.key)).toEqual(['store_job_name']);
  expect((await f.app.inject({ url: '/api/v1/snapshot', headers: manager.headers })).json().projectFacts).toHaveLength(2);
  expect((await runAs(f, manager.headers, { type: 'projectFact.save', id: gateId, projectId: id, key: 'gate_code', value: '4478', workerVisible: false, position: 1 })).statusCode).toBe(200);
  expect(f.repo.require('project_facts', gateId).value).toBe('4478');
  // files: upload a tiny PNG as the worker, tag it twice (idempotent), comment, then remove and refuse further tags
  const fileId = randomUUID();
  f.repo.insert('attachments', { id: fileId, createdAt: 1, updatedAt: 1, parentType: 'project', parentId: id, name: 'deck.png', mimeType: 'image/png', size: 70, storageKey: 'k-' + fileId, previewKey: null, removedAt: null, uploadedBy: worker.id });
  expect((await runAs(f, worker.headers, { type: 'attachment.tag', attachmentId: fileId, tag: 'Before', add: true })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { type: 'attachment.tag', attachmentId: fileId, tag: 'before', add: true })).json().changed).toBe(false);
  expect(f.repo.list('attachment_tags')).toHaveLength(1);
  expect((await runAs(f, manager.headers, { type: 'attachment.comment', attachmentId: fileId, body: 'Note the rotten board on the left.' })).statusCode).toBe(200);
  expect((await runAs(f, worker.headers, { type: 'attachment.tag', attachmentId: fileId, tag: 'before', add: false })).statusCode).toBe(200);
  expect(f.repo.list('attachment_tags')).toHaveLength(0);
  expect((await f.app.inject({ url: '/api/v1/snapshot', headers: worker.headers })).json().attachmentComments).toHaveLength(1);
  f.db.prepare('UPDATE attachments SET removed_at=? WHERE id=?').run(1, fileId);
  expect((await runAs(f, owner, { type: 'attachment.tag', attachmentId: fileId, tag: 'after', add: true })).statusCode).toBe(400);
});
