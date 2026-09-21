import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BusinessCommand, BusinessSnapshot, MutationResult } from '@pirata/contracts/index';
import { toLegacyState } from '@pirata/contracts/compatibility';
import { attentionItems } from '@pirata/domain/domain/selectors';
import { createFixture, TEST_ORIGIN, type Fixture } from '../../helpers/fixture.js';
import { createApp } from '../../../src/app.js';
import { openDatabase } from '../../../src/db/database.js';
import { Repositories } from '../../../src/core/repositories.js';

let f: Fixture;
let auth: Record<string, string>;
let revision = 0;
const NOW = Date.parse('2026-09-17T14:00:00Z');
const client = { type: 'client.create' as const, name: '  Alex Smith  ', phone: '(555) 010-2020 ext 3', email: '', note: '' };
const project = (clientId: string | null = null) => ({ type: 'project.create' as const, name: 'Exterior painting', clientId, clientName: 'Historical name', address: '12 Sample Lane', note: 'North wall' });
const lead = { type: 'lead.create' as const, name: 'Casey Taylor', phone: '', email: '', workDescription: 'Cabinet painting', nextFollowUpDate: '2026-09-17' };
beforeEach(async () => { f = await createFixture({ now: () => NOW }); auth = await f.authenticate(); revision = 0; });
afterEach(async () => { await f.close(); });
async function send(command: BusinessCommand) {
  const envelope = f.envelope(command, revision);
  const response = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: auth, payload: envelope });
  if (response.statusCode === 200) revision = response.json<MutationResult>().revision;
  return { response, envelope };
}
async function save(command: BusinessCommand) {
  const { response } = await send(command);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<MutationResult>();
}
async function snapshot(): Promise<BusinessSnapshot> { return (await f.app.inject({ url: '/api/v1/snapshot', headers: auth })).json(); }

describe('clients and projects through authenticated real SQLite API', () => {
  it('creates linked records and reloads them after closing and reopening the database', async () => {
    const c = await save(client), p = await save(project(c.result.id!));
    await f.app.close(); f.db.close();
    const db = openDatabase(f.path), app = createApp({ db, origin: TEST_ORIGIN, now: () => NOW });
    try {
      const response = await app.inject({ url: '/api/v1/snapshot', headers: auth });
      expect(response.statusCode).toBe(200);
      const s = response.json<BusinessSnapshot>();
      expect(s.clients).toHaveLength(1); expect(s.clients[0]).toMatchObject({ id: c.result.id, name: 'Alex Smith' });
      expect(s.projects).toHaveLength(1); expect(s.projects[0]).toMatchObject({ id: p.result.id, clientId: c.result.id, clientName: 'Alex Smith' });
      expect(s.capabilities['clients-projects']).toBe('ready');
    } finally { await app.close(); db.close(); }
  });
  it('edits in place, archives without unlinking, unarchives and treats repeated actions as no-ops', async () => {
    const c = await save(client), id = c.result.id!, p = await save(project(id)), projectId = p.result.id!;
    const before = f.repo.require('clients', id);
    await save({ type: 'client.update', id, name: 'Alex S.', phone: '', email: 'alex@example.test', note: 'Gate code supplied separately' });
    await save({ ...project(id), type: 'project.update', id: projectId, name: 'Exterior repaint' });
    await save({ type: 'client.archive', id, archived: true });
    const archived = f.repo.require('clients', id);
    expect(archived.archivedAt).toBe(NOW);
    expect((await save({ type: 'client.archive', id, archived: true })).changed).toBe(false);
    await save({ type: 'client.archive', id, archived: false });
    expect(f.repo.require('clients', id)).toMatchObject({ createdAt: before.createdAt, archivedAt: null, name: 'Alex S.' });
    expect(f.repo.list('clients')).toHaveLength(1);
    expect(f.repo.list('projects')).toHaveLength(1);
    expect(f.repo.require('projects', projectId)).toMatchObject({ clientId: id, name: 'Exterior repaint', clientName: 'Alex Smith' });
    expect((await save({ ...project(id), type: 'project.update', id: projectId, name: 'Exterior repaint' })).changed).toBe(false);
  });
  it('retains unlinked historical client text and never merges matching names', async () => {
    await save(client); await save(client);
    const p = await save(project());
    expect(f.repo.require('projects', p.result.id!)).toMatchObject({ clientId: null, clientName: 'Historical name' });
    expect(f.repo.list('clients')).toHaveLength(2);
  });
  it('preserves imported client-name fallback on unrelated edits of a linked project', async () => {
    const clientId = (await save(client)).result.id!, id = (await save(project(clientId))).result.id!;
    f.repo.update('projects', id, { clientName: 'Historic imported name' });
    await save({ ...project(clientId), type: 'project.update', id, note: 'Updated access details' });
    await save({ type: 'client.archive', id: clientId, archived: true });
    expect(f.repo.require('projects', id).clientName).toBe('Historic imported name');
    expect(toLegacyState(await snapshot()).projects[0].clientName).toBe('Alex Smith');
  });
  it('completes/reopens without touching outstanding work, running timer, planned blocks, purchases or reservations', async () => {
    const p = (await save(project())).result.id!, base = { createdAt: NOW, updatedAt: NOW };
    f.repo.insert('tasks', { ...base, id: 't', projectId: p, title: 'Prepare', estimatedMinutes: 60, status: 'open', note: '' });
    f.repo.insertTimer({ sessionId: 'active', taskId: 't', startedAt: NOW - 120000 });
    f.repo.insert('time_entries', { ...base, id: 'time', taskId: 't', source: 'manual', date: '2026-09-17', durationSeconds: 1800, note: '' });
    f.repo.insert('schedule_blocks', { ...base, id: 'block', date: '2026-09-17', startMinute: 540, endMinute: 600, kind: 'task', taskId: 't', title: 'Prepare' });
    f.repo.insert('expenses', { ...base, id: 'expense', projectId: p, purchaseDate: '2026-09-17', description: 'Paint', category: 'materials', amountCents: 2500 });
    f.repo.insert('materials', { ...base, id: 'paint', name: 'Paint', product: '', color: 'White', finish: 'Satin', unit: 'gal', stockMinor: 300 });
    f.repo.insert('material_requirements', { ...base, id: 'req', materialId: 'paint', projectId: p, neededMinor: 500, reservedMinor: 200 });
    const before = await snapshot();
    for (const status of ['completed', 'open'] as const) {
      await save({ type: 'project.setStatus', id: p, status });
      const after = await snapshot();
      for (const key of ['tasks', 'timeEntries', 'schedule', 'expenses', 'materials', 'materialRequirements', 'runningTimer'] as const) expect(after[key]).toEqual(before[key]);
      expect(after.projects[0].status).toBe(status);
    }
    expect((await save({ type: 'project.setStatus', id: p, status: 'open' })).changed).toBe(false);
  });
  it('rejects wrong-owner client/project/lead IDs and references through actual handlers', async () => {
    // Production is singleton-owner. Test-only CHECK bypass creates a second fixture owner;
    // restore it before requests so all business checks and foreign keys remain active.
    f.db.pragma('ignore_check_constraints = ON');
    try { f.db.prepare('INSERT INTO owners VALUES (?,?,?,?,?)').run('other', 2, 'test-only', NOW, NOW); }
    finally { f.db.pragma('ignore_check_constraints = OFF'); }
    const other = new Repositories(f.db, 'other'), base = { createdAt: NOW, updatedAt: NOW };
    other.insert('clients', { ...base, id: 'foreign-client', name: 'Foreign', phone: '', email: '', note: '', archivedAt: null });
    other.insert('projects', { ...base, id: 'foreign-project', name: 'Foreign project', clientId: 'foreign-client', clientName: 'Foreign', address: '', note: '', status: 'open' });
    other.insert('leads', { ...base, id: 'foreign-lead', name: 'Foreign lead', phone: '', email: '', workDescription: 'Paint', nextFollowUpDate: null, convertedClientId: null });
    const ownLead = (await save(lead)).result.id!;
    for (const command of [project('foreign-client'), { ...client, type: 'client.update', id: 'foreign-client' }, { type: 'client.archive', id: 'foreign-client', archived: true }, { type: 'project.setStatus', id: 'foreign-project', status: 'completed' }, { type: 'lead.followUp', id: 'foreign-lead', note: 'No access', nextFollowUpDate: null }, { type: 'lead.convertToClient', id: ownLead, clientId: 'foreign-client' }] as BusinessCommand[]) expect((await send(command)).response.statusCode).toBe(404);
    expect((await snapshot()).clients).toEqual([]);
    expect(other.require('projects', 'foreign-project').status).toBe('open');
  });
  it('rejects invalid emails, impossible dates and blank notes without saving', async () => {
    for (const command of [{ ...client, email: 'bad@' }, { ...client, name: '  ' }, { ...lead, nextFollowUpDate: '2026-02-30' }, { ...lead, nextFollowUpDate: '2025-02-29' }]) expect((await send(command)).response.statusCode).toBe(400);
    const id = (await save(lead)).result.id!;
    expect((await send({ type: 'lead.followUp', id, note: '  ', nextFollowUpDate: null })).response.statusCode).toBe(400);
    expect(f.repo.list('clients')).toEqual([]); expect(f.repo.list('lead_follow_ups')).toEqual([]);
  });
  it('replays client, project and follow-up requests without duplicate records', async () => {
    const leadId = (await save(lead)).result.id!;
    for (const command of [client, project(), { type: 'lead.followUp' as const, id: leadId, note: 'Called; left a note', nextFollowUpDate: null }]) {
      const { response, envelope } = await send(command);
      const replay = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: auth, payload: envelope });
      expect(replay.json()).toEqual(response.json());
    }
    expect(f.repo.list('clients')).toHaveLength(1); expect(f.repo.list('projects')).toHaveLength(1); expect(f.repo.list('lead_follow_ups')).toHaveLength(1);
  });
  it('preserves existing records on a real write failure', async () => {
    const id = (await save(client)).result.id!, before = f.repo.require('clients', id);
    f.db.exec("CREATE TRIGGER fail_client BEFORE UPDATE ON clients BEGIN SELECT RAISE(ABORT, 'fixture write fault'); END");
    expect((await send({ ...client, type: 'client.update', id, name: 'Unsaved' })).response.statusCode).not.toBe(200);
    expect(f.repo.require('clients', id)).toEqual(before);
    expect((await snapshot()).revision).toBe(revision);
  });
});

describe('leads and atomic conversion', () => {
  it('edits a lead in place and retains all follow-up history', async () => {
    const id = (await save(lead)).result.id!;
    await save({ type: 'lead.followUp', id, note: ' Discussed colors ', nextFollowUpDate: '2026-09-20' });
    await save({ ...lead, type: 'lead.update', id, name: 'Casey T.', workDescription: 'Kitchen cabinets', nextFollowUpDate: null });
    const s = await snapshot();
    expect(s.leads).toHaveLength(1); expect(s.leads[0]).toMatchObject({ id, name: 'Casey T.', nextFollowUpDate: null });
    expect(s.leads[0].followUps[0].note).toBe('Discussed colors');
  });
  it('clears or postpones reminders without losing history', async () => {
    const id = (await save(lead)).result.id!;
    expect(attentionItems(toLegacyState(await snapshot()), '2026-09-17')).toHaveLength(1);
    await save({ type: 'lead.followUp', id, note: 'Follow up next week', nextFollowUpDate: '2026-09-24' });
    expect(attentionItems(toLegacyState(await snapshot()), '2026-09-17')).toEqual([]);
    await save({ type: 'lead.followUp', id, note: 'Finished conversation', nextFollowUpDate: null });
    const s = await snapshot();
    expect(s.leads[0].nextFollowUpDate).toBeNull(); expect(s.leads[0].followUps).toHaveLength(2);
    expect(attentionItems(toLegacyState(s), '2027-01-01')).toEqual([]);
  });
  it('converts to a new client once and preserves source lead and follow-ups', async () => {
    const id = (await save(lead)).result.id!;
    await save({ type: 'lead.followUp', id, note: 'Accepted estimate', nextFollowUpDate: null });
    const converted = await save({ type: 'lead.convertToClient', id, clientId: null });
    expect((await save({ type: 'lead.convertToClient', id, clientId: null })).changed).toBe(false);
    const s = await snapshot();
    expect(s.clients).toHaveLength(1); expect(s.clients[0]).toMatchObject({ id: converted.result.id, name: lead.name, note: lead.workDescription });
    expect(s.leads[0].convertedClientId).toBe(converted.result.id); expect(s.leads[0].followUps).toHaveLength(1);
  });
  it('links an explicitly chosen existing client without overwriting contact details', async () => {
    const clientId = (await save(client)).result.id!, id = (await save(lead)).result.id!;
    const before = f.repo.require('clients', clientId);
    await save({ type: 'lead.convertToClient', id, clientId });
    expect(f.repo.list('clients')).toHaveLength(1); expect(f.repo.require('clients', clientId)).toEqual(before);
    const second = (await save(client)).result.id!;
    expect((await send({ type: 'lead.convertToClient', id, clientId: second })).response.statusCode).toBe(409);
    expect(f.repo.require('leads', id).convertedClientId).toBe(clientId);
  });
  it('rolls back new client and lead linkage together, including failed receipt insertion', async () => {
    const id = (await save(lead)).result.id!, command = { type: 'lead.convertToClient' as const, id, clientId: null };
    for (const table of ['leads', 'command_receipts']) {
      f.db.exec(`CREATE TRIGGER fail_conversion BEFORE ${table === 'leads' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`);
      const { response } = await send(command);
      expect(response.statusCode).not.toBe(200);
      expect(f.repo.list('clients')).toEqual([]); expect(f.repo.require('leads', id).convertedClientId).toBeNull();
      expect((await snapshot()).revision).toBe(revision);
      f.db.exec('DROP TRIGGER fail_conversion');
    }
    await save(command); expect(f.repo.list('clients')).toHaveLength(1);
  });
});
