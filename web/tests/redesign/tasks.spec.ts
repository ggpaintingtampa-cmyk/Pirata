import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Disposable team harness only; these checks never use a production database.
async function login(page: Page) {
  await page.goto('/');
  expect(new URL(page.url()).hostname).toBe('127.0.0.1');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-team-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}
async function command(page: Page, command: unknown) {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json();
    const snapshot = await (await fetch('/api/v1/snapshot')).json();
    const response = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: snapshot.revision, command }) });
    if (!response.ok) throw Error(await response.text());
    return response.json();
  }, command);
}
async function tasks(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'All tasks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Tasks', exact: true })).toBeVisible();
}

test('task search combines status, assignment and project filters without hiding completed records', async ({ page }) => {
  await login(page);
  const snapshot = await page.evaluate(async () => (await (await fetch('/api/v1/snapshot')).json()));
  const marker = `Filter ${Date.now()}`;
  const client = (await command(page, { type: 'client.create', name: marker + ' client', phone: '', email: '', note: '' })).result.id;
  const project = (await command(page, { type: 'project.create', name: marker + ' project', clientId: client, clientName: '', address: '', note: '' })).result.id;
  await command(page, { type: 'task.create', title: marker + ' assigned', assigneeId: snapshot.currentUser.id, projectId: project });
  await command(page, { type: 'task.create', title: marker + ' unfiled' });
  const done = (await command(page, { type: 'task.create', title: marker + ' finished', assigneeId: snapshot.currentUser.id, projectId: project })).result.id;
  await command(page, { type: 'task.setStatus', id: done, status: 'done', expectedSessionId: null });
  await page.reload();
  await tasks(page);
  const list = page.getByRole('region', { name: 'Tasks', exact: true });
  await list.getByLabel('Search tasks', { exact: true }).fill(marker);
  await expect(list.locator('.task-library-item')).toHaveCount(2);
  await list.getByRole('combobox', { name: 'Responsible person filter', exact: true }).selectOption(snapshot.currentUser.id);
  await expect(list.getByRole('button', { name: 'Open task: ' + marker + ' assigned', exact: true })).toBeVisible();
  await expect(list.locator('.task-library-item')).toHaveCount(1);
  await list.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption('unfiled');
  await expect(list.getByText('Nothing matches just yet.', { exact: true })).toBeVisible();
  await list.getByRole('combobox', { name: 'Responsible person filter', exact: true }).selectOption('unassigned');
  await expect(list.getByRole('button', { name: 'Open task: ' + marker + ' unfiled', exact: true })).toBeVisible();
  await list.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption(project);
  await list.getByRole('combobox', { name: 'Responsible person filter', exact: true }).selectOption(snapshot.currentUser.id);
  await list.getByRole('combobox', { name: 'Task status', exact: true }).selectOption('done');
  await expect(list.locator('.task-library-item')).toHaveCount(1);
  await expect(list.getByRole('button', { name: 'Open task: ' + marker + ' finished', exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(list.getByLabel('Search tasks', { exact: true })).toHaveValue('');
  await expect(list.getByRole('combobox', { name: 'Task status', exact: true })).toHaveValue('active');
  await expect(list.getByRole('combobox', { name: 'Project filter', exact: true })).toHaveValue('all');
  await expect(list.getByRole('combobox', { name: 'Responsible person filter', exact: true })).toHaveValue('all');
  await mkdir('artifacts/redesign/after', { recursive: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/redesign/after/tasks-${process.env.PIRATA_TEST_WEBKIT ? 'webkit' : 'chromium'}-${width}.png` });
  }
});

test('the floating Add task button saves a name-only task with optional details left blank', async ({ page }) => {
  await login(page);
  await tasks(page);
  await page.locator('.action-bar').getByRole('button', { name: 'Add task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add task', exact: true });
  const title = 'Quick capture ' + Date.now();
  await dialog.getByLabel('Task title', { exact: true }).fill(title);
  await expect(dialog.getByLabel('Estimated minutes (optional)', { exact: true })).toBeHidden();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Open task: ' + title, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit task', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(edit.getByLabel('Estimated minutes (optional)', { exact: true })).toBeVisible();
  await expect(edit.getByLabel('Task title', { exact: true })).toHaveValue(title);
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).toHaveCount(0);
});

test('quick assignment and estimate choices preserve drafts and save the chosen values', async ({ page }) => {
  await login(page);
  const current = await page.evaluate(async () => (await (await fetch('/api/v1/snapshot')).json()).currentUser);
  const add = page.locator('.action-bar').getByRole('button', { name: 'Add task', exact: true });
  await add.click();
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'Quick Add', exact: true });
  await expect(menu).toBeVisible();
  await expect(page.getByText('Discard unsaved changes?', { exact: true })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Task Plan a piece of work', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add task', exact: true });
  const title = 'Preset task ' + Date.now();
  await dialog.getByLabel('Task title', { exact: true }).fill(title);
  await dialog.getByRole('group', { name: 'Quick assignment', exact: true }).getByRole('button', { name: current.name, exact: true }).click();
  await dialog.getByRole('group', { name: 'Quick time estimate', exact: true }).getByRole('button', { name: '1h', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Discard unsaved changes?', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(dialog.getByLabel('Task title', { exact: true })).toHaveValue(title);
  await expect(dialog.getByRole('group', { name: 'Quick time estimate', exact: true }).getByRole('button', { name: '1h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(async title => (await (await fetch('/api/v1/snapshot')).json()).tasks.find((task: { title: string }) => task.title === title), title);
  expect(saved.estimatedMinutes).toBe(60);
  expect(saved.assigneeId).toBe(current.id);
});

test('an interrupted checklist save stays visible and retries the original request safely', async ({ page }) => {
  await login(page);
  const title = 'Checklist recovery ' + Date.now();
  const parent = (await command(page, { type: 'task.create', title })).result.id;
  await command(page, { type: 'task.batchCreate', titles: ['One recoverable step'], projectId: null, parentTaskId: parent, assigneeId: null });
  await page.reload();
  await tasks(page);
  await page.getByRole('button', { name: 'Open task: ' + title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Task details', exact: true });
  const requestIds: string[] = [];
  await page.route('**/api/v1/commands', async route => {
    requestIds.push(route.request().postDataJSON().requestId);
    if (requestIds.length === 1) {
      // The server commits, but the browser never receives the acknowledgement.
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Complete One recoverable step', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Retry same action', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Keep this dialog open until the save is confirmed');
  await dialog.getByRole('button', { name: 'Retry same action', exact: true }).click();
  await expect(dialog.getByRole('progressbar', { name: 'Task completion', exact: true })).toHaveAttribute('aria-valuenow', '100');
  await expect(dialog.getByRole('button', { name: 'Retry same action', exact: true })).toHaveCount(0);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[1]).toBe(requestIds[0]);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
