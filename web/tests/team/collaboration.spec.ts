import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const engine = process.env.PIRATA_TEST_WEBKIT ? 'webkit' : 'chromium';
const fixture = (name: string) => fileURLToPath(new URL('../../../server/tests/modules/collaboration/fixtures/' + name, import.meta.url));
async function command(page: Page, command: unknown) { return page.evaluate(async command => { const session = await (await fetch('/api/v1/session')).json(), snapshot = await (await fetch('/api/v1/snapshot')).json(); const response = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: snapshot.revision, command }) }); if (!response.ok) throw Error(await response.text()); return response.json(); }, command); }
async function menu(page: Page, name: string) { await page.setViewportSize({width:390,height:844}); await page.getByRole('navigation').getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name, exact: true }).click(); }
test('photos, PDFs, paint notes, shopping and equipment cleanup stay shared and recoverable', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByLabel('Username', { exact: true }).fill('owner'); await page.getByLabel('Pirata password').fill('isolated-team-browser-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Daily.', exact: true })).toBeVisible();
  const projectId = (await command(page, { type: 'project.create', name: 'Photo project', clientId: null, clientName: '', address: '', note: '' })).result.id;
  const equipmentId = (await command(page, { type: 'equipment.create', name: 'Photo sprayer', note: '' })).result.id;
  await page.reload(); if (await page.getByRole('button', { name: 'Dismiss success message' }).count()) await page.getByRole('button', { name: 'Dismiss success message' }).click(); await menu(page, 'Projects'); await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Photo project', exact: true }) }).getByRole('button', { name: 'View project' }).click();
  await page.getByLabel('Choose photos or PDFs').setInputFiles([fixture('photo.png'), fixture('plan.pdf')]);
  await expect(page.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Download PDF', exact: true })).toBeVisible();
  const links = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Download photo', exact: true }) });
  await links.getByRole('button', { name: 'Remove', exact: true }).click(); await expect(page.getByRole('link', { name: 'Download photo', exact: true })).toHaveCount(0); await page.getByRole('button', { name: 'Recover removed' }).click(); await page.getByRole('button', { name: 'Restore file', exact: true }).click(); await expect(page.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add note', exact: true }).click(); await page.getByLabel('Note title', { exact: true }).fill('Trim supplies'); await page.getByLabel('Remember', { exact: true }).fill('Use the same finish on both doors.'); await page.getByText('Optional paint or supply details', { exact: true }).click(); await page.getByLabel('Product / brand', { exact: true }).fill('Paint brand'); await page.getByLabel('Color code', { exact: true }).fill('101'); await page.getByLabel('Finish / sheen', { exact: true }).fill('Satin'); await page.getByLabel('Pin this note', { exact: true }).check(); await page.getByRole('button', { name: 'Save note', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Pinned · Trim supplies', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to shopping', exact: true }).click(); await menu(page, 'Materials requests'); const request = page.getByRole('listitem').filter({ hasText: 'Trim supplies' }); await expect(request).toBeVisible(); await request.getByRole('button', { name: 'Received', exact: true }).click(); await page.getByRole('group').getByRole('button', { name: 'Received', exact: true }).click(); await expect(page.getByRole('listitem').filter({ hasText: 'Trim supplies' })).toBeVisible();
  await command(page, { type: 'equipment.cleanupRule', id: equipmentId, cleaningMinutes: 15, maxCleaningDelayMinutes: 1440 }); await page.reload(); await menu(page, 'Inventory'); await page.getByRole('button', { name: 'Equipment', exact: true }).click(); await page.getByRole('button', { name: 'View Photo sprayer', exact: true }).click(); await page.getByRole('button', { name: 'Record use', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Clean Photo sprayer', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Record use', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Clean Photo sprayer', exact: true })).toHaveCount(1);
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const width of [320, 390, 768, 1280]) { await page.setViewportSize({ width, height: width < 768 ? 844 : 960 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.getByRole('button', { name: 'Mark cleaned', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/screenshots/team-cleanup-${engine}-${width}.png`, fullPage: true }); }
  await page.getByRole('button', { name: 'Mark cleaned', exact: true }).click(); await expect(page.getByRole('button', { name: 'Mark cleaned', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  if (await page.getByRole('button', { name: 'Dismiss success message' }).count()) await page.getByRole('button', { name: 'Dismiss success message' }).click(); await menu(page, 'Projects'); await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Photo project', exact: true }) }).getByRole('button', { name: 'View project' }).click();
  for (const width of [320, 390, 768, 1280]) { await page.setViewportSize({ width, height: width < 768 ? 844 : 960 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.getByRole('region', { name: 'Photos and PDFs', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/screenshots/team-files-notes-${engine}-${width}.png`, fullPage: true }); await page.getByRole('region', { name: 'Project notes', exact: true }).screenshot({ path: `artifacts/screenshots/team-notes-${engine}-${width}.png` }); }
  const snapshot = await page.evaluate(async () => (await fetch('/api/v1/snapshot')).json()); expect(snapshot.attachments.filter((f: { parentId: string }) => f.parentId === projectId)).toHaveLength(2); expect(snapshot.cleanupObligations.filter((o: { equipmentId: string }) => o.equipmentId === equipmentId)).toHaveLength(1); expect(snapshot.expenses).toHaveLength(0); expect(snapshot.materials).toHaveLength(0); expect(errors).toEqual([]);
});

test('Share update preserves hidden drafts and supports live personal and message filters', async ({ page, browser }) => {
  const marker = 'Updates-' + Date.now();
  const password = 'isolated-team-browser-password';
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Pirata password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily.', exact: true })).toBeVisible();
  await command(page, { type: 'task.create', title: marker + ' task' });
  const username = 'updates-' + Date.now();
  await page.evaluate(async ({ username, password }) => {
    const session = await (await fetch('/api/v1/session')).json();
    const response = await fetch('/api/v1/admin/team', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ name: 'Updates helper', username, password }) });
    if (!response.ok) throw Error('Disposable employee fixture could not be created.');
  }, { username, password });
  await page.reload();
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('button', { name: 'Updates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updates.', exact: true })).toHaveCount(1);
  const activity = page.getByRole('region', { name: 'Team activity', exact: true });
  await expect(activity.getByRole('textbox', { name: 'Share a message', exact: true })).toBeHidden();
  await activity.getByRole('button', { name: 'Share update', exact: true }).click();
  const message = marker + ' owner message';
  await activity.getByRole('textbox', { name: 'Share a message', exact: true }).fill(message);
  await activity.getByRole('button', { name: 'Hide message form', exact: true }).click();
  let discardMessage = '';
  page.once('dialog', async dialog => { discardMessage = dialog.message(); await dialog.dismiss(); });
  await navigation.getByRole('button', { name: 'Daily', exact: true }).click();
  await expect(activity).toBeVisible();
  expect(discardMessage).toContain('discard your unsaved changes');
  await activity.getByRole('button', { name: 'Share update', exact: true }).click();
  await expect(activity.getByRole('textbox', { name: 'Share a message', exact: true })).toHaveValue(message);
  await activity.getByRole('button', { name: 'Post update', exact: true }).click();
  await expect(activity.getByRole('textbox', { name: 'Share a message', exact: true })).toHaveValue('');
  await expect(activity.getByText(message, { exact: true })).toHaveCount(1);
  await activity.getByRole('button', { name: 'Hide message form', exact: true }).click();
  if (await page.getByRole('button', { name: 'Dismiss success message' }).count()) await page.getByRole('button', { name: 'Dismiss success message' }).click();
  await activity.getByRole('button', { name: 'Messages', exact: true }).click();
  await expect(activity.getByText(message, { exact: true })).toBeVisible();
  await expect(activity.locator('.co-feed').getByText(marker + ' task', { exact: false })).toHaveCount(0);

  const worker = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  try {
    const other = await worker.newPage();
    await other.goto(new URL('/', page.url()).href);
    await other.getByLabel('Username', { exact: true }).fill(username);
    await other.getByLabel('Pirata password').fill(password);
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(other.getByRole('heading', { name: 'Daily.', exact: true })).toBeVisible();
    await other.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Updates', exact: true }).click();
    const otherActivity = other.getByRole('region', { name: 'Team activity', exact: true });
    await expect(otherActivity.getByText(message, { exact: true })).toBeVisible();
    await otherActivity.getByRole('button', { name: 'Share update', exact: true }).click();
    const employeeMessage = marker + ' employee message';
    await otherActivity.getByRole('textbox', { name: 'Share a message', exact: true }).fill(employeeMessage);
    await otherActivity.getByRole('button', { name: 'Post update', exact: true }).click();
    await expect(otherActivity.getByRole('textbox', { name: 'Share a message', exact: true })).toHaveValue('');
    await expect(activity.getByText(employeeMessage, { exact: true })).toBeVisible({ timeout: 12000 });
    await expect(activity.getByText(employeeMessage, { exact: true })).toHaveCount(1);
    await activity.getByRole('button', { name: 'My updates', exact: true }).click();
    await expect(activity.getByText(message, { exact: true })).toBeVisible();
    await expect(activity.getByText(employeeMessage, { exact: true })).toHaveCount(0);
    await activity.getByRole('button', { name: 'All', exact: true }).click();
    await expect(activity.getByText(employeeMessage, { exact: true })).toHaveCount(1);
    await mkdir('artifacts/screenshots', { recursive: true });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await activity.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/screenshots/figma-updates-${engine}-${width}.png` });
    }
  } finally { await worker.close(); }
});
