import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { BusinessCommand, MutationResult } from '@pirata/contracts/index';

async function open(page: Page, view: string, projectId?: string) {
  const response = page.waitForResponse(response => response.url().endsWith('/api/v1/session'));
  await page.goto('/tests/module-harness/?' + new URLSearchParams({ module: 'clients-projects', view, ...(projectId ? { projectId } : {}) }));
  if (!(await (await response).json()).authenticated) {
    await page.getByLabel('Fixture password').fill('isolated-harness-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await expect(page.getByTestId('module-view')).toBeVisible();
}

async function command(page: Page, command: BusinessCommand): Promise<MutationResult> {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json();
    const state = await (await fetch('/api/v1/snapshot')).json();
    const result = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: state.revision, command }) });
    if (!result.ok) throw Error('Isolated fixture setup failed: ' + result.status);
    return result.json();
  }, command);
}

test('project sections stay discoverable, keyboard reachable and readable on small phones', async ({ page }) => {
  await open(page, 'ProjectsView');
  const clientId = (await command(page, { type: 'client.create', name: 'Design review client', phone: '', email: '', note: '' })).result.id!;
  const projectId = (await command(page, { type: 'project.create', name: 'Riverside apartment', clientId, clientName: '', address: 'Brooklyn, New York', note: 'Interior repaint. Keep the trim and wall colors together in the project notes.' })).result.id!;
  const first = (await command(page, { type: 'task.create', title: 'Prepare and protect', estimatedMinutes: 0, projectId, note: '' })).result.id!;
  await command(page, { type: 'task.create', title: 'Paint walls and trim', estimatedMinutes: 0, projectId, note: '' });
  await command(page, { type: 'task.setStatus', id: first, status: 'done', expectedSessionId: null });
  await mkdir('artifacts/screenshots/redesign', { recursive: true });

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width >= 768 ? 960 : 844 });
    await open(page, 'ProjectsView');
    await page.getByLabel('Search projects', { exact: true }).fill('Riverside apartment');
    await expect(page.getByRole('progressbar', { name: 'Riverside apartment completion' })).toHaveAttribute('value', '0.5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/redesign/projects-${width}.png`, fullPage: true });
    await open(page, 'ProjectDetail', projectId);
    await expect(page.getByRole('progressbar', { name: 'Project completion', exact: true })).toHaveAttribute('value', '0.5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/redesign/project-overview-${width}.png` });

    const navigation = page.getByRole('navigation', { name: 'Project sections' });
    for (const name of ['Tasks', 'Notes', 'Files', 'Activity', 'Purchases']) {
      const link = navigation.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const files = navigation.getByRole('link', { name: 'Files', exact: true });
    await files.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('[id$="-files"]')).toBeFocused();
    const recover = page.getByRole('button', { name: 'Recover removed', exact: true });
    await expect(recover).toBeVisible();
    const bounds = (await recover.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeLessThanOrEqual(64);
    expect(bounds.width).toBeGreaterThan(110); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/screenshots/redesign/project-files-${width}.png` });
    await recover.click(); await expect(page.getByRole('button', { name: 'Hide removed', exact: true })).toBeVisible();
    await navigation.getByRole('link', { name: 'Tasks', exact: true }).click();
    await expect(page.locator('[id$="-tasks"]')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    await navigation.getByRole('link', { name: 'Purchases', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Purchases', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
