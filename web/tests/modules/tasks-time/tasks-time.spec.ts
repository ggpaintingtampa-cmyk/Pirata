import type { MutationRequest } from '@pirata/contracts/index';
import { test, expect, open, command, snapshot, task, stopTimer, TEST_URL } from './helpers';

test('task create, schedule, edit and refresh persist through rendered controls', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByLabel('Task title').fill('Phone prep'); await page.getByText('More task details', { exact: true }).click(); await page.getByLabel('Estimated minutes').fill('45');
  await page.getByLabel('Plan this task now?').selectOption('yes'); await page.getByLabel('Planned date').fill('2026-10-01'); await page.getByLabel('Start time').fill('09:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await snapshot(page), t = saved.tasks.find(t => t.title === 'Phone prep')!, b = saved.schedule.find(b => b.taskId === t.id)!;
  expect(b.endMinute - b.startMinute).toBe(45);
  await page.getByRole('button', { name: 'Open task: Phone prep', exact: true }).click();
  await page.getByLabel('Task title').fill('Phone painting'); await page.getByLabel('Estimated minutes').fill('90');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('button', { name: 'Open task: Phone painting', exact: true })).toBeVisible();
  expect((await snapshot(page)).schedule.find(x => x.id === b.id)).toMatchObject({ startMinute: b.startMinute, endMinute: b.endMinute, title: 'Phone painting' });
});

test('invalid fields retain input and focus; dirty cancel and Escape restore focus', async ({ page }) => {
  await open(page); const add = page.getByRole('button', { name: 'Add task', exact: true }); await add.click();
  await expect(page.getByLabel('Task title')).toBeFocused(); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('Task title')).toBeFocused();
  await page.getByLabel('Task title').fill('Unsaved task'); await page.getByText('More task details', { exact: true }).click(); await page.getByLabel('Estimated minutes').fill('-1');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('Estimated minutes')).toBeFocused(); await expect(page.getByLabel('Estimated minutes')).toHaveValue('-1');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Task title')).toHaveValue('Unsaved task'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('#main')).toBeFocused();
  expect((await snapshot(page)).tasks.some(t => t.title === 'Unsaved task')).toBe(false);
});

test('uncertain save blocks dismissal, retains envelope through CSRF rotation, retries once', async ({ page }) => {
  await open(page); const requests: MutationRequest[] = [];
  page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) requests.push(r.postDataJSON()); });
  await page.route('**/api/v1/commands', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Add task', exact: true }).click(); await page.getByLabel('Task title').fill('Uncertain task');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Close dialog' }).click(); await expect(page.getByRole('dialog')).toHaveCount(1); await expect(page.getByLabel('Task title')).toBeDisabled();
  await page.evaluate(async () => { const s = await (await fetch('/api/v1/session')).json(); await fetch('/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken }, body: JSON.stringify({ password: 'group-a-fixture-password' }) }); });
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByText(/sign-in needs refreshing/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests).toHaveLength(3); expect(requests[1]).toEqual(requests[0]); expect(requests[2]).toEqual(requests[0]);
  expect((await snapshot(page)).tasks.filter(t => t.title === 'Uncertain task')).toHaveLength(1);
});

test('acknowledged save retries refresh only and in-flight save cannot be dismissed', async ({ page }) => {
  await open(page); let posts = 0; page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) posts++; });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/commands', async route => { await gate; await route.continue(); }, { times: 1 });
  await page.getByRole('button', { name: 'Add task', exact: true }).click(); await page.getByLabel('Task title').fill('Acknowledged task');
  await page.route('**/api/v1/snapshot', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(1); release();
  await expect(page.getByRole('button', { name: 'Reload saved record' })).toBeVisible(); await page.getByRole('button', { name: 'Reload saved record' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect(posts).toBe(1);
});

test('revision conflicts require review and snapshot refresh does not replace dirty drafts', async ({ page }) => {
  await open(page); const id = await task(page, 'Conflict task'); await open(page, 'TaskEditor', { taskId: id });
  await page.getByLabel('Task title').fill('My retained draft');
  await command(page, { type: 'task.update', id, title: 'Other device title', projectId: null, estimatedMinutes: 60, note: '' });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Load latest records' })).toBeVisible();
  await page.getByRole('button', { name: 'Load latest records' }).click(); await expect(page.getByLabel('Task title')).toHaveValue('My retained draft');
  await expect(page.getByText(/Review it before saving again/)).toBeVisible(); expect((await snapshot(page)).tasks.find(t => t.id === id)?.title).toBe('Other device title');
  await task(page, 'Background update after review');
  const refreshed = page.waitForResponse(r => r.url().endsWith('/snapshot'));
  // Exercise a supplied refresh while the dialog is open, as focus/polling integration does.
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Refresh snapshot')?.click());
  await refreshed;
  await expect(page.getByLabel('Task title')).toHaveValue('My retained draft');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load latest records' })).toBeVisible();
  expect((await snapshot(page)).tasks.find(t => t.id === id)?.title).toBe('Other device title');
  await page.getByRole('button', { name: 'Load latest records' }).click();
  await expect(page.getByLabel('Task title')).toBeEnabled();
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('timer start, refresh reconstruction, pause, confirmed switch, finish and reopen', async ({ page }) => {
  await open(page); await stopTimer(page); const a = await task(page, 'Timer prep'), b = await task(page, 'Timer paint'); await open(page, 'TimerControls', { taskId: a });
  await page.getByRole('button', { name: 'Start timer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm start timer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const running = (await snapshot(page)).runningTimer!;
  let writes = 0; page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) writes++; });
  await page.waitForTimeout(1100); expect(writes).toBe(0); await page.reload(); await expect(page.getByLabel('Selected task')).toHaveValue(a); await expect(page.getByRole('button', { name: 'Pause timer', exact: true })).toBeVisible(); expect((await snapshot(page)).runningTimer).toEqual(running);
  await page.getByLabel('Selected task').selectOption(b); await page.getByRole('button', { name: 'Switch timer', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByText(/Close the observed running session/)).toBeVisible(); await page.getByRole('button', { name: 'Confirm switch timer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).runningTimer?.taskId).toBe(b);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm pause timer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start timer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm start timer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish task', exact: true }).click(); await page.getByRole('button', { name: 'Confirm finish task' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const before = await snapshot(page); expect(before.runningTimer).toBeNull();
  await page.getByRole('button', { name: 'Reopen task', exact: true }).click(); await page.getByRole('button', { name: 'Confirm reopen task' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).timeEntries).toEqual(before.timeEntries);
});

test('manual entry and explicit correction retain source and saved record', async ({ page }) => {
  await open(page); const id = await task(page, 'Manual task'); await open(page, 'TimeEntriesView', { taskId: id });
  await page.getByRole('button', { name: 'Add manual time', exact: true }).click(); await page.getByLabel('Whole minutes').fill('12.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('Whole minutes')).toBeFocused();
  await page.getByLabel('Whole minutes').fill('25'); await page.getByLabel('Work date').fill('2026-09-17'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const old = (await snapshot(page)).timeEntries.find(e => e.taskId === id)!;
  await page.getByRole('button', { name: 'Correct entry' }).click(); await page.getByLabel('Whole minutes').fill('30'); await page.getByLabel('Time note (optional)').fill('Forgot cleanup');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await page.reload(); await expect(page.getByText('Recorded total: 30m')).toBeVisible();
  expect((await snapshot(page)).timeEntries.find(e => e.id === old.id)).toMatchObject({ source: 'manual', taskId: id, durationSeconds: 1800, createdAt: old.createdAt });
});

test('phone and desktop layouts fit, controls are touch sized, screenshots captured', async ({ page }) => {
  await open(page); const id = await task(page, 'Layout task');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width > 700 ? 900 : 844 }); await open(page, 'TimerControls', { taskId: id });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1280) await page.screenshot({ path: `tests/modules/tasks-time/artifacts/timer-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Start timer', exact: true }).click();
    const box = (await page.getByRole('dialog').boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.height).toBeLessThanOrEqual(width > 700 ? 900 : 844);
    const buttons = await page.getByRole('dialog').getByRole('button').all(); for (const b of buttons) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('independent authenticated browser contexts racing rendered timer actions cannot lose updates', async ({ page, browser }) => {
  await open(page); await stopTimer(page); const a = await task(page, 'Race A'), b = await task(page, 'Race B');
  const one = await browser.newContext({ baseURL: TEST_URL,ignoreHTTPSErrors:process.env.PIRATA_TEST_HTTPS==='1' }), two = await browser.newContext({ baseURL: TEST_URL,ignoreHTTPSErrors:process.env.PIRATA_TEST_HTTPS==='1' });
  try {
    const p = await one.newPage(), q = await two.newPage();
    await open(p, 'TimerControls', { taskId: a }); await open(q, 'TimerControls', { taskId: b });
    await p.getByRole('button', { name: 'Start timer', exact: true }).click(); await q.getByRole('button', { name: 'Start timer', exact: true }).click();
    const results = [p.waitForResponse(r => r.url().endsWith('/commands')), q.waitForResponse(r => r.url().endsWith('/commands'))];
    await Promise.all([p.getByRole('button', { name: 'Confirm start timer' }).click(), q.getByRole('button', { name: 'Confirm start timer' }).click()]);
    expect((await Promise.all(results)).map(r => r.status()).sort()).toEqual([200, 409]);
    const active = (await snapshot(page)).runningTimer!;
    const loser = await p.getByRole('button', { name: 'Load latest records' }).isVisible() ? p : q;
    await expect(loser.getByText(/Records changed on another device/)).toBeVisible();
    await open(p, 'TimerControls', { taskId: active.taskId === a ? b : a }); await open(q, 'TimerControls', { taskId: active.taskId });
    await p.getByRole('button', { name: 'Switch timer', exact: true }).click(); await q.getByRole('button', { name: 'Pause timer', exact: true }).click();
    const changes = [p.waitForResponse(r => r.url().endsWith('/commands')), q.waitForResponse(r => r.url().endsWith('/commands'))];
    await Promise.all([p.getByRole('button', { name: 'Confirm switch timer' }).click(), q.getByRole('button', { name: 'Confirm pause timer' }).click()]);
    expect((await Promise.all(changes)).map(r => r.status()).sort()).toEqual([200, 409]);
    expect((await snapshot(page)).timeEntries.filter(e => e.id === active.sessionId)).toHaveLength(1);
  } finally { await one.close(); await two.close(); await stopTimer(page); }
});

test('outage retains active saved timer and clock conflicts expose correction/discard controls', async ({ page }) => {
  await open(page); await stopTimer(page); const taskId = await task(page, 'Outage timer'); await command(page, { type: 'timer.start', taskId }); await open(page, 'TimerControls', { taskId });
  const before = (await snapshot(page)).runningTimer!;
  await page.route('**/api/v1/commands', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Fixture outage' } }) }), { times: 1 });
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm pause timer' }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible(); expect((await snapshot(page)).runningTimer).toEqual(before);
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  // Display-only clock regression fixture; real command validation is covered by SQLite tests.
  await command(page, { type: 'timer.start', taskId });
  await page.route('**/api/v1/snapshot', async route => { const r = await route.fetch(); const s = await r.json(); s.serverNow = s.runningTimer.startedAt - 60000; await route.fulfill({ response: r, json: s }); }, { times: 1 });
  await open(page, 'TimerControls', { taskId }); await expect(page.getByText(/server clock is earlier/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Pause timer', exact: true })).toBeDisabled();
  await page.getByText('More timer actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Correct timer start', exact: true }).click(); await page.getByLabel('Corrected start (ISO timestamp)').fill(new Date(before.startedAt - 60000).toISOString());
  await page.getByRole('button', { name: 'Confirm correct timer start' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard timer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm discard timer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect((await snapshot(page)).runningTimer).toBeNull();
});

test('signed-out retry retains the original request until the owner signs in again', async ({ page }) => {
  await open(page); const requests: MutationRequest[] = [];
  page.on('request', r => { if (r.url().endsWith('/commands')) requests.push(r.postDataJSON()); });
  await page.getByRole('button', { name: 'Add task', exact: true }).click(); await page.getByLabel('Task title').fill('Signed-out retained task');
  await page.evaluate(async () => { const s = await (await fetch('/api/v1/session')).json(); await fetch('/api/v1/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken }, body: '{}' }); });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByText(/Sign in in another tab/)).toBeVisible();
  await expect(page.getByLabel('Task title')).toHaveValue('Signed-out retained task'); await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  const login = await page.context().newPage();
  try { await open(login); } finally { await login.close(); }
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect((await snapshot(page)).tasks.filter(t => t.title === 'Signed-out retained task')).toHaveLength(1);
});
