import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixture, type Fixture } from '../../helpers/fixture.js';
import { processFile, IMAGE_LIMIT, PDF_LIMIT } from '../../../src/files/process.js';
import { safeName } from '../../../src/files/index.js';
let f: Fixture, auth: Awaited<ReturnType<Fixture['authenticate']>>, taskId: string;
const photo = () => sharp({ create: { width: 32, height: 24, channels: 3, background: '#999' } }).png().toBuffer();
async function pdf() { const doc = await PDFDocument.create(); doc.addPage(); return Buffer.from(await doc.save()); }
beforeEach(async () => { f = await createFixture(); auth = await f.authenticate(); const response = await f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: auth, payload: f.envelope({ type: 'task.create', title: 'Unfiled capture', projectId: null, estimatedMinutes: 0, note: '' }) }); expect(response.statusCode, response.body).toBe(200); taskId = response.json().result.id; });
afterEach(async () => { await f.close(); });
const endpoint = (id: string, name = 'phone.png', parentId = taskId) => `/api/v1/files/${id}?${new URLSearchParams({ parentType: 'task', parentId, name })}`;
const upload = (id: string, payload: Buffer, name?: string) => f.app.inject({ method: 'PUT', url: endpoint(id, name), headers: { ...auth, 'content-type': 'application/octet-stream' }, payload });
describe('private file storage', () => {
  it('requires authentication before parsing large uploads; checks CSRF and linked parent', async () => {
    const id = randomUUID();
    expect((await f.app.inject({ method: 'PUT', url: endpoint(id), headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.alloc(PDF_LIMIT + 1) })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'PUT', url: endpoint(id), headers: { cookie: auth.cookie, 'content-type': 'application/octet-stream' }, payload: await photo() })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'PUT', url: endpoint(id, 'photo.png', 'nonexistent'), headers: { ...auth, 'content-type': 'application/octet-stream' }, payload: await photo() })).statusCode).toBe(404);
  });
  it('normalizes photos, creates a preview, never exposes private keys and retries without duplicates', async () => {
    const id = randomUUID(), bytes = await photo(), first = await upload(id, bytes, '../../phone.png'); expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ id, parentId: taskId, parentType: 'task', mimeType: 'image/jpeg' }); expect(first.json().storageKey).toBeUndefined();
    expect((await upload(id, bytes)).statusCode).toBe(200); expect(f.repo.list('attachments')).toHaveLength(1); expect(readdirSync(join(f.directory, 'uploads'))).toHaveLength(2);
    const file = f.repo.list('attachments')[0]; expect(file.name).not.toMatch(/[/\\]/); expect(file.name.endsWith('.jpg')).toBe(true);
    const anonymous = await f.app.inject({ url: `/api/v1/files/${id}/content` }); expect(anonymous.statusCode).toBe(401);
    const content = await f.app.inject({ url: `/api/v1/files/${id}/content?preview=1`, headers: auth }); expect(content.statusCode).toBe(200); expect(content.headers['content-type']).toBe('image/jpeg'); expect(content.headers['cache-control']).toBe('no-store'); expect((await sharp(content.rawPayload).metadata()).format).toBe('jpeg');
    const snapshot = (await f.app.inject({ url: '/api/v1/snapshot', headers: auth })).json(); expect(snapshot.attachments[0].storageKey).toBeUndefined(); expect(snapshot.attachments[0].previewKey).toBeUndefined();
  });
  it('removes recoverably and restores the same stored binary', async () => {
    const id = randomUUID(); await upload(id, await pdf(), 'plan.pdf'); const keys = readdirSync(join(f.directory, 'uploads'));
    expect((await f.app.inject({ method: 'DELETE', url: `/api/v1/files/${id}`, headers: auth })).statusCode).toBe(200);
    expect((await f.app.inject({ url: `/api/v1/files/${id}/content`, headers: auth })).statusCode).toBe(404); expect(readdirSync(join(f.directory, 'uploads'))).toEqual(keys); expect(f.repo.list('activity').find(a => a.kind === 'file.remove')?.userId).toBe(f.ownerId);
    expect((await f.app.inject({ method: 'POST', url: `/api/v1/files/${id}/restore`, headers: auth })).statusCode).toBe(200);
    expect((await f.app.inject({ url: `/api/v1/files/${id}/content`, headers: auth })).statusCode).toBe(200);
  });
  it('rejects executable, HTML, SVG, invalid PDF, active PDF and oversized image', async () => {
    for (const bytes of [Buffer.from('<html><script>alert(1)</script>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), Buffer.from('MZ executable'), Buffer.from('%PDF-1.7\nnot a real PDF')]) expect((await upload(randomUUID(), bytes)).statusCode).toBe(400);
    const doc = await PDFDocument.create(); doc.addPage(); doc.catalog.set(PDFName.of('OpenAction'), PDFString.of('malicious')); expect((await upload(randomUUID(), Buffer.from(await doc.save()), 'plan.pdf')).statusCode).toBe(400);
    const large = Buffer.alloc(IMAGE_LIMIT + 1); large[0] = 0xff; large[1] = 0xd8; large[2] = 0xff; expect((await upload(randomUUID(), large)).statusCode).toBe(413);
    expect(f.repo.list('attachments')).toHaveLength(0);
  });
  it('converts a real HEIC image into JPEG and a compatible preview', async () => {
    const bytes = readFileSync(new URL('./fixtures/example.heic', import.meta.url));
    const response = await upload(randomUUID(), bytes, 'iphone.heic');
    expect(response.statusCode, response.body).toBe(201); expect(response.json().mimeType).toBe('image/jpeg'); expect(response.json().name).toBe('iphone.jpg');
    const preview = await f.app.inject({ url: `/api/v1/files/${response.json().id}/content?preview=1`, headers: auth });
    expect((await sharp(preview.rawPayload).metadata()).format).toBe('jpeg');
  });
  it('fails closed when the storage allowance is exhausted', async () => {
    const limited = await createFixture({ storageLimitBytes: 1 }); try { const headers = await limited.authenticate(), id = randomUUID(); limited.repo.insert('tasks', { id: taskId, createdAt: 1, updatedAt: 1, projectId: null, title: 'Task', estimatedMinutes: 0, status: 'open', note: '' }); const response = await limited.app.inject({ method: 'PUT', url: endpoint(id), headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: await photo() }); expect(response.statusCode, response.body).toBe(507); expect(limited.repo.list('attachments')).toHaveLength(0); } finally { await limited.close(); }
  });
  it('rejects oversized dimensions before decoding and sanitizes download names', async () => {
    const fake = Buffer.alloc(48); fake.write('ftyp', 4); fake.write('heic', 8); fake.write('ispe', 20); fake.writeUInt32BE(30000, 28); fake.writeUInt32BE(30000, 32);
    await expect(processFile(fake)).rejects.toThrow('24 megapixels'); expect(safeName('../../x\r\n.exe', 'pdf')).not.toMatch(/[\r\n/\\]/);
  });
});
