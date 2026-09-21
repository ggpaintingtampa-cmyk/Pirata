import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';
import { parseMoneyToCents } from '@pirata/domain/lib/money';
import { businessDate } from '@pirata/domain/lib/dates';
import { moduleFixture, project, purchase, DATE, NOW, type ModuleFixture } from './support.js';
import { createApp } from '../../../src/app.js';
import { openDatabase } from '../../../src/db/database.js';
import { TEST_ORIGIN } from '../../helpers/fixture.js';
let f: ModuleFixture;
beforeEach(async () => { f = await moduleFixture(); });
afterEach(async () => { await f.close(); });
const total = (s: BusinessSnapshot, date = DATE, projectId?: string) => s.expenses.filter(e => e.purchaseDate === date && (projectId === undefined || e.projectId === projectId)).reduce((n, e) => n + e.amountCents, 0);
describe('spending persistence and transaction rules', () => {
  it('adds exact cents and edits in place without changing identity or creation order', async () => {
    await f.save(purchase(8460)); f.tick();
    const id = (await f.save(purchase())).result.id!, before = f.repo.require('expenses', id);
    expect(total(await f.snapshot())).toBe(10960); f.tick();
    await f.save({ ...purchase(3000), type: 'expense.update', id });
    expect(total(await f.snapshot())).toBe(11460);
    expect(f.repo.list('expenses')).toHaveLength(2);
    expect(f.repo.require('expenses', id)).toMatchObject({ id, createdAt: before.createdAt, description: 'Paint', amountCents: 3000 });
    expect(f.repo.require('expenses', id).updatedAt).toBeGreaterThan(before.createdAt);
    expect((await f.save({ ...purchase(3000), type: 'expense.update', id })).changed).toBe(false);
  });
  it('parses decimals exactly and rejects signs, exponents, special numbers and unsafe values', async () => {
    const a = parseMoneyToCents('0.10')!, b = parseMoneyToCents('0.20')!;
    await f.save(purchase(a)); await f.save(purchase(b));
    expect(total(await f.snapshot())).toBe(30);
    for (const value of ['-1', '1e2', 'NaN', 'Infinity', '0', '1.001', '900719925474099.99']) expect(parseMoneyToCents(value)).toBeNull();
    for (const amountCents of [-1, 0, 1.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) expect((await f.send(purchase(amountCents))).response.statusCode).toBe(400);
    for (const purchaseDate of ['2026-02-30', '2025-02-29', '2026-13-01', 'not a date']) expect((await f.send({ ...purchase(), purchaseDate })).response.statusCode).toBe(400);
    expect(f.repo.list('expenses')).toHaveLength(2);
  });
  it('moves a purchase between dates/projects; General business contributes only to daily total', async () => {
    const p = (await f.save(project())).result.id!, q = (await f.save(project('Second job'))).result.id!;
    await f.save(purchase(10)); const id = (await f.save(purchase(20, p))).result.id!;
    expect(total(await f.snapshot())).toBe(30); expect(total(await f.snapshot(), DATE, p)).toBe(20);
    await f.save({ ...purchase(30, q), type: 'expense.update', id, purchaseDate: '2026-09-18' });
    const s = await f.snapshot();
    expect(total(s)).toBe(10); expect(total(s, DATE, p)).toBe(0); expect(total(s, '2026-09-18', q)).toBe(30);
    expect(s.expenses).toHaveLength(2);
    expect(businessDate(Date.parse('2026-09-18T01:00:00Z'))).toBe(DATE);
  });
  it('replays the identical request once and rejects changed payload or stale revision', async () => {
    const { response, envelope } = await f.send(purchase());
    expect((await f.request(envelope)).json()).toEqual(response.json());
    expect((await f.request({ ...envelope, command: purchase(3000) })).statusCode).toBe(409);
    expect((await f.request(f.envelope(purchase(), 0))).json().error.code).toBe('REVISION_CONFLICT');
    expect(f.repo.list('expenses')).toHaveLength(1);
  });
  it('requires authentication, CSRF, strict fields and owned references', async () => {
    const other = await moduleFixture();
    try {
      const foreignProject = (await other.save(project())).result.id!, foreignExpense = (await other.save(purchase())).result.id!;
      expect((await f.send(purchase(25, foreignProject))).response.statusCode).toBe(404);
      expect((await f.send({ ...purchase(), type: 'expense.update', id: foreignExpense })).response.statusCode).toBe(404);
      const envelope = f.envelope(purchase());
      expect((await f.app.inject({ method: 'POST', url: '/api/v1/commands', payload: envelope })).statusCode).toBe(401);
      expect((await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: { ...f.auth, 'x-csrf-token': 'bad' }, payload: envelope })).statusCode).toBe(403);
      expect((await f.send({ ...purchase(), ownerId: other.ownerId } as BusinessCommand)).response.statusCode).toBe(400);
      expect(f.repo.list('expenses')).toEqual([]);
    } finally { await other.close(); }
  });
  it('rolls back storage/receipt failure and retains existing rows/revision', async () => {
    const id = (await f.save(purchase())).result.id!, before = await f.snapshot();
    f.db.pragma('query_only = ON');
    expect((await f.send(purchase())).response.statusCode).toBe(503);
    f.db.pragma('query_only = OFF');
    f.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT,'test fault'); END");
    expect((await f.send({ ...purchase(3000), type: 'expense.update', id })).response.statusCode).toBe(409);
    expect((await f.snapshot()).expenses).toEqual(before.expenses); expect((await f.snapshot()).revision).toBe(before.revision);
  });
  it('survives a complete backend/database restart', async () => {
    const id = (await f.save(purchase())).result.id!;
    await f.app.close(); f.db.close();
    const db = openDatabase(f.path), app = createApp({ db, origin: TEST_ORIGIN, now: () => NOW });
    try { const s = (await app.inject({ url: '/api/v1/snapshot', headers: f.auth })).json<BusinessSnapshot>(); expect(s.expenses).toHaveLength(1); expect(s.expenses[0].id).toBe(id); }
    finally { await app.close(); db.close(); }
  });
});
