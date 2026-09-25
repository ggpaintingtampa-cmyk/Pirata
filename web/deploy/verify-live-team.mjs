// Authorized read-only business verification on the live HTTPS origin.
// The only writes are one short-lived application session and its revocation.
// No password, cookie, CSRF value, business record or browser trace is printed.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import assert from 'node:assert/strict';

assert.equal(hostname(), 'srv1972305', 'Run only on the verified Pirata VPS');
assert.equal(process.argv.length, 2, 'No credentials or arguments are accepted');
const origin = 'https://pirata.andresinbox.tech';
const helper = `
import {readFileSync} from 'node:fs';
import {openDatabase} from '/srv/pirata/api-current/dist/db/database.js';
import {newSession,revokeSession,COOKIE_NAME} from '/srv/pirata/api-current/dist/auth/sessions.js';
process.umask(0o077);
const request=JSON.parse(readFileSync(0,'utf8'));
const db=openDatabase('/var/lib/pirata/pirata.sqlite',{applyMigrations:false});
try {
 if(request.action==='mint') {
  const owner=db.prepare("SELECT id FROM team_members WHERE role='owner' AND disabled_at IS NULL").get();
  if(!owner)throw Error('Owner unavailable');
  let cookie;
  const reply={setCookie(name,value){cookie={name,value};}};
  const expiresAt=Date.now()+5*60*1000;
  const session=db.transaction(()=>{const s=newSession(db,reply,owner.id,Date.now(),owner.id);db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(expiresAt,s.token_hash);return s;}).immediate();
  process.stdout.write(JSON.stringify({cookie,tokenHash:session.token_hash,expiresAt}));
 }else if(request.action==='revoke'&&/^[a-f0-9]{64}$/.test(request.tokenHash)) {
  revokeSession(db,{token_hash:request.tokenHash});
  if(db.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(request.tokenHash))throw Error('Session revocation failed');
  process.stdout.write('{}');
 }else throw Error('Unsupported verification action');
}finally{db.close();}
`;
function sessionOperation(action) {
  // runuser identity equivalent via tightly scoped sudo; secret material travels
  // over private process pipes, never shell arguments or the command transcript.
  const bytes = execFileSync('sudo', ['-n', '-u', 'pirata', '/srv/pirata/runtime/node', '--input-type=module', '-e', helper], {
    input: JSON.stringify(action), stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 65536,
  });
  return JSON.parse(bytes.toString());
}
let credential, browser, phase = 'temporary session creation';
function revoke() {
  if (credential) {
    sessionOperation({ action: 'revoke', tokenHash: credential.tokenHash });
    credential = undefined;
  }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => {
  try { revoke(); } finally { process.exit(128); }
});
try {
  credential = sessionOperation({ action: 'mint' });
  phase = 'browser startup';
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ ...credential.cookie, url: origin, secure: true, httpOnly: true,
    sameSite: 'Strict', expires: credential.expiresAt / 1000 }]);
  const page = await context.newPage();
  let failedRequests = 0, pageErrors = 0, attemptedWrites = 0;
  page.on('pageerror', () => pageErrors++);
  page.on('response', response => { if (response.url().startsWith(origin + '/api/') && response.status() >= 400) failedRequests++; });
  await page.route(origin + '/api/**', async route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) { attemptedWrites++; await route.abort(); }
    else await route.continue();
  });
  const response = await page.goto(origin);
  phase = 'authenticated Work page';
  assert.equal(response.status(), 200, 'Trusted HTTPS application entrypoint');
  await page.getByRole('heading', { name: 'Work.', exact: true }).waitFor();
  assert(await page.getByRole('navigation', { name: 'Main navigation' }).isVisible(), 'Authenticated Work navigation');
  const snapshot = await context.request.get(origin + '/api/v1/snapshot');
  phase = 'authenticated owner snapshot';
  assert.equal(snapshot.status(), 200, 'Owner snapshot authenticated');
  const data = await snapshot.json();
  assert.equal(data.currentUser?.role, 'owner', 'Temporary session retains owner role');
  assert(Array.isArray(data.tasks) && Array.isArray(data.projects), 'Existing business collections load');
  phase = 'Work assignment filters';
  const teamTasks = page.getByRole('region', { name: 'Team tasks', exact: true });
  assert(await teamTasks.isVisible(), 'Owner team task section visible');
  await teamTasks.getByRole('group', { name: 'Work task status' }).getByRole('button', { name: 'All', exact: true }).click();
  const visibleTasks = data.tasks.filter(task => task.archivedAt == null &&
    !(task.parentTaskId && data.tasks.some(parent => parent.id === task.parentTaskId && parent.archivedAt != null)));
  assert.equal(await teamTasks.locator('.work-my-task-row').count(), visibleTasks.length, 'All unarchived tasks available without history cap');
  await teamTasks.getByLabel('Person', { exact: true }).selectOption('unassigned');
  assert.equal(await teamTasks.locator('.work-my-task-row').count(), visibleTasks.filter(task => !task.assigneeId).length, 'Unassigned filter preserves records');
  await teamTasks.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await teamTasks.getByRole('button', { name: 'Today', exact: true }).click();
  assert.equal(await teamTasks.getByRole('button', { name: 'Today', exact: true }).getAttribute('aria-pressed'), 'true', 'Today toggle works');
  await teamTasks.getByRole('button', { name: 'Reset filters', exact: true }).click();
  for (const section of ['Projects', 'Calendar']) {
    phase = 'read-only ' + section + ' page';
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: section, exact: true }).click();
    await page.getByRole('heading', { name: section + '.', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Phone section fits');
  }
  for (const mode of ['Time grid', 'Day', 'Week', 'Month']) {
    phase = 'read-only Calendar ' + mode;
    await page.getByRole('button', { name: mode, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: mode, exact: true }).getAttribute('aria-pressed'), 'true', 'Calendar mode switches');
  }
  phase = 'redesigned direct routes and refresh';
  await page.locator('.workspace-shortcuts').getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.reload();
  await page.getByRole('heading', { name: 'Tasks.', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/tasks', 'Refresh keeps the selected page');
  const activeTask = data.tasks.find(task => !task.archivedAt && task.status !== 'done');
  if (activeTask) {
    phase = 'read-only task file controls';
    await page.getByRole('button', { name: 'Open task: ' + activeTask.title, exact: true }).first().click();
    const recovery = page.getByRole('dialog').getByRole('button', { name: 'Recover removed', exact: true });
    await recovery.scrollIntoViewIfNeeded();
    const bounds = await recovery.boundingBox();
    assert(bounds && bounds.width > 120 && bounds.height <= 52, 'Recovery action stays horizontal');
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
  for (const route of ['files', 'ask', 'updates', 'progress', 'settings']) {
    phase = 'read-only Figma route ' + route;
    await page.goto(origin + '/#/' + route);
    await page.getByRole('heading', { name: route[0].toUpperCase() + route.slice(1) + '.', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Figma route fits phone');
  }
  phase = 'task-first Add and child navigation';
  await page.locator('.add-button').click();
  await page.getByRole('dialog', { name: 'Add task', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to Add menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Quick Add', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  phase = 'Menu page search';
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByLabel('Find a page', { exact: true }).fill('shopping');
  await page.getByRole('button', { name: 'Shopping', exact: true }).click();
  await page.getByRole('heading', { name: 'Shopping.', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Menu.', exact: true }).waitFor();
  phase = 'responsive persistent controls';
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    await page.locator('.brand').click();
    const brand = await page.locator('.brand-bar').boundingBox();
    const add = await page.locator('.add-button').boundingBox();
    assert(brand && brand.y >= 0 && add, 'Header and Add remain visible');
    if (width < 1100) {
      const nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
      assert(nav && add.y + add.height <= nav.y, 'Add clears bottom navigation');
    } else {
      assert(await page.getByRole('navigation', { name: 'Workspace navigation' }).isVisible(), 'Desktop sidebar visible');
    }
  }
  const example = data.attachments?.find(file => !file.removedAt);
  phase = 'private file authorization';
  if (example) assert.equal((await context.request.get(origin + '/api/v1/files/' + example.id + '/content')).status(), 200, 'Existing private file authorized');
  const anonymous = await browser.newContext();
  phase = 'anonymous API rejection';
  for (const route of ['/api/v1/snapshot', '/api/v1/export', '/api/v1/admin/team', '/api/v1/files/00000000-0000-4000-8000-000000000000/content']) {
    assert.equal((await anonymous.request.get(origin + route)).status(), 401, 'Anonymous private API/file rejected');
  }
  await anonymous.close();
  phase = 'browser errors and read-only enforcement';
  assert.equal(attemptedWrites, 0, 'Browser performs no business mutations');
  assert.equal(failedRequests, 0, 'Authenticated business reads succeed');
  assert.equal(pageErrors, 0, 'No browser runtime errors');
  await browser.close(); browser = undefined;
  phase = 'temporary session revocation';
  revoke();
  console.log('PASS: live trusted HTTPS; authorized Work, Projects, Calendar, Files, Ask, Updates, Progress, Settings, task-first Add and task/file controls, Menu search, route refresh/Back and responsive navigation; anonymous business/admin/file rejection. No business writes. Temporary owner session revoked. Actual password entry and physical iPhone are not part of this check.');
} catch {
  // Avoid Playwright exception output containing page content or request headers.
  console.error('Live team verification failed at ' + phase + '. No credentials or business records logged.');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try { revoke(); } catch { console.error('Temporary verification session could not be revoked; it expires within five minutes.'); process.exitCode = 1; }
}
