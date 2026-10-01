// P13: translation cache, provider boundary, permissions, budgets and failure states, with a fake provider.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFixture, type Fixture } from './helpers/fixture.js';
import { userOf, runAs, type Headers } from './helpers/roles.js';
import { detectLocale } from '../src/translation/detect.js';
import { getCached, hashText, putTranslation } from '../src/translation/cache.js';

let f: Fixture;
afterEach(async () => { vi.unstubAllEnvs(); await f?.close(); });

/** A provider that marks translations with a prefix and detects Spanish by accents or stop words. */
function fakeFetcher(options: { status?: number; confidence?: number; hold?: Promise<void> } = {}) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (options.hold) await options.hold;
    if (options.status) return new Response(JSON.stringify({ error: 'down' }), { status: options.status });
    const body = JSON.parse(String(init?.body)) as { input: string };
    const input = JSON.parse(body.input) as { target: 'en' | 'es'; items: { id: string; text: string }[] };
    const items = input.items.map(item => {
      const spanish = /[áéíóúñ]|\b(el|la|de|para|pared|pintar|hoy)\b/i.test(item.text), english = /\b(the|and|wall|paint|today|before)\b/i.test(item.text);
      const detected = spanish && english ? 'mixed' : spanish ? 'es' : english ? 'en' : 'unknown';
      const same = detected === input.target;
      return { id: item.id, text: same ? item.text : `[${input.target}] ` + item.text, detected, confidence: options.confidence ?? (detected === 'unknown' ? 30 : 90) };
    });
    return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }], usage: { input_tokens: 120, output_tokens: 60 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}
async function prepare(options: Parameters<typeof fakeFetcher>[0] = {}, settings: Record<string, unknown> = {}) {
  vi.stubEnv('PIRATA_OPENAI_API_KEY', 'isolated-test-placeholder');
  const fetcher = fakeFetcher(options);
  f = await createFixture({ fetcher: fetcher as unknown as typeof fetch });
  const auth = await f.authenticate();
  const saved = await f.app.inject({ method: 'POST', url: '/api/v1/admin/translation', headers: auth, payload: { enabled: true, provider: 'openai', model: 'test-provider-model', dailyRequests: 20, monthlyBudgetCents: 500, inputCentsPerMillion: 100, outputCentsPerMillion: 500, ...settings } });
  expect(saved.statusCode).toBe(200);
  return { auth, fetcher };
}
async function command(headers: Headers, command: unknown) { const r = await runAs(f, headers, command); expect(r.statusCode, r.body).toBe(200); return r.json() as { result: { id: string }; revision: number }; }
async function project(headers: Headers) { const client = await command(headers, { type: 'client.create', name: 'Synthetic client', phone: '', email: '', note: '' }); return (await command(headers, { type: 'project.create', name: 'Synthetic project', clientId: client.result.id, clientName: '', address: '', note: '' })).result.id; }
const lookup = (headers: Headers, target: 'en' | 'es', items: unknown[]) => f.app.inject({ method: 'POST', url: '/api/v1/translations/lookup', headers, payload: { target, items } });
const translate = (headers: Headers, target: 'en' | 'es', items: unknown[]) => f.app.inject({ method: 'POST', url: '/api/v1/translations/translate', headers, payload: { target, items } });

describe('language heuristic', () => {
  it('decides clear prose and leaves short or literal text to the provider', () => {
    expect(detectLocale('We need to sand the wall before the second coat today.').locale).toBe('en');
    expect(detectLocale('Hay que lijar la pared antes de la segunda mano hoy.').locale).toBe('es');
    expect(detectLocale('SW 7005 · 2 gal').locale).toBe('unknown');
    expect(detectLocale('Gate 4411').confidence).toBeLessThan(50);
    expect(detectLocale('ok listo').confidence).toBeLessThan(50);
  });
});

describe('translation lookup and translate', () => {
  it('short-circuits same-language text and never calls the provider for it', async () => {
    const { auth, fetcher } = await prepare();
    const task = await command(auth, { type: 'task.create', projectId: await project(auth), title: 'Sand the wall before the second coat today', estimatedMinutes: 0, note: '' });
    const r = await translate(auth, 'en', [{ kind: 'task', id: task.result.id, field: 'title' }]);
    expect(r.json().items[0]).toMatchObject({ status: 'same', sourceLocale: 'en' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('translates English to Spanish and Spanish to English once, then serves the cache', async () => {
    const { auth, fetcher } = await prepare();
    const p = await project(auth);
    const en = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the second coat', estimatedMinutes: 0, note: '' });
    const es = await command(auth, { type: 'task.create', projectId: p, title: 'Pintar la pared antes de la segunda mano', estimatedMinutes: 0, note: '' });
    const first = await translate(auth, 'es', [{ kind: 'task', id: en.result.id, field: 'title' }, { kind: 'task', id: es.result.id, field: 'title' }]);
    expect(first.statusCode).toBe(200);
    const [a, b] = first.json().items;
    expect(a).toMatchObject({ status: 'ready', text: '[es] Paint the wall before the second coat', sourceLocale: 'en' });
    expect(b).toMatchObject({ status: 'same' });
    const back = await translate(auth, 'en', [{ kind: 'task', id: es.result.id, field: 'title' }]);
    expect(back.json().items[0]).toMatchObject({ status: 'ready', text: '[en] Pintar la pared antes de la segunda mano', sourceLocale: 'es' });
    const calls = fetcher.mock.calls.length;
    expect((await lookup(auth, 'es', [{ kind: 'task', id: en.result.id, field: 'title' }])).json().items[0].status).toBe('ready');
    await translate(auth, 'es', [{ kind: 'task', id: en.result.id, field: 'title' }]);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(f.db.prepare("SELECT count(*) n FROM ai_usage WHERE kind='translation' AND status='complete'").get()).toEqual({ n: calls });
    expect(f.db.prepare("SELECT count(*) n FROM ai_usage WHERE kind='ask'").get()).toEqual({ n: 0 });
  });
  it('keeps a mixed note translatable and marks a short doubtful note unsure until its language is stated', async () => {
    const { auth } = await prepare({ confidence: 40 });
    const p = await project(auth);
    const mixed = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall today, la pared de la cocina para mañana', estimatedMinutes: 0, note: '' });
    const short = await command(auth, { type: 'task.create', projectId: p, title: 'Ok listo', estimatedMinutes: 0, note: '' });
    const r = await translate(auth, 'en', [{ kind: 'task', id: mixed.result.id, field: 'title' }, { kind: 'task', id: short.result.id, field: 'title' }]);
    expect(r.json().items[0].status).toBe('unsure');
    expect(r.json().items[1]).toMatchObject({ status: 'unsure', text: '[en] Ok listo' });
    const stated = await f.app.inject({ method: 'POST', url: '/api/v1/translations/source', headers: auth, payload: { kind: 'task', id: short.result.id, field: 'title', locale: 'es' } });
    expect(stated.statusCode).toBe(200);
    const after = await translate(auth, 'en', [{ kind: 'task', id: short.result.id, field: 'title' }]);
    expect(after.json().items[0]).toMatchObject({ status: 'ready', sourceLocale: 'es' });
    expect(after.json().epoch).toBeGreaterThan(0);
  });
  it('invalidates on edit, protects a correction, and drops a late result for an obsolete source', async () => {
    const { auth, fetcher } = await prepare();
    const p = await project(auth);
    const task = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the second coat', estimatedMinutes: 0, note: '' });
    const item = { kind: 'task', id: task.result.id, field: 'title' };
    await translate(auth, 'es', [item]);
    await command(auth, { type: 'task.update', id: task.result.id, projectId: p, title: 'Paint the wall and the ceiling today', estimatedMinutes: 0, note: '' });
    expect((await lookup(auth, 'es', [item])).json().items[0].status).toBe('pending');
    const corrected = await f.app.inject({ method: 'POST', url: '/api/v1/translations/correct', headers: auth, payload: { ...item, target: 'es', text: 'Pintar la pared y el techo hoy' } });
    expect(corrected.statusCode).toBe(200);
    const calls = fetcher.mock.calls.length;
    const r = await translate(auth, 'es', [item]);
    expect(r.json().items[0]).toMatchObject({ status: 'corrected', text: 'Pintar la pared y el techo hoy' });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    // A provider answer that started before a newer translation was stored never overwrites it.
    const key = { kind: 'task', id: task.result.id, field: 'title' };
    const current = getCached(f.db, f.ownerId, key, 'es')!;
    const late = putTranslation(f.db, f.ownerId, { key, target: 'es', sourceHash: hashText('older text'), sourceLocale: 'en', text: 'stale', status: 'ready', provider: 'test', glossaryVersion: 0, confidence: 90, startedAt: current.updatedAt - 1 }, Date.now());
    expect(late).toBe(false);
    expect(getCached(f.db, f.ownerId, key, 'es')?.text).toBe('Pintar la pared y el techo hoy');
  });
  it('never translates a record the viewer cannot see and lets only the office or the author correct', async () => {
    const { auth } = await prepare();
    const worker = await userOf(f, 'worker', auth), other = await userOf(f, 'worker', auth);
    const p = await project(auth);
    const shift = await command(auth, { type: 'shift.enter', userId: other.id, projectId: p, date: '2026-09-29', kind: 'hours', startMinute: 480, endMinute: 960, breakMinutes: 30, daysMinor: null, note: 'Terminamos la pared de la cocina hoy' });
    const hidden = await lookup(worker.headers, 'en', [{ kind: 'shift', id: shift.result.id, field: 'note' }]);
    expect(hidden.json().items[0]).toMatchObject({ status: 'unavailable', reason: 'missing' });
    expect((await lookup(auth, 'en', [{ kind: 'shift', id: shift.result.id, field: 'note' }])).json().items[0].status).toBe('pending');
    const correct = await f.app.inject({ method: 'POST', url: '/api/v1/translations/correct', headers: worker.headers, payload: { kind: 'shift', id: shift.result.id, field: 'note', target: 'en', text: 'x' } });
    expect(correct.statusCode).toBe(404);
    const ownCorrect = await f.app.inject({ method: 'POST', url: '/api/v1/translations/correct', headers: other.headers, payload: { kind: 'shift', id: shift.result.id, field: 'note', target: 'en', text: 'We finished the kitchen wall today' } });
    expect(ownCorrect.statusCode).toBe(200);
  });
  it('reports budget exhaustion and provider failure without blocking the records', async () => {
    const { auth, fetcher } = await prepare({}, { dailyRequests: 1 });
    const p = await project(auth);
    const a = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the coat', estimatedMinutes: 0, note: '' });
    const b = await command(auth, { type: 'task.create', projectId: p, title: 'Tape the windows and the doors', estimatedMinutes: 0, note: '' });
    expect((await translate(auth, 'es', [{ kind: 'task', id: a.result.id, field: 'title' }])).json().items[0].status).toBe('ready');
    expect((await translate(auth, 'es', [{ kind: 'task', id: b.result.id, field: 'title' }])).json().items[0]).toMatchObject({ status: 'unavailable', reason: 'budget' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await f.close();
    const down = await prepare({ status: 503 });
    const p2 = await project(down.auth);
    const c = await command(down.auth, { type: 'task.create', projectId: p2, title: 'Paint the wall before the coat', estimatedMinutes: 0, note: '' });
    const r = await translate(down.auth, 'es', [{ kind: 'task', id: c.result.id, field: 'title' }]);
    expect(r.json().items[0]).toMatchObject({ status: 'unavailable', reason: 'provider' });
    expect(f.db.prepare("SELECT status FROM ai_usage WHERE kind='translation'").all()).toEqual([{ status: 'failed' }]);
  });
  it('stops serving a deleted record and serves it again after restore without a new provider call', async () => {
    const { auth, fetcher } = await prepare();
    const p = await project(auth);
    const task = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the coat', estimatedMinutes: 0, note: '' });
    const item = { kind: 'task', id: task.result.id, field: 'title' };
    await translate(auth, 'es', [item]);
    await command(auth, { type: 'record.delete', kind: 'task', id: task.result.id });
    expect((await lookup(auth, 'es', [item])).json().items[0]).toMatchObject({ status: 'unavailable', reason: 'missing' });
    await command(auth, { type: 'record.restore', kind: 'task', id: task.result.id });
    expect((await lookup(auth, 'es', [item])).json().items[0].status).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('calls the provider once for identical concurrent requests', async () => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const { auth, fetcher } = await prepare({ hold });
    const p = await project(auth);
    const task = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the coat', estimatedMinutes: 0, note: '' });
    const item = { kind: 'task', id: task.result.id, field: 'title' };
    const both = Promise.all([translate(auth, 'es', [item]), translate(auth, 'es', [item])]);
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    const [x, y] = await both;
    expect(x.json().items[0].status).toBe('ready');
    expect(y.json().items[0].status).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('flags cached rows stale after a glossary change and refreshes them on the next translate', async () => {
    const { auth, fetcher } = await prepare();
    const p = await project(auth);
    const task = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the coat', estimatedMinutes: 0, note: '' });
    const item = { kind: 'task', id: task.result.id, field: 'title' };
    await translate(auth, 'es', [item]);
    const epochBefore = (await lookup(auth, 'es', [item])).json().epoch;
    await command(auth, { type: 'glossary.save', en: 'coat', es: 'mano', note: '' });
    const stale = await lookup(auth, 'es', [item]);
    expect(stale.json().items[0]).toMatchObject({ status: 'ready', stale: true });
    expect(stale.json().epoch).toBeGreaterThan(epochBefore);
    await translate(auth, 'es', [item]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await lookup(auth, 'es', [item])).json().items[0].stale).toBeUndefined();
    const worker = await userOf(f, 'worker', auth);
    expect((await runAs(f, worker.headers, { type: 'glossary.save', en: 'tape', es: 'cinta', note: '' })).statusCode).toBe(403);
  });
  it('searches originals and cached translations in the viewer language, one result per record', async () => {
    const { auth } = await prepare();
    const p = await project(auth);
    const task = await command(auth, { type: 'task.create', projectId: p, title: 'Paint the wall before the second coat', estimatedMinutes: 0, note: 'Use the blue tape' });
    await translate(auth, 'es', [{ kind: 'task', id: task.result.id, field: 'title' }]);
    const es = await f.app.inject({ url: '/api/v1/search?q=%5Bes%5D%20paint&locale=es', headers: auth });
    expect(es.json().results).toHaveLength(1);
    expect(es.json().results[0]).toMatchObject({ kind: 'task', id: task.result.id, matchedIn: 'translation' });
    expect(es.json().translatedCoverage).toBe('partial');
    const en = await f.app.inject({ url: '/api/v1/search?q=blue%20tape&locale=en', headers: auth });
    expect(en.json().results[0]).toMatchObject({ kind: 'task', field: 'note', matchedIn: 'original' });
  });
  it('localizes export text columns on demand and keeps the originals beside them', async () => {
    const { auth } = await prepare();
    const p = await project(auth);
    const worker = await userOf(f, 'worker', auth);
    await command(auth, { type: 'shift.enter', userId: worker.id, projectId: p, date: '2026-09-29', kind: 'hours', startMinute: 480, endMinute: 960, breakMinutes: 30, daysMinor: null, note: 'Paint the wall before the coat' });
    const plain = await f.app.inject({ url: '/api/v1/export/shifts.csv?from=2026-09-29&to=2026-09-29', headers: auth });
    expect(plain.body).toContain('note,approved_by');
    const es = await f.app.inject({ url: '/api/v1/export/shifts.csv?from=2026-09-29&to=2026-09-29&locale=es', headers: auth });
    expect(es.body).toContain('note,note_original,translation_status');
    expect(es.body).toContain('[es] Paint the wall before the coat,Paint the wall before the coat,translated');
  });
  it('rejects unknown kinds, fields and over-long batches, and requires CSRF on translate', async () => {
    const { auth } = await prepare();
    expect((await lookup(auth, 'es', [{ kind: 'password', id: 'x', field: 'hash' }])).statusCode).toBe(400);
    expect((await lookup(auth, 'es', [{ kind: 'task', id: 'x', field: 'owner_id' }])).json().items[0]).toMatchObject({ status: 'unavailable', reason: 'missing' });
    expect((await translate(auth, 'es', Array.from({ length: 41 }, (_, i) => ({ kind: 'task', id: 't' + i, field: 'title' })))).statusCode).toBe(400);
    const noCsrf = await f.app.inject({ method: 'POST', url: '/api/v1/translations/translate', headers: { cookie: auth.cookie, origin: auth.origin }, payload: { target: 'es', items: [{ kind: 'task', id: 'x', field: 'title' }] } });
    expect(noCsrf.statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/translations/lookup', payload: { target: 'es', items: [{ kind: 'task', id: randomUUID(), field: 'title' }] } })).statusCode).toBe(401);
  });
});
