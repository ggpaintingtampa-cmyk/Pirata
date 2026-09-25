import { devices, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import type { BusinessCommand, BusinessSnapshot, MutationResult } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { projectSummary } from '../../../src/features/clients-projects/projectSummary';

// Reuse only this isolated fixture's authenticated browser context, with a fresh
// page per case. Eleven tests must not perform eleven rapid logins and trip the
// real ten-attempt security limit. No auth bypass, saved cookies or live accounts.
const test = base.extend<object, { moduleContext: BrowserContext }>({
  moduleContext: [async ({ browser }, provide) => {
    const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', baseURL: 'http://127.0.0.1:5174' });
    await provide(context); await context.close();
  }, { scope: 'worker' }],
  page: async ({ moduleContext }, provide) => { const page = await moduleContext.newPage(); await provide(page); await page.close(); },
});

async function openModule(page: Page, module: string, view: string, selection: Record<string, string> = {}) {
  // The shared helper races initial mounting and authenticated reloads. Wait for
  // the real session response before deciding whether the fixture needs login.
  const sessionResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/session'));
  await page.goto('/tests/module-harness/?' + new URLSearchParams({ module, view, ...selection }));
  const session = await (await sessionResponse).json();
  if (!session.authenticated) {
    await page.getByLabel('Fixture password').fill('isolated-harness-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await expect(page.getByTestId('module-view')).toBeVisible();
}

async function snapshot(page: Page): Promise<BusinessSnapshot> {
  // Use the real browser session: Chromium accepts Secure cookies on loopback,
  // while Playwright's separate Node request client intentionally does not.
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/snapshot');
    if (!response.ok) throw new Error('Snapshot status ' + response.status);
    return response.json();
  });
}
async function command(page: Page, command: BusinessCommand): Promise<MutationResult> {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json();
    const current = await (await fetch('/api/v1/snapshot')).json();
    const response = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: current.revision, command }) });
    if (!response.ok) throw new Error('Command status ' + response.status);
    return response.json();
  }, command);
}
const openClients = (page: Page) => openModule(page, 'clients-projects', 'ClientsView');
async function addClient(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const clientInput = (name: string) => ({ type: 'client.create' as const, name, phone: '', email: '', note: '' });
const projectInput = (name: string, clientId: string | null = null) => ({ type: 'project.create' as const, name, clientId, clientName: '', address: '', note: '' });

test('phone client/project create and edit, linked job navigation and reload persistence', async ({ page }) => {
  await openClients(page);
  await addClient(page, 'Browser Alex');
  await page.getByRole('button', { name: /Browser Alex/ }).click();
  await page.getByRole('button', { name: 'Edit client', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Browser Alex Smith');
  await page.getByLabel('Phone (optional)').fill('(555) 010-2000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Browser Alex Smith/ }).click();
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Browser exterior');
  await page.getByLabel('Job address (optional)').fill('12 Sample Lane');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await snapshot(page), client = saved.clients.find(c => c.name === 'Browser Alex Smith')!, project = saved.projects.find(p => p.name === 'Browser exterior')!;
  expect(project.clientId).toBe(client.id);
  expect(saved.clients.filter(c => c.name.startsWith('Browser Alex'))).toHaveLength(1);
  await page.getByRole('button', { name: /Browser Alex Smith/ }).click();
  await page.getByRole('button', { name: /Browser exterior/ }).click();
  await expect(page.getByRole('status')).toHaveText('Project: ' + project.id);
  await openModule(page, 'clients-projects', 'ProjectDetail', { projectId: project.id });
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Browser exterior repaint');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Browser exterior repaint' })).toBeVisible();
  await expect(page.getByText('12 Sample Lane').first()).toBeVisible();
  expect((await snapshot(page)).projects.filter(p => p.id === project.id)).toHaveLength(1);
  await page.getByRole('button', { name: 'Browser Alex Smith', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Client: ' + client.id);
});

test('client archive and restore keep projects and contact history', async ({ page }) => {
  await openClients(page); await addClient(page, 'Archive Pat');
  await page.getByRole('button', { name: /Archive Pat/ }).click();
  await page.getByRole('button', { name: 'Archive client', exact: true }).click();
  await page.getByRole('button', { name: 'Archive client', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Archive Pat/ })).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('archived');
  await page.getByRole('button', { name: /Archive Pat/ }).click();
  await page.getByRole('button', { name: 'Restore client', exact: true }).click();
  await page.getByRole('button', { name: 'Restore client', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('active');
  await expect(page.getByRole('button', { name: /Archive Pat/ })).toBeVisible();
});

test('lead create/edit, due reminder, follow-up history and conversion work in one dialog', async ({ page }) => {
  await openClients(page);
  const today = businessDate((await snapshot(page)).serverNow);
  await page.getByRole('button', { name: /^Leads / }).click();
  await page.getByRole('button', { name: 'Add lead', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Browser Casey');
  await page.getByLabel('Work description', { exact: true }).fill('Paint cabinets');
  await page.getByLabel('Next follow-up date (optional)').fill(today);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('due');
  await page.getByRole('button', { name: /Browser Casey/ }).click();
  await page.getByRole('button', { name: 'Edit lead', exact: true }).click();
  await page.getByLabel('Work description', { exact: true }).fill('Paint kitchen cabinets');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Browser Casey/ }).click();
  await page.getByRole('button', { name: 'Record follow-up', exact: true }).click();
  await page.getByLabel('Follow-up note', { exact: true }).fill('Discussed the estimate.');
  await page.getByRole('button', { name: 'Record follow-up', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Browser Casey/ })).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: /Browser Casey/ }).click();
  await expect(page.getByText('Discussed the estimate.', { exact: true })).toBeVisible();
  await expect(page.getByText('No reminder', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Convert to client', exact: true }).click();
  await page.getByRole('button', { name: 'Convert lead', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const s = await snapshot(page), lead = s.leads.find(l => l.name === 'Browser Casey')!;
  expect(lead.followUps).toHaveLength(1); expect(lead.convertedClientId).not.toBeNull();
  expect(s.clients.filter(c => c.name === 'Browser Casey')).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: /^Leads / }).click();
  await page.getByRole('button', { name: /Browser Casey/ }).click();
  await page.getByRole('button', { name: 'View client: Browser Casey', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Client details', exact: true })).toBeVisible();
});

test('project list filters and complete/reopen persist', async ({ page }) => {
  await openModule(page, 'clients-projects', 'ProjectsView');
  // Update 2026-09-25: Add project is the on-site capture flow (covered by the team suite); seed the record directly.
  const statusClient = await command(page, clientInput('Status client'));
  const id = (await command(page, projectInput('Status porch', statusClient.result.id))).result.id as string;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Status porch', exact: true })).toBeVisible();
  await openModule(page, 'clients-projects', 'ProjectDetail', { projectId: id });
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Add task: ' + id);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Add expense: ' + id);
  await expect(page.getByText('$0.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete project', exact: true }).click();
  await expect(page.getByText('0 unfinished tasks', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Complete project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reopen project', exact: true })).toBeVisible();
  await openModule(page, 'clients-projects', 'ProjectsView');
  await expect(page.getByRole('heading', { name: 'Status porch', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Completed / }).click();
  await expect(page.getByRole('heading', { name: 'Status porch', exact: true })).toBeVisible();
  await openModule(page, 'clients-projects', 'ProjectDetail', { projectId: id });
  await page.getByRole('button', { name: 'Reopen project', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).projects.find(p => p.id === id)!.status).toBe('scheduled');
});

test('keyboard validation, Escape, dirty cancellation and focus restoration', async ({ page }) => {
  await openClients(page);
  const opener = page.getByRole('button', { name: 'Add client', exact: true });
  await opener.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await opener.click(); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.getByLabel('Name', { exact: true }).fill('Never saved');
  await page.getByLabel('Email (optional)').fill('not-an-email');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Email (optional)')).toBeFocused();
  await expect(page.getByLabel('Email (optional)')).toHaveValue('not-an-email');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Never saved');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(opener).toBeFocused();
  expect((await snapshot(page)).clients.some(c => c.name === 'Never saved')).toBe(false);
});

test('lost response retries the same request and creates only one client', async ({ page }) => {
  await openClients(page);
  const before = (await snapshot(page)).clients.length;
  await page.route('**/api/v1/commands', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Retry Jordan');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Retry Jordan');
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Discard unsaved changes?' })).toHaveCount(0);
  // Rotate the real cookie/session without updating the UI service's cached CSRF.
  // This reproduces signing in elsewhere while the original form stays open.
  await page.evaluate(async () => {
    const session = await (await fetch('/api/v1/session')).json();
    const response = await fetch('/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ password: 'isolated-harness-password' }) });
    if (!response.ok) throw new Error('Fixture login rotation failed');
  });
  await page.getByRole('button', { name: 'Retry same save' }).click();
  await expect(page.getByText(/Your sign-in needs to be refreshed/)).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).clients).toHaveLength(before + 1);
});

test('stale revision retains draft and requires explicit review before retry', async ({ page }) => {
  await openClients(page);
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Draft Morgan');
  await command(page, clientInput('Concurrent update'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load latest records' })).toBeVisible();
  await page.getByRole('button', { name: 'Load latest records' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Draft Morgan');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).clients.filter(c => c.name === 'Draft Morgan')).toHaveLength(1);
});

test('saved response with failed refresh reloads without another mutation', async ({ page }) => {
  await openClients(page);
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Refresh Lee');
  await page.route('**/api/v1/snapshot', route => route.abort('failed'), { times: 1 });
  let writes = 0; page.on('request', request => { if (request.url().endsWith('/api/v1/commands')) writes++; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload saved record' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reload saved record' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toBe(1); expect((await snapshot(page)).clients.filter(c => c.name === 'Refresh Lee')).toHaveLength(1);
});

test('in-flight save cannot be discarded or submitted twice', async ({ page }) => {
  await openClients(page);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/commands', async route => { const response = await route.fetch(); await held; await route.fulfill({ response }); }, { times: 1 });
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('In-flight Sam');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByText('Saving is in progress. Keep this dialog open until the result arrives.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Discard unsaved changes?' })).toHaveCount(0);
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).clients.filter(c => c.name === 'In-flight Sam')).toHaveLength(1);
});

test('project summary derives integer spending and time including the active interval', async ({ page }) => {
  await openClients(page);
  const s = await snapshot(page), base = { createdAt: s.serverNow, updatedAt: s.serverNow };
  const fixture: BusinessSnapshot = { ...s,
    projects: [{ ...base, id: 'summary-project', name: 'Summary job', clientId: null, clientName: '', address: '', note: '', status: 'scheduled' }],
    tasks: [{ ...base, id: 'summary-task', projectId: 'summary-project', title: 'Paint', estimatedMinutes: 60, status: 'open', note: '' }],
    timeEntries: [{ ...base, id: 'summary-entry', taskId: 'summary-task', source: 'manual', date: businessDate(s.serverNow), durationSeconds: 1800, note: '' }],
    runningTimer: { taskId: 'summary-task', sessionId: 'summary-running', startedAt: s.serverNow - 120000 },
    expenses: [{ ...base, id: 'summary-a', projectId: 'summary-project', description: 'Small part', category: 'other', purchaseDate: businessDate(s.serverNow), amountCents: 10 }, { ...base, id: 'summary-b', projectId: 'summary-project', description: 'Second part', category: 'other', purchaseDate: businessDate(s.serverNow), amountCents: 20 }, { ...base, id: 'summary-general', projectId: null, description: 'General business', category: 'other', purchaseDate: businessDate(s.serverNow), amountCents: 2000 }],
    objectives: [], schedule: [], materials: [], materialRequirements: [], materialAdjustments: [],
  };
  const summary = projectSummary(fixture, 'summary-project');
  expect(summary.spendingCents).toBe(30); expect(summary.loggedMs).toBe(1920000);
  expect(summary.outstanding).toHaveLength(1); expect(summary.hasRunningTimer).toBe(true);
  expect(projectSummary({ ...fixture, runningTimer: null }, 'summary-project').loggedMs).toBe(1800000);
});

test('client and project layouts fit 320, 390, 768 and 1280px with usable dialogs', async ({ page }, testInfo) => {
  await openClients(page);
  const client = await command(page, clientInput('Layout Avery'));
  await command(page, projectInput('North wall repaint', client.result.id));
  await command(page, projectInput('Living room refresh', client.result.id));
  const consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  for (const [width, height] of [[320, 760], [390, 844], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await openModule(page, 'clients-projects', 'ProjectsView');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Search projects', { exact: true }).fill('North wall repaint');
    await expect(page.getByRole('heading', { name: 'North wall repaint', exact: true })).toBeVisible();
    const button = page.getByRole('button', { name: 'Add project', exact: true });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width === 390 || width === 1280) await page.screenshot({ path: testInfo.outputPath(width === 390 ? 'projects-phone.png' : 'projects-desktop.png'), fullPage: true });
    await button.click();
    const dialog = page.getByRole('dialog');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.height).toBeLessThanOrEqual(height);
    // Update 2026-09-25: Add project opens the on-site capture flow (client, name, address, then tasks).
    await expect(page.getByLabel('Project name', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start walking the job', exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(button).toBeFocused();
  }
  expect(consoleErrors).toEqual([]);
});
