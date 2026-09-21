// Sealed production package + built web + real isolated Caddy. Never live data.
import { chromium } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const packageRoot = resolve(process.argv[2]);
assert(packageRoot.startsWith('/tmp/pirata-server-candidate-'), 'Use a sealed isolated candidate');
const load = name => import(pathToFileURL(join(packageRoot, 'dist', name + '.js')).href);
const require = createRequire(join(packageRoot, 'package.json'));
const sharp = require('sharp'), { PDFDocument } = require('pdf-lib');
const { openDatabase } = await load('db/database');
const { setOwnerPassword } = await load('auth/password');
const { createApp } = await load('app');
const directory = await mkdtemp(join(tmpdir(), 'pirata-team-proxy-'));
const origin = 'http://127.0.0.1:5184';
const web = fileURLToPath(new URL('../', import.meta.url));
const screenshots = join(web, 'artifacts/screenshots');
const password = 'isolated-team-proxy-test-password';
let db, app, browser, proxy;
try {
  db = openDatabase(join(directory, 'test.sqlite'), { create: true });
  await setOwnerPassword(db, password, 'setup');
  app = createApp({ db, origin });
  await app.listen({ host: '127.0.0.1', port: 3006 });
  const template = await readFile(new URL('./Caddyfile.team.example', import.meta.url), 'utf8');
  const config = '{\n admin off\n auto_https off\n}\n' + template
    .replace('pirata.andresinbox.tech {', origin + ' {\n bind 127.0.0.1')
    .replaceAll('/srv/pirata/current', JSON.stringify(join(web, 'dist')))
    .replaceAll('/srv/pirata/shared', JSON.stringify(join(web, 'dist')))
    .replace('127.0.0.1:3001', '127.0.0.1:3006');
  await writeFile(join(directory, 'Caddyfile'), config, { mode: 0o600 });
  const validation = spawnSync('caddy', ['validate', '--config', join(directory, 'Caddyfile'), '--adapter', 'caddyfile'], { encoding: 'utf8' });
  assert.equal(validation.status, 0, 'Isolated Caddy config validation');
  proxy = spawn('caddy', ['run', '--config', join(directory, 'Caddyfile'), '--adapter', 'caddyfile'], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(origin); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const html = await readFile(join(web, 'dist/index.html'), 'utf8');
  const asset = html.match(/src="([^"]+\.js)"/)[1].replace(/^\.\//, '/');
  for (const path of ['/', asset]) assert.equal((await fetch(origin + path)).status, 200, 'Public sign-in shell ' + path);
  for (const path of ['/api/v1/snapshot', '/api/v1/export', '/api/v1/admin/team', '/api/v1/files/' + randomUUID() + '/content']) {
    assert.equal((await fetch(origin + path)).status, 401, 'Anonymous private API ' + path);
  }
  for (const path of ['/.env', '/.git/config', '/uploads/photo.jpg', '/server/var/pirata.sqlite', '/backups/', '/assets/missing.js']) {
    assert.equal((await fetch(origin + path)).status, 404, 'Private/missing static path ' + path);
  }
  async function authenticate(username) {
    const pre = await fetch(origin + '/api/v1/session');
    const session = await pre.json();
    const signed = await fetch(origin + '/api/v1/login', { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: origin, 'X-CSRF-Token': session.csrfToken,
      Cookie: pre.headers.get('set-cookie').split(';')[0],
    }, body: JSON.stringify({ username, password }) });
    assert.equal(signed.status, 200, 'Account sign-in');
    const data = await signed.json();
    return { Cookie: signed.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': data.csrfToken };
  }
  async function call(auth, route, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(origin + route, { method, headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }
  const owner = await authenticate('owner');
  async function command(auth, value) {
    const snapshot = await call(auth, '/api/v1/snapshot');
    const result = await call(auth, '/api/v1/commands', { requestId: randomUUID(), baseRevision: snapshot.body.revision, command: value });
    assert.equal(result.status, 200, 'Command ' + value.type + ': ' + JSON.stringify(result.body));
    return result.body;
  }
  const created = await call(owner, '/api/v1/admin/team', { name: 'Smoke crew', username: 'smoke-crew', password });
  assert([200, 201].includes(created.status), 'Owner creates employee');
  const employee = await authenticate('smoke-crew');
  await command(owner, { type: 'expense.create', purchaseDate: '2026-09-18', description: 'Private smoke expense', category: 'other', amountCents: 12345, projectId: null });
  const task = await command(employee, { type: 'task.create', title: 'Team proxy smoke task' });
  const taskId = task.result.id;
  const employeeSnapshot = (await call(employee, '/api/v1/snapshot')).body;
  assert.deepEqual(employeeSnapshot.expenses, [], 'Employee finances absent');
  assert.equal(employeeSnapshot.tasks.find(item => item.id === taskId).projectId, null, 'Name-only task stays unfiled');
  for (const path of ['/api/v1/export', '/api/v1/admin/team']) assert.equal((await call(employee, path)).status, 403, 'Employee owner-route rejected');

  const png = await sharp(randomBytes(1200 * 1200 * 3), { raw: { width: 1200, height: 1200, channels: 3 } }).png().toBuffer();
  assert(png.length > 2 * 1024 * 1024, 'Photo exercises removed 2 MB proxy cap');
  const pdf = await PDFDocument.create(); pdf.addPage([100, 100]);
  const pdfBytes = await pdf.save();
  for (const [name, bytes] of [['phone-photo.png', png], ['plain-document.pdf', pdfBytes]]) {
    const fileId = randomUUID();
    const route = '/api/v1/files/' + fileId + '?' + new URLSearchParams({ parentType: 'task', parentId: taskId, name });
    const uploaded = await fetch(origin + route, { method: 'PUT', headers: { ...employee, 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(uploaded.status, 201, 'Authenticated ' + name + ' upload');
    const saved = await uploaded.json();
    assert(!('storageKey' in saved) && !('previewKey' in saved), 'Storage keys stay private');
    const download = '/api/v1/files/' + fileId + '/content';
    assert.equal((await fetch(origin + download)).status, 401, 'Anonymous file rejected');
    assert.equal((await fetch(origin + download, { headers: owner })).status, 200, 'Other team member downloads file');
    assert.equal((await call(employee, '/api/v1/files/' + fileId, undefined, 'DELETE')).status, 200);
    assert.equal((await fetch(origin + download, { headers: employee })).status, 404, 'Removed file hidden');
    assert.equal((await call(employee, '/api/v1/files/' + fileId + '/restore', {})).status, 200);
    assert.equal((await fetch(origin + download, { headers: employee })).status, 200, 'Removed binary restored');
  }
  const errors = [];
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel('Username', { exact: true }).fill('smoke-crew');
  await page.getByLabel('Pirata password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
  await mkdir(screenshots, { recursive: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width >= 768 ? 960 : 844 });
    await page.screenshot({ path: join(screenshots, `team-proxy-${width}.png`) });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No page horizontal overflow at ' + width);
  }
  const response = await fetch(origin);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.deepEqual(errors, [], 'Built UI runtime errors');
  console.log('PASS: sealed team API + built web + real Caddy; app authentication, employee finance/admin isolation, name-only task, >2 MiB photo + PDF, authenticated downloads and recoverable removal, phone/tablet/desktop screenshots. Chromium only.');
} finally {
  if (browser) await browser.close();
  if (proxy && proxy.exitCode === null) { proxy.kill('SIGTERM'); await new Promise(resolve => proxy.once('exit', resolve)); }
  if (app) await app.close();
  if (db?.open) db.close();
  await rm(directory, { recursive: true, force: true });
}
