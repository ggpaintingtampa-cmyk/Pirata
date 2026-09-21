import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';
import { toLegacyState } from '@pirata/contracts/compatibility';
import { materialShortages, attentionItems } from '@pirata/domain/domain/selectors';
import { parseQuantity } from '@pirata/domain/lib/money';
import { moduleFixture, material, project, purchase, NOW, DATE, type ModuleFixture } from '../spending/support.js';
import { createApp } from '../../../src/app.js';
import { openDatabase } from '../../../src/db/database.js';
import { TEST_ORIGIN } from '../../helpers/fixture.js';
let f: ModuleFixture;
beforeEach(async () => { f = await moduleFixture(); });
afterEach(async () => { await f.close(); });
const requirement = (materialId: string, projectId: string, neededMinor = 500, reservedMinor = 200) => ({ type: 'requirement.set' as const, materialId, projectId, neededMinor, reservedMinor });
const adjust = (materialId: string, deltaMinor = 300) => ({ type: 'material.adjust' as const, materialId, deltaMinor, reason: 'restock' as const, note: 'Delivery' });
const upkeep = (equipmentId: string | null = null) => ({ type: 'maintenance.create' as const, title: 'Clean sprayer', equipmentId, equipmentName: 'Original sprayer label', dueDate: DATE });
describe('materials and reservations', () => {
  it('records nonzero opening stock and removes shortage after restock without altering purchases', async () => {
    await f.save(purchase(8460)); const p = (await f.save(project())).result.id!, m = (await f.save(material())).result.id!;
    await f.save(requirement(m, p));
    expect(materialShortages(toLegacyState(await f.snapshot()))[0].missingMinor).toBe(300);
    const opening = f.repo.list('material_adjustments')[0]; expect(opening).toMatchObject({ materialId: m, deltaMinor: 200, reason: 'correction', note: 'Opening stock' });
    const before = (await f.snapshot()).expenses;
    await f.save(adjust(m));
    expect(materialShortages(toLegacyState(await f.snapshot()))).toEqual([]);
    expect((await f.snapshot()).expenses).toEqual(before);
    expect(f.repo.list('material_adjustments')).toHaveLength(2);
    await f.save(material(0)); expect(f.repo.list('material_adjustments')).toHaveLength(2);
  });
  it('allocates free stock once in stable project/requirement order', async () => {
    const p = (await f.save(project('First'))).result.id!; f.tick(); const q = (await f.save(project('Second'))).result.id!, m = (await f.save(material(300))).result.id!;
    await f.save(requirement(m, p, 300, 100)); await f.save(requirement(m, q, 300, 0));
    const shortages = materialShortages(toLegacyState(await f.snapshot()));
    expect(shortages).toHaveLength(1); expect(shortages[0]).toMatchObject({ projectId: q, missingMinor: 300, allocatedMinor: 0 });
    expect(f.repo.list('material_requirements').reduce((sum, r) => sum + r.reservedMinor, 0)).toBe(100);
  });
  it('validates pieces, decimal parsing, negative stock, unsafe sums and reservations', async () => {
    expect(parseQuantity('2.50')).toBe(250); expect(parseQuantity('2.501')).toBeNull(); expect(parseQuantity('1e2')).toBeNull();
    expect((await f.send(material(150, 'piece'))).response.statusCode).toBe(400);
    const p = (await f.save(project())).result.id!, m = (await f.save(material(200, 'piece'))).result.id!;
    expect((await f.send(adjust(m, 50))).response.statusCode).toBe(400);
    expect((await f.send(requirement(m, p, 250, 100))).response.statusCode).toBe(400);
    expect((await f.send(requirement(m, p, 100, 200))).response.statusCode).toBe(400);
    await f.save(requirement(m, p, 500, 200));
    expect((await f.send(adjust(m, -100))).response.json().error.code).toBe('RESERVED_STOCK');
    expect((await f.send(adjust(m, -300))).response.statusCode).toBe(400);
    const gallon = (await f.save(material(Number.MAX_SAFE_INTEGER))).result.id!;
    expect((await f.send(adjust(gallon, 1))).response.statusCode).toBe(400);
    expect(f.repo.require('materials', m).stockMinor).toBe(200);
  });
  it('upserts requirement identity, explicitly releases it and preserves it on project completion', async () => {
    const p = (await f.save(project())).result.id!, m = (await f.save(material())).result.id!;
    const id = (await f.save(requirement(m, p))).result.id!, before = f.repo.require('material_requirements', id); f.tick();
    expect((await f.save(requirement(m, p, 600, 100))).result.id).toBe(id);
    expect(f.repo.list('material_requirements')).toHaveLength(1);
    expect(f.repo.require('material_requirements', id).createdAt).toBe(before.createdAt);
    expect((await f.save(requirement(m, p, 600, 100))).changed).toBe(false);
    await f.save({ type: 'project.setStatus', id: p, status: 'completed' });
    expect(f.repo.require('material_requirements', id).reservedMinor).toBe(100);
    f.db.exec("CREATE TRIGGER fail_remove BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT,'test fault'); END");
    expect((await f.send({ type: 'requirement.remove', id })).response.statusCode).toBe(409);
    expect(f.repo.require('material_requirements', id).reservedMinor).toBe(100);
    f.db.exec('DROP TRIGGER fail_remove'); await f.save({ type: 'requirement.remove', id });
    expect(f.repo.list('material_requirements')).toEqual([]); expect(f.repo.require('materials', m).stockMinor).toBe(200);
  });
  it('retries adjustment once; failed history insertion rolls back stock and revision', async () => {
    const m = (await f.save(material())).result.id!;
    const { envelope, response } = await f.send(adjust(m));
    expect((await f.request(envelope)).json()).toEqual(response.json());
    expect(f.repo.require('materials', m).stockMinor).toBe(500); expect(f.repo.list('material_adjustments')).toHaveLength(2);
    const before = await f.snapshot();
    f.db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON material_adjustments BEGIN SELECT RAISE(ABORT,'test fault'); END");
    expect((await f.send(adjust(m))).response.statusCode).toBe(409);
    expect((await f.snapshot()).materials).toEqual(before.materials); expect((await f.snapshot()).revision).toBe(before.revision);
    expect((await f.send(material(100))).response.statusCode).toBe(409); expect(f.repo.list('materials')).toHaveLength(1);
    expect(() => f.repo.update('material_adjustments', before.materialAdjustments[0].id, { note: 'rewrite' })).toThrow();
  });
  it('rejects unit changes with stock, requirements or history, but permits an unused material', async () => {
    const m = (await f.save(material(0))).result.id!;
    const update = { type: 'material.update' as const, id: m, name: 'Masking supplies', product: '', color: '', finish: '', unit: 'piece' as const };
    await f.save(update); await f.save(adjust(m, 100)); await f.save(adjust(m, -100));
    expect((await f.send({ ...update, unit: 'gal' })).response.json().error.code).toBe('UNIT_HISTORY');
    expect(f.repo.require('materials', m).unit).toBe('piece');
    const n = (await f.save(material(0))).result.id!, p = (await f.save(project())).result.id!;
    await f.save(requirement(n, p, 0, 0)); expect((await f.send({ ...update, id: n })).response.statusCode).toBe(409);
  });
  it('serializes two real simultaneous SQLite writers without overbooking stock', async () => {
    const p = (await f.save(project('A'))).result.id!, q = (await f.save(project('B'))).result.id!, m = (await f.save(material())).result.id!;
    const workers: Worker[] = [];
    try {
      for (const projectId of [p, q]) {
        const worker = new Worker(new URL('./concurrent-writer.ts', import.meta.url), { execArgv: ['--import', import.meta.resolve('tsx')], workerData: { path: f.path, ownerId: f.ownerId, request: f.envelope(requirement(m, projectId, 200, 200), f.revision()) } });
        workers.push(worker); await once(worker, 'message');
      }
      const replies = workers.map(worker => once(worker, 'message')); workers.forEach(worker => worker.postMessage('go'));
      expect((await Promise.all(replies)).map(([r]) => r.status).sort()).toEqual([200, 409]);
      expect(f.repo.list('material_requirements')).toHaveLength(1);
      const missingProject = f.repo.list('material_requirements')[0].projectId === p ? q : p;
      const response = await f.request(f.envelope(requirement(m, missingProject, 200, 200), f.revision() + 1));
      expect(response.json().error.code).toBe('RESERVED_STOCK');
    } finally { await Promise.all(workers.map(worker => worker.terminate())); }
  });
});
describe('equipment, maintenance, ownership and recovery', () => {
  it('completes idempotently, reopens explicitly, excludes future work and retains history on archive', async () => {
    const e = (await f.save({ type: 'equipment.create', name: 'Sprayer', note: '' })).result.id!;
    const id = (await f.save(upkeep(e))).result.id!;
    await f.save({ ...upkeep(e), dueDate: '2026-10-01' });
    const due = async () => attentionItems(toLegacyState(await f.snapshot()), DATE).filter(i => i.kind === 'maintenance');
    expect(await due()).toHaveLength(1);
    await f.save({ type: 'maintenance.complete', id });
    expect(await due()).toEqual([]); expect(f.repo.require('maintenance_items', id).completedAt).toBe(NOW);
    expect((await f.save({ type: 'maintenance.complete', id })).changed).toBe(false);
    await f.save({ type: 'maintenance.reopen', id }); expect(await due()).toHaveLength(1);
    expect((await f.save({ type: 'maintenance.reopen', id })).changed).toBe(false);
    await f.save({ type: 'equipment.update', id: e, name: 'Renamed sprayer', note: 'Clean after use' });
    await f.save({ type: 'equipment.archive', id: e, archived: true });
    await f.save({ ...upkeep(e), type: 'maintenance.update', id, title: 'Flush sprayer' });
    expect(f.repo.require('maintenance_items', id).equipmentName).toBe('Original sprayer label');
    expect(toLegacyState(await f.snapshot()).maintenance.find(m => m.id === id)?.equipmentName).toBe('Renamed sprayer');
    await f.save({ type: 'equipment.archive', id: e, archived: false });
    expect(f.repo.list('maintenance_items')).toHaveLength(2);
  });
  it('rejects foreign fixture IDs, bad dates, unknown fields and anonymous/auth-invalid writes', async () => {
    const other = await moduleFixture();
    try {
      const m = (await other.save(material())).result.id!, p = (await other.save(project())).result.id!, e = (await other.save({ type: 'equipment.create', name: 'Other', note: '' })).result.id!, maintenanceId = (await other.save(upkeep(e))).result.id!;
      const ownMaterial = (await f.save(material())).result.id!;
      for (const c of [adjust(m), requirement(ownMaterial, p), upkeep(e), { type: 'equipment.archive', id: e, archived: true }, { type: 'maintenance.complete', id: maintenanceId }, { type: 'requirement.remove', id: (await other.save(requirement(m, p))).result.id! }] as BusinessCommand[]) expect((await f.send(c)).response.statusCode).toBe(404);
      expect((await f.send({ ...upkeep(), dueDate: '2026-02-30' })).response.statusCode).toBe(400);
      expect((await f.send({ ...material(), ownerId: other.ownerId } as BusinessCommand)).response.statusCode).toBe(400);
      const payload = f.envelope(adjust(ownMaterial), f.revision());
      expect((await f.app.inject({ method: 'POST', url: '/api/v1/commands', payload })).statusCode).toBe(401);
      expect((await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: { ...f.auth, origin: 'https://wrong.test' }, payload })).statusCode).toBe(403);
    } finally { await other.close(); }
  });
  it('replays create and maintenance commands, and keeps a stale stock request untouched', async () => {
    for (const c of [material(), { type: 'equipment.create' as const, name: 'Sprayer', note: '' }, upkeep()]) {
      const { response, envelope } = await f.send(c); expect((await f.request(envelope)).json()).toEqual(response.json());
    }
    const m = f.repo.list('materials')[0].id, before = await f.snapshot();
    expect((await f.request(f.envelope(adjust(m), 0))).json().error.code).toBe('REVISION_CONFLICT');
    expect((await f.snapshot()).materials).toEqual(before.materials);
    expect(f.repo.list('materials')).toHaveLength(1); expect(f.repo.list('equipment')).toHaveLength(1); expect(f.repo.list('maintenance_items')).toHaveLength(1);
  });
  it('restores stock, reservations, adjustment and maintenance records after a full restart', async () => {
    const p = (await f.save(project())).result.id!, m = (await f.save(material())).result.id!;
    await f.save(requirement(m, p)); await f.save(upkeep()); const before = await f.snapshot();
    await f.app.close(); f.db.close(); const db = openDatabase(f.path), app = createApp({ db, origin: TEST_ORIGIN, now: () => NOW });
    try { const after = (await app.inject({ url: '/api/v1/snapshot', headers: f.auth })).json<BusinessSnapshot>(); for (const key of ['materials', 'materialRequirements', 'materialAdjustments', 'maintenance'] as const) expect(after[key]).toEqual(before[key]); }
    finally { await app.close(); db.close(); }
  });
});
