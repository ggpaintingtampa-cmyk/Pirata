import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// This suite uses the disposable team API harness, never production data.
const fixture = (name: string) => fileURLToPath(new URL('../../../server/tests/modules/collaboration/fixtures/' + name, import.meta.url));
const engine = process.env.PIRATA_TEST_WEBKIT ? 'webkit' : 'chromium';
async function command(page: Page, command: unknown) {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json();
    const snapshot = await (await fetch('/api/v1/snapshot')).json();
    const response = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: snapshot.revision, command }) });
    if (!response.ok) throw Error(await response.text());
    return response.json();
  }, command);
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-team-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}
async function menu(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

test('task file controls stay horizontal on small phones and preserve upload/recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await command(page, { type: 'task.create', title: 'Phone file layout check' });
  await page.reload();
  await menu(page, 'All tasks');
  await page.getByRole('button', { name: 'Open task: Phone file layout check', exact: true }).click();
  const files = page.getByRole('dialog').getByRole('region', { name: 'Photos and PDFs' });
  const recovery = files.getByRole('button', { name: 'Recover removed', exact: true });
  await mkdir('artifacts/redesign/after', { recursive: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    await recovery.scrollIntoViewIfNeeded();
    const bounds = await recovery.boundingBox();
    expect(bounds, 'Recovery action must be visible').not.toBeNull();
    expect(bounds!.width, 'Text must not inherit the 44px close-button width').toBeGreaterThan(120);
    expect(bounds!.height, 'Text must not stack vertically').toBeLessThanOrEqual(52);
    expect(await files.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/redesign/after/task-files-${engine}-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(files.getByRole('button', { name: 'Upload files', exact: true })).toBeVisible();
  let releaseUpload!: () => void;
  let uploadStarted!: () => void;
  const held = new Promise<void>(resolve => { releaseUpload = resolve; });
  const started = new Promise<void>(resolve => { uploadStarted = resolve; });
  let heldFirst = false;
  await page.route('**/api/v1/files/*', async route => {
    if (route.request().method() === 'PUT' && !heldFirst) { heldFirst = true; uploadStarted(); await held; }
    await route.continue();
  });
  const chooser = page.waitForEvent('filechooser');
  await files.getByRole('button', { name: 'Upload files', exact: true }).click();
  await (await chooser).setFiles([fixture('photo.png'), fixture('plan.pdf')]);
  await started;
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByText('Your files are still being saved.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Edit task', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Task details', exact: true })).toBeVisible();
  releaseUpload();
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  await expect(files.getByRole('link', { name: 'Download PDF', exact: true })).toBeVisible();
  const photo = files.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Download photo', exact: true }) });
  await photo.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toHaveCount(0);
  await recovery.click();
  await files.getByRole('button', { name: 'Restore file', exact: true }).click();
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/redesign/after/task-files-uploaded-${engine}-390.png` });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Discard unsaved changes?', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('failed uploads keep retry available without trapping the task dialog', async ({ page }) => {
  await login(page);
  await command(page, { type: 'task.create', title: 'Phone upload retry check' });
  await page.reload();
  await menu(page, 'All tasks');
  await page.getByRole('button', { name: 'Open task: Phone upload retry check', exact: true }).click();
  const files = page.getByRole('dialog').getByRole('region', { name: 'Photos and PDFs' });
  let disconnected = false;
  const attemptedIds: string[] = [];
  await page.route('**/api/v1/files/*', async route => {
    if (route.request().method() === 'PUT') {
      attemptedIds.push(new URL(route.request().url()).pathname);
      if (!disconnected) { disconnected = true; await route.abort('failed'); return; }
    }
    await route.continue();
  });
  await files.getByLabel('Choose photos or PDFs', { exact: true }).setInputFiles(fixture('photo.png'));
  await expect(files.getByRole('button', { name: 'Retry upload', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByText('Resolve failed uploads with Retry upload or Dismiss upload before closing.', { exact: true })).toBeVisible();
  await files.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  expect(attemptedIds).toHaveLength(2);
  expect(attemptedIds[0]).toBe(attemptedIds[1]);
  await files.getByLabel('Choose photos or PDFs', { exact: true }).setInputFiles({ name: 'rejected.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(files.getByRole('button', { name: 'Dismiss upload', exact: true })).toBeVisible();
  await files.getByRole('button', { name: 'Dismiss upload', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('nested template Cancel and browser Back leave task details open', async ({ page }) => {
  await login(page);
  await command(page, { type: 'task.create', title: 'Nested dialog check' });
  await page.reload();
  await menu(page, 'All tasks');
  await page.getByRole('button', { name: 'Open task: Nested dialog check', exact: true }).click();
  const task = page.getByRole('dialog', { name: 'Task details', exact: true });
  await task.getByText('Add subtasks quickly', { exact: true }).click();
  await task.getByRole('button', { name: 'Save a reusable list', exact: true }).click();
  const template = page.getByRole('dialog', { name: 'Save task template', exact: true });
  await template.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(template).toHaveCount(0);
  await expect(task).toBeVisible();
  await task.getByRole('button', { name: 'Save a reusable list', exact: true }).click();
  await page.goBack();
  await expect(template).toHaveCount(0);
  await expect(task).toBeVisible();
  await task.getByRole('button', { name: 'Save a reusable list', exact: true }).click();
  await template.getByLabel('Template name', { exact: true }).fill('Unfinished template');
  await template.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(template.getByText('Discard unsaved changes?', { exact: true })).toBeVisible();
  await template.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(template).toHaveCount(0);
  await task.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Files keeps real upload locations, hierarchy, filters and recoverable downloads', async ({ page, browser }) => {
  await login(page);
  const marker = 'Library-' + Date.now();
  const clientId = (await command(page, { type: 'client.create', name: marker + ' client', phone: '', email: '', note: '' })).result.id;
  const projectId = (await command(page, { type: 'project.create', name: marker + ' project', clientId, clientName: '', address: '', note: '' })).result.id;
  const taskId = (await command(page, { type: 'task.create', title: marker + ' task', projectId })).result.id;
  await page.reload();
  await menu(page, 'Files');
  await expect(page.getByRole('heading', { name: 'Files.', exact: true })).toHaveCount(1);
  const library = page.getByRole('region', { name: 'File library', exact: true });
  const context = library.getByRole('combobox', { name: 'View files / upload to', exact: true });
  const files = library.getByRole('region', { name: 'Photos and PDFs', exact: true });
  await expect(context).toHaveValue('');
  await expect(files.getByRole('button', { name: 'Camera', exact: true })).toBeDisabled();
  await files.getByRole('button', { name: 'Choose upload location', exact: true }).click();
  await expect(context).toBeFocused();
  await context.selectOption('project:' + projectId);

  let releaseUpload!: () => void;
  let uploadStarted!: () => void;
  const held = new Promise<void>(resolve => { releaseUpload = resolve; });
  const started = new Promise<void>(resolve => { uploadStarted = resolve; });
  let heldFirst = false;
  await page.route('**/api/v1/files/*', async route => {
    if (route.request().method() === 'PUT' && !heldFirst) { heldFirst = true; uploadStarted(); await held; }
    await route.continue();
  });
  // Image uploads are normalized to safe JPEGs by the existing file service.
  const photoName = marker + '-room.jpg', pdfName = marker + '-plan.pdf', taskPhotoName = marker + '-label.jpg';
  await files.getByLabel('Choose photos or PDFs', { exact: true }).setInputFiles([
    { name: photoName.replace('.jpg', '.png'), mimeType: 'image/png', buffer: await readFile(fixture('photo.png')) },
    { name: pdfName, mimeType: 'application/pdf', buffer: await readFile(fixture('plan.pdf')) },
  ]);
  await started;
  try {
    await expect(context).toBeDisabled();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Work', exact: true }).click();
    await expect(library).toBeVisible();
    await expect(page).toHaveURL(/#\/files$/);
  } finally { releaseUpload(); }
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  await expect(files.getByRole('link', { name: 'Download PDF', exact: true })).toBeVisible();
  await expect(context).toBeEnabled();
  if (await page.getByRole('button', { name: 'Dismiss success message' }).count()) await page.getByRole('button', { name: 'Dismiss success message' }).click();

  await context.selectOption('task:' + taskId);
  await files.getByLabel('Choose photos or PDFs', { exact: true }).setInputFiles({ name: taskPhotoName.replace('.jpg', '.png'), mimeType: 'image/png', buffer: await readFile(fixture('photo.png')) });
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  await expect(context).toBeEnabled();
  await context.selectOption('client:' + clientId);
  await expect(files.locator('.co-files > li')).toHaveCount(3);
  await expect(files.getByText(marker + ' project', { exact: true })).toHaveCount(2);
  await expect(files.getByText(marker + ' task', { exact: true })).toHaveCount(1);
  await context.selectOption('');
  await files.getByRole('searchbox', { name: 'Search files', exact: true }).fill(marker);
  await expect(files.locator('.co-files > li')).toHaveCount(3);
  await files.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(files.locator('.co-files > li')).toHaveCount(2);
  await expect(files.getByRole('link', { name: 'Download PDF', exact: true })).toHaveCount(0);
  await files.getByRole('button', { name: 'PDFs', exact: true }).click();
  await expect(files.locator('.co-files > li')).toHaveCount(1);
  const pdfHref = await files.getByRole('link', { name: 'Download PDF', exact: true }).getAttribute('href');
  const downloadUrl = new URL(pdfHref!, page.url()).href;
  // Use the browser's actual download path: Secure loopback cookies are handled
  // differently by Playwright's standalone HTTP request context.
  const downloadReady = page.waitForEvent('download');
  await files.getByRole('link', { name: 'Download PDF', exact: true }).click();
  const downloaded = await downloadReady;
  expect(await downloaded.failure()).toBeNull();
  expect(downloaded.suggestedFilename()).toBe(pdfName);
  expect(await readFile((await downloaded.path())!)).toEqual(await readFile(fixture('plan.pdf')));
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  try { expect((await anonymous.request.get(downloadUrl)).status()).toBe(401); }
  finally { await anonymous.close(); }

  await files.getByRole('button', { name: 'All files', exact: true }).click();
  await files.getByRole('searchbox', { name: 'Search files', exact: true }).fill(photoName);
  await files.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(files.locator('.co-files > li')).toHaveCount(0);
  await files.getByRole('button', { name: 'Recover removed', exact: true }).click();
  await expect(files.locator('.co-files > li')).toHaveCount(1);
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toHaveCount(0);
  await files.getByRole('button', { name: 'Restore file', exact: true }).click();
  await expect(files.getByRole('link', { name: 'Download photo', exact: true })).toBeVisible();
  await files.getByRole('searchbox', { name: 'Search files', exact: true }).fill(marker);
  await expect(files.locator('.co-files > li')).toHaveCount(3);

  await mkdir('artifacts/redesign/after', { recursive: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    expect(await library.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/redesign/after/figma-files-${engine}-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  let discardPrompts = 0;
  page.on('dialog', async dialog => { discardPrompts += 1; await dialog.dismiss(); });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Updates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updates.', exact: true })).toHaveCount(1);
  const activity = page.getByRole('region', { name: 'Team activity', exact: true });
  await activity.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(activity.getByText('Added ' + photoName, { exact: true })).toBeVisible();
  await expect(activity.getByRole('img', { name: photoName, exact: true })).toBeVisible();
  await expect(activity.getByText('Added ' + pdfName, { exact: true })).toHaveCount(0);
  expect(discardPrompts, 'File search and context selection must not become unsaved business drafts').toBe(0);
  const snapshot = await page.evaluate(async () => (await fetch('/api/v1/snapshot')).json());
  const uploaded = snapshot.attachments.filter((file: { name: string }) => file.name.startsWith(marker));
  expect(uploaded).toHaveLength(3);
  expect(uploaded.filter((file: { parentType: string; parentId: string }) => file.parentType === 'project' && file.parentId === projectId)).toHaveLength(2);
  expect(uploaded.filter((file: { parentType: string; parentId: string }) => file.parentType === 'task' && file.parentId === taskId)).toHaveLength(1);
});
